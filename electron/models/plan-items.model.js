const { createBaseModel } = require('./base-model');
const { deleteRows, getDatabase, selectRows, updateRows } = require('../database');
const { TRANSFER_CATEGORY_ID } = require('./transactions/constants');

const planItemsBaseModel = createBaseModel('plan_items');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MONTH_POLICY = 'clip';

function parseJsonObjectField(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a JSON string in storage.`);
  }

  let parsedValue;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    throw new Error(`${label} contains invalid JSON.`);
  }

  if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
    throw new Error(`${label} must decode to a JSON object.`);
  }

  return parsedValue;
}

function normalizePlanItemRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    template_json: parseJsonObjectField(row.template_json, `plan_items(${row.id}).template_json`),
    rule_json: parseJsonObjectField(row.rule_json, `plan_items(${row.id}).rule_json`),
  };
}

function normalizePlanItemRows(rows) {
  return rows.map((row) => normalizePlanItemRow(row));
}

function getById(id) {
  return normalizePlanItemRow(planItemsBaseModel.getById(id));
}

function list(where = {}, listOptions = {}) {
  return normalizePlanItemRows(planItemsBaseModel.list(where, listOptions));
}

function getDaysInUtcMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function buildMonthOrYearOccurrence(rule, candidateIndex) {
  const startDate = new Date(Number(rule.start_date));
  // Use local calendar parts so a local "1st of month" doesn't anchor as the previous UTC month-end.
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth();
  const startDay = startDate.getDate();
  const startHour = startDate.getHours();
  const startMinute = startDate.getMinutes();
  const startSecond = startDate.getSeconds();
  const startMillisecond = startDate.getMilliseconds();

  const frequency = rule.frequency ?? {};
  const interval = Number(frequency.interval);
  const unit = frequency.unit;
  const monthPolicy = rule.month_policy ?? DEFAULT_MONTH_POLICY;
  const monthStep = unit === 'year' ? interval * 12 : interval;
  const totalMonths = startMonth + monthStep * candidateIndex;
  const targetYear = startYear + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const targetMonthDays = getDaysInUtcMonth(targetYear, targetMonth);

  let dayOfMonth = startDay;
  if (monthPolicy === 'last_day') {
    dayOfMonth = targetMonthDays;
  } else if (monthPolicy === 'first_day') {
    dayOfMonth = 1;
  } else if (startDay > targetMonthDays) {
    if (monthPolicy === 'skip') {
      return null;
    }

    dayOfMonth = targetMonthDays;
  }

  return new Date(
    targetYear,
    targetMonth,
    dayOfMonth,
    startHour,
    startMinute,
    startSecond,
    startMillisecond,
  ).getTime();
}

function generatePlanOccurrenceTimestamps(rule) {
  const occurrences = [];
  const count = Number(rule.count);
  const frequency = rule.frequency ?? {};

  if (frequency.unit === 'day' || frequency.unit === 'week') {
    const unitMultiplier = frequency.unit === 'week' ? 7 : 1;
    const stepMs = DAY_MS * unitMultiplier * Number(frequency.interval);

    for (let index = 0; index < count; index += 1) {
      occurrences.push(Number(rule.start_date) + stepMs * index);
    }

    return occurrences;
  }

  let candidateIndex = 0;
  while (occurrences.length < count) {
    const occurrenceTimestamp = buildMonthOrYearOccurrence(rule, candidateIndex);
    if (occurrenceTimestamp !== null) {
      occurrences.push(occurrenceTimestamp);
    }

    candidateIndex += 1;
    if (candidateIndex > count * 5000) {
      throw new Error('Failed to generate plan occurrences from rule_json.');
    }
  }

  return occurrences;
}

function buildExistingOccurrencesMapForPlan(database, planItem) {
  if (planItem.type === 'transaction') {
    const rows = selectRows(database, 'transactions', {
      plan_item_id: planItem.id,
      transfer_id: { isNull: true },
    });

    return new Map(rows.map((row) => [Number(row.occurred_at), row]));
  }

  if (planItem.type === 'transfer') {
    const rows = selectRows(database, 'transfers', {
      plan_item_id: planItem.id,
    });

    return new Map(rows.map((row) => [Number(row.occurred_at), row]));
  }

  throw new Error(`Unsupported plan item type "${planItem.type}".`);
}

function buildRunResultEntryForSkippedExisting(planItem, occurredAt, existingRow) {
  if (planItem.type === 'transaction') {
    return {
      occurred_at: occurredAt,
      status: 'skipped_existing',
      existing: {
        id: Number(existingRow.id),
        occurred_at: Number(existingRow.occurred_at),
      },
    };
  }

  return {
    occurred_at: occurredAt,
    status: 'skipped_existing',
    existing: {
      transfer_id: String(existingRow.id),
      occurred_at: Number(existingRow.occurred_at),
    },
  };
}

function run(planItemId, options = {}) {
  const planItem = getById(planItemId);
  if (!planItem) {
    throw new Error(`Plan item not found for id ${planItemId}.`);
  }

  const database = getDatabase();
  const occurrenceTimestamps = generatePlanOccurrenceTimestamps(planItem.rule_json);
  const existingOccurrencesMap = buildExistingOccurrencesMapForPlan(database, planItem);
  const injectedCreateTransaction = typeof options.createTransaction === 'function' ? options.createTransaction : null;
  const injectedCreateTransfer = typeof options.createTransfer === 'function' ? options.createTransfer : null;

  if (planItem.type === 'transaction' && !injectedCreateTransaction) {
    throw new Error('Plan run requires options.createTransaction for transaction plans.');
  }

  if (planItem.type === 'transfer' && !injectedCreateTransfer) {
    throw new Error('Plan run requires options.createTransfer for transfer plans.');
  }

  const results = [];
  let skippedExisting = 0;
  let created = 0;

  for (const occurredAt of occurrenceTimestamps) {
    const existingRow = existingOccurrencesMap.get(Number(occurredAt));
    if (existingRow) {
      skippedExisting += 1;
      results.push(buildRunResultEntryForSkippedExisting(planItem, occurredAt, existingRow));
      continue;
    }

    if (planItem.type === 'transaction') {
      const transaction = injectedCreateTransaction(planItem, occurredAt);
      results.push({
        occurred_at: occurredAt,
        status: 'created',
        created: {
          type: 'transaction',
          row: transaction,
        },
      });
    } else if (planItem.type === 'transfer') {
      const transferResult = injectedCreateTransfer(planItem, occurredAt);
      results.push({
        occurred_at: occurredAt,
        status: 'created',
        created: {
          type: 'transfer',
          ...transferResult,
        },
      });
    } else {
      throw new Error(`Unsupported plan item type "${planItem.type}".`);
    }

    created += 1;
    existingOccurrencesMap.set(Number(occurredAt), { occurred_at: occurredAt });
  }

  return {
    plan_item: planItem,
    dry_run: false,
    summary: {
      total_occurrences: occurrenceTimestamps.length,
      skipped_existing: skippedExisting,
      would_create: 0,
      created,
    },
    results,
  };
}

function buildLinkedTransactionChangesFromPlanTemplate(templateJson, updatedAt) {
  const changes = {
    account_id: Number(templateJson.account_id),
    category_id: Number(templateJson.category_id),
    amount_cents: Number(templateJson.amount_cents),
    description: templateJson.description ?? null,
    updated_at: updatedAt,
  };

  if (templateJson.settled !== undefined) {
    changes.settled = Number(templateJson.settled);
  }

  return changes;
}

function buildLinkedTransferChangesFromPlanTemplate(templateJson, updatedAt) {
  const amountCents = Math.abs(Number(templateJson.amount_cents));
  const baseTransferChanges = {
    from_account_id: Number(templateJson.from_account_id),
    to_account_id: Number(templateJson.to_account_id),
    amount_cents: amountCents,
    description: templateJson.description ?? null,
    updated_at: updatedAt,
  };

  if (templateJson.settled !== undefined) {
    baseTransferChanges.settled = Number(templateJson.settled);
  }

  return {
    transfer: baseTransferChanges,
    outgoingTransaction: {
      account_id: Number(templateJson.from_account_id),
      category_id: TRANSFER_CATEGORY_ID,
      amount_cents: -amountCents,
      description: null,
      updated_at: updatedAt,
      ...(templateJson.settled !== undefined ? { settled: Number(templateJson.settled) } : {}),
    },
    incomingTransaction: {
      account_id: Number(templateJson.to_account_id),
      category_id: TRANSFER_CATEGORY_ID,
      amount_cents: amountCents,
      description: null,
      updated_at: updatedAt,
      ...(templateJson.settled !== undefined ? { settled: Number(templateJson.settled) } : {}),
    },
  };
}

function applyTemplateChangesToLinkedPlannedItems(database, planItem, updatedAt) {
  if (!planItem?.template_json) {
    return;
  }

  if (planItem.type === 'transaction') {
    updateRows(
      database,
      'transactions',
      buildLinkedTransactionChangesFromPlanTemplate(planItem.template_json, updatedAt),
      {
        plan_item_id: Number(planItem.id),
        transfer_id: { isNull: true },
      },
    );
    return;
  }

  if (planItem.type === 'transfer') {
    const transferTemplateChanges = buildLinkedTransferChangesFromPlanTemplate(planItem.template_json, updatedAt);

    updateRows(database, 'transfers', transferTemplateChanges.transfer, {
      plan_item_id: Number(planItem.id),
    });

    updateRows(database, 'transactions', transferTemplateChanges.outgoingTransaction, {
      plan_item_id: Number(planItem.id),
      transfer_id: { isNull: false },
      category_id: TRANSFER_CATEGORY_ID,
      amount_cents: { lt: 0 },
    });

    updateRows(database, 'transactions', transferTemplateChanges.incomingTransaction, {
      plan_item_id: Number(planItem.id),
      transfer_id: { isNull: false },
      category_id: TRANSFER_CATEGORY_ID,
      amount_cents: { gt: 0 },
    });
    return;
  }

  throw new Error(`Unsupported plan item type "${planItem.type}".`);
}

function updateById(planItemId, changes) {
  const database = getDatabase();
  const updatePlanItemTx = database.transaction((payload) => {
    const changed = planItemsBaseModel.updateById(planItemId, payload);
    if (changed <= 0) {
      return changed;
    }

    if (payload.template_json !== undefined) {
      const updatedPlanItem = getById(planItemId);
      const updatedAt = Number(payload.updated_at ?? Date.now());
      applyTemplateChangesToLinkedPlannedItems(database, updatedPlanItem, updatedAt);
    }

    return changed;
  });

  return updatePlanItemTx(changes);
}

function deletePlannedItemsInternal(database, planItemId) {
  const plannedTransfers = selectRows(database, 'transfers', {
    plan_item_id: planItemId,
  });

  let deletedTransferTransactionRows = 0;
  let deletedTransfers = 0;

  for (const transferRow of plannedTransfers) {
    deletedTransferTransactionRows += deleteRows(database, 'transactions', {
      transfer_id: String(transferRow.id),
      category_id: TRANSFER_CATEGORY_ID,
    });
    deletedTransfers += deleteRows(database, 'transfers', {
      id: String(transferRow.id),
    });
  }

  const deletedTransactions = deleteRows(database, 'transactions', {
    plan_item_id: planItemId,
    transfer_id: { isNull: true },
  });

  return {
    plan_item_id: planItemId,
    deleted_transactions: deletedTransactions,
    deleted_transfers: deletedTransfers,
    deleted_transfer_transaction_rows: deletedTransferTransactionRows,
    total_deleted_rows: deletedTransactions + deletedTransfers + deletedTransferTransactionRows,
  };
}

function deletePlannedItems(planItemId) {
  const database = getDatabase();
  const deletePlannedItemsTx = database.transaction((id) => deletePlannedItemsInternal(database, id));
  return deletePlannedItemsTx(planItemId);
}

function removePlanItem(planItemId, options = {}) {
  const database = getDatabase();
  const removePlanItemTx = database.transaction((payload) => {
    const shouldDeletePlannedItems = payload.delete_planned_items === true;
    const deletedPlannedItems = shouldDeletePlannedItems
      ? deletePlannedItemsInternal(database, payload.id)
      : null;
    const changed = planItemsBaseModel.deleteById(payload.id);

    return {
      changed,
      ...(shouldDeletePlannedItems ? { deleted_planned_items: deletedPlannedItems } : {}),
    };
  });

  return removePlanItemTx({
    id: planItemId,
    delete_planned_items: options.delete_planned_items === true,
  });
}

module.exports = {
  ...planItemsBaseModel,
  getById,
  list,
  updateById,
  run,
  deletePlannedItems,
  removePlanItem,
};
