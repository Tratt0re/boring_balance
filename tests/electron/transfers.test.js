import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeTestDatabase,
  insertAccounts,
  loadElectronModule,
  openTestDatabase,
  readChangeCounter,
  snapshotTables,
} from './helpers/electron-db.js';

const TRANSFER_CATEGORY_ID = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY0 = Date.UTC(2024, 0, 10, 12);

let db;
let cash;
let bank;
let savings;
let transfers;
let transactions;
let transfersModel;

beforeEach(() => {
  db = openTestDatabase();
  [cash, bank, savings] = insertAccounts(db, ['Cash', 'Bank', 'Savings']);
  transfers = loadElectronModule('electron/controllers/transactions/transfers.controller.js');
  transactions = loadElectronModule('electron/controllers/transactions/transactions.controller.js');
  transfersModel = loadElectronModule('electron/models/transactions/transfers.model.js');
});

afterEach(closeTestDatabase);

function createTransfer(overrides = {}, options) {
  return transfers.create(
    {
      occurred_at: DAY0,
      from_account_id: cash,
      to_account_id: bank,
      amount: 12.5,
      ...overrides,
    },
    options,
  );
}

function updatePayload(transferId, overrides = {}) {
  return {
    transfer_id: transferId,
    occurred_at: DAY0,
    from_account_id: cash,
    to_account_id: bank,
    amount: 12.5,
    ...overrides,
  };
}

const legsOf = (transferId) =>
  db.prepare('SELECT * FROM transactions WHERE transfer_id = ? ORDER BY id').all(transferId);

const transferRow = (transferId) =>
  db.prepare('SELECT * FROM transfers WHERE id = ?').get(transferId);

const countRows = (table) => db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get().c;

// Every transfer moves money between two of the user's own accounts, so the legs must cancel out.
const sumOfTransferLegs = () =>
  db
    .prepare('SELECT COALESCE(SUM(amount_cents), 0) AS s FROM transactions WHERE category_id = ?')
    .get(TRANSFER_CATEGORY_ID).s;

describe('create', () => {
  it('writes one transfer row and two opposite legs sharing the transfer id', () => {
    const result = createTransfer({ description: 'rent', occurred_at: DAY0 });

    expect(result.transfer_id).toBe(result.transfer.id);
    expect(result.transfer).toMatchObject({
      from_account_id: cash,
      to_account_id: bank,
      amount_cents: 1250,
      description: 'rent',
      occurred_at: DAY0,
      settled: 1,
    });

    const legs = legsOf(result.transfer_id);
    expect(legs).toHaveLength(2);
    const outgoing = legs.find((leg) => leg.amount_cents < 0);
    const incoming = legs.find((leg) => leg.amount_cents > 0);
    expect(outgoing).toMatchObject({ account_id: cash, amount_cents: -1250 });
    expect(incoming).toMatchObject({ account_id: bank, amount_cents: 1250 });
    for (const leg of legs) {
      expect(leg.category_id).toBe(TRANSFER_CATEGORY_ID);
      expect(leg.occurred_at).toBe(DAY0);
      expect(leg.settled).toBe(1);
      expect(leg.description).toBeNull();
      expect(JSON.parse(leg.tags)).toEqual([]);
    }

    expect(result.transactions.map((leg) => leg.id)).toEqual([outgoing.id, incoming.id]);
  });

  it('keeps the legs cancelling out across many transfers', () => {
    createTransfer({ amount: 0.01 });
    createTransfer({ amount: 99.99, from_account_id: bank, to_account_id: savings });
    createTransfer({ amount: 1234.56, from_account_id: savings, to_account_id: cash });

    expect(countRows('transfers')).toBe(3);
    expect(countRows('transactions')).toBe(6);
    expect(sumOfTransferLegs()).toBe(0);
  });

  it('defaults to settled and applies an explicit unsettled flag to the row and both legs', () => {
    const settled = createTransfer();
    expect(settled.transfer.settled).toBe(1);

    const unsettled = createTransfer({ settled: false });
    expect(unsettled.transfer.settled).toBe(0);
    expect(legsOf(unsettled.transfer_id).map((leg) => leg.settled)).toEqual([0, 0]);
  });

  it('records a plan item on the transfer and both legs without exposing it publicly', () => {
    const result = createTransfer({}, { plan_item_id: 7 });

    expect(result.transfer).not.toHaveProperty('plan_item_id');
    expect(transferRow(result.transfer_id).plan_item_id).toBe(7);
    expect(legsOf(result.transfer_id).map((leg) => leg.plan_item_id)).toEqual([7, 7]);
  });

  it.each([
    [{ amount: 0 }, 'payload.amount must be a positive number.'],
    [{ amount: -5 }, 'payload.amount must be a positive number.'],
    [
      { to_account_id: undefined, from_account_id: undefined },
      'payload.from_account_id must be a positive integer.',
    ],
    [
      { to_account_id: 1, from_account_id: 1 },
      'payload.from_account_id and payload.to_account_id must be different.',
    ],
    [{ occurred_at: undefined }, 'payload.occurred_at must be a Unix timestamp in milliseconds.'],
    [{ description: 'x'.repeat(76) }, 'payload.description must be at most 75 characters.'],
    [{ category_id: 3 }, 'Unsupported payload field: "category_id"'],
    [{ amount: '12' }, 'payload.amount must be a number.'],
  ])('rejects %j and writes nothing', (overrides, message) => {
    const before = snapshotTables(db);

    expect(() => createTransfer(overrides)).toThrow(message);

    expect(snapshotTables(db)).toBe(before);
  });

  it('rejects a payload that is not an object', () => {
    expect(() => transfers.create(null)).toThrow('payload must be a plain object.');
    expect(() => transfers.create([])).toThrow('payload must be a plain object.');
    expect(countRows('transfers')).toBe(0);
  });

  it('rejects an unknown account through the foreign key and leaves nothing behind', () => {
    const before = snapshotTables(db);

    expect(() => createTransfer({ to_account_id: 999 })).toThrow('FOREIGN KEY constraint failed');
    expect(() => createTransfer({ from_account_id: 999 })).toThrow('FOREIGN KEY constraint failed');

    expect(snapshotTables(db)).toBe(before);
  });

  describe('atomicity', () => {
    it('rolls back the transfer row and the first leg when the second leg fails', () => {
      db.exec(`
        CREATE TRIGGER fail_incoming_leg BEFORE INSERT ON transactions
        WHEN NEW.amount_cents > 0 AND NEW.category_id = ${TRANSFER_CATEGORY_ID}
        BEGIN SELECT RAISE(ABORT, 'boom incoming'); END;
      `);
      const before = snapshotTables(db);

      expect(() => createTransfer()).toThrow('boom incoming');

      expect(snapshotTables(db)).toBe(before);
      expect(countRows('transfers')).toBe(0);
      expect(countRows('transactions')).toBe(0);
    });

    it('rolls back the transfer row when the first leg fails', () => {
      db.exec(`
        CREATE TRIGGER fail_outgoing_leg BEFORE INSERT ON transactions
        WHEN NEW.amount_cents < 0
        BEGIN SELECT RAISE(ABORT, 'boom outgoing'); END;
      `);
      const before = snapshotTables(db);

      expect(() => createTransfer()).toThrow('boom outgoing');

      expect(snapshotTables(db)).toBe(before);
    });

    it('does not advance the change counter for a failed transfer', () => {
      createTransfer();
      const counter = readChangeCounter(db);
      db.exec(`
        CREATE TRIGGER fail_incoming_leg BEFORE INSERT ON transactions
        WHEN NEW.amount_cents > 0 BEGIN SELECT RAISE(ABORT, 'boom'); END;
      `);

      expect(() => createTransfer()).toThrow('boom');

      expect(readChangeCounter(db)).toBe(counter);
    });

    it('counts one change per row written by a successful transfer', () => {
      const before = readChangeCounter(db);
      createTransfer();
      expect(readChangeCounter(db)).toBe(before + 3);
    });

    it('can create again after a failure', () => {
      db.exec(`
        CREATE TRIGGER fail_incoming_leg BEFORE INSERT ON transactions
        WHEN NEW.amount_cents > 0 BEGIN SELECT RAISE(ABORT, 'boom'); END;
      `);
      expect(() => createTransfer()).toThrow('boom');
      db.exec('DROP TRIGGER fail_incoming_leg');

      createTransfer();

      expect(countRows('transfers')).toBe(1);
      expect(sumOfTransferLegs()).toBe(0);
    });
  });

  describe('database constraints (bypassing the controller)', () => {
    const model = (overrides) =>
      transfersModel.create({
        from_account_id: cash,
        to_account_id: bank,
        occurred_at: DAY0,
        amount_cents: 500,
        created_at: 1,
        ...overrides,
      });

    it('refuses a zero amount', () => {
      expect(() => model({ amount_cents: 0 })).toThrow('CHECK constraint failed: amount_cents > 0');
      expect(countRows('transfers')).toBe(0);
    });

    it('refuses a transfer to the same account', () => {
      expect(() => model({ to_account_id: cash })).toThrow(
        'CHECK constraint failed: from_account_id <> to_account_id',
      );
      expect(countRows('transfers')).toBe(0);
    });

    it('stores a negative amount as its absolute value', () => {
      const result = model({ amount_cents: -500 });
      expect(result.transfer.amount_cents).toBe(500);
      expect(sumOfTransferLegs()).toBe(0);
    });
  });
});

describe('update', () => {
  it('moves the transfer and both legs together', () => {
    const { transfer_id: id, transfer } = createTransfer({ description: 'old' });

    const result = transfers.update(
      updatePayload(id, {
        occurred_at: DAY0 + DAY_MS,
        from_account_id: savings,
        to_account_id: cash,
        amount: 40,
        description: 'new',
      }),
    );

    expect(result.transfer).toMatchObject({
      from_account_id: savings,
      to_account_id: cash,
      amount_cents: 4000,
      description: 'new',
      occurred_at: DAY0 + DAY_MS,
      created_at: transfer.created_at,
    });
    expect(result.transfer.updated_at).toBeGreaterThan(0);

    const legs = legsOf(id);
    expect(legs.find((leg) => leg.amount_cents < 0)).toMatchObject({
      account_id: savings,
      amount_cents: -4000,
      occurred_at: DAY0 + DAY_MS,
    });
    expect(legs.find((leg) => leg.amount_cents > 0)).toMatchObject({
      account_id: cash,
      amount_cents: 4000,
    });
    expect(sumOfTransferLegs()).toBe(0);
    expect(countRows('transactions')).toBe(2);
  });

  it('keeps the settled state when omitted and applies it to both legs when given', () => {
    const { transfer_id: id } = createTransfer({ settled: false });

    transfers.update(updatePayload(id, { amount: 20 }));
    expect(transferRow(id).settled).toBe(0);
    expect(legsOf(id).map((leg) => leg.settled)).toEqual([0, 0]);

    transfers.update(updatePayload(id, { amount: 20, settled: true }));
    expect(transferRow(id).settled).toBe(1);
    expect(legsOf(id).map((leg) => leg.settled)).toEqual([1, 1]);
  });

  it('does not touch other transfers', () => {
    const { transfer_id: first } = createTransfer({ amount: 10 });
    const { transfer_id: second } = createTransfer({ amount: 20 });
    const secondBefore = JSON.stringify([transferRow(second), legsOf(second)]);

    transfers.update(updatePayload(first, { amount: 99 }));

    expect(JSON.stringify([transferRow(second), legsOf(second)])).toBe(secondBefore);
  });

  it('rolls everything back when the second leg update fails', () => {
    const { transfer_id: id } = createTransfer();
    db.exec(`
      CREATE TRIGGER fail_incoming_update BEFORE UPDATE ON transactions
      WHEN NEW.amount_cents > 0 AND NEW.category_id = ${TRANSFER_CATEGORY_ID}
      BEGIN SELECT RAISE(ABORT, 'boom update'); END;
    `);
    const before = snapshotTables(db);

    expect(() =>
      transfers.update(updatePayload(id, { amount: 99, to_account_id: savings })),
    ).toThrow('boom update');

    expect(snapshotTables(db)).toBe(before);
    expect(transferRow(id).amount_cents).toBe(1250);
  });

  it('refuses an unknown transfer and writes nothing', () => {
    createTransfer();
    const before = snapshotTables(db);

    expect(() => transfers.update(updatePayload('nope'))).toThrow(
      'Transfer not found for transfer_id "nope".',
    );

    expect(snapshotTables(db)).toBe(before);
  });

  it('refuses to update a transfer whose leg is missing, and changes nothing', () => {
    const { transfer_id: id } = createTransfer();
    db.prepare('DELETE FROM transactions WHERE transfer_id = ? AND amount_cents > 0').run(id);
    const before = snapshotTables(db);

    expect(() => transfers.update(updatePayload(id, { amount: 99 }))).toThrow(
      `Transfer transactions not found for transfer_id "${id}".`,
    );

    expect(snapshotTables(db)).toBe(before);
  });

  it.each([
    [{ amount: 0 }, 'payload.amount must be a positive number.'],
    [{ amount: -1 }, 'payload.amount must be a positive number.'],
    [{ to_account_id: 1, from_account_id: 1 }, 'must be different.'],
    [{ to_account_id: 999 }, 'FOREIGN KEY constraint failed'],
  ])('rejects %j and leaves the transfer untouched', (overrides, message) => {
    const { transfer_id: id } = createTransfer();
    const before = snapshotTables(db);

    expect(() => transfers.update(updatePayload(id, overrides))).toThrow(message);

    expect(snapshotTables(db)).toBe(before);
  });

  it('requires a transfer id', () => {
    expect(() => transfers.update(updatePayload(undefined))).toThrow(
      'transfer_id must be a string.',
    );
    expect(() => transfers.update(updatePayload('   '))).toThrow('transfer_id cannot be empty.');
  });
});

describe('remove', () => {
  it('deletes the transfer row and both legs', () => {
    const { transfer_id: id } = createTransfer();

    expect(transfers.remove(id)).toEqual({ changed: 1 });

    expect(transferRow(id)).toBeUndefined();
    expect(legsOf(id)).toEqual([]);
    expect(countRows('transactions')).toBe(0);
  });

  it('accepts the id inside an object too', () => {
    const { transfer_id: id } = createTransfer();
    expect(transfers.remove({ transfer_id: id })).toEqual({ changed: 1 });
  });

  it('leaves other transfers and regular transactions alone', () => {
    const { transfer_id: doomed } = createTransfer();
    const { transfer_id: kept } = createTransfer({ amount: 3 });
    const plain = transactions.create({
      occurred_at: DAY0,
      account_id: cash,
      category_id: 3,
      amount: -4.2,
    });

    transfers.remove(doomed);

    expect(legsOf(kept)).toHaveLength(2);
    expect(transferRow(kept)).toBeTruthy();
    expect(transactions.get(plain.id)).toBeTruthy();
    expect(sumOfTransferLegs()).toBe(0);
  });

  it('reports 0 changes for an unknown transfer and deletes nothing', () => {
    createTransfer();
    const before = snapshotTables(db);

    expect(transfers.remove('nope')).toEqual({ changed: 0 });

    expect(snapshotTables(db)).toBe(before);
  });

  it('restores the legs when deleting the transfer row fails', () => {
    const { transfer_id: id } = createTransfer();
    db.exec(`
      CREATE TRIGGER fail_transfer_delete BEFORE DELETE ON transfers
      BEGIN SELECT RAISE(ABORT, 'boom delete'); END;
    `);
    const before = snapshotTables(db);

    expect(() => transfers.remove(id)).toThrow('boom delete');

    expect(snapshotTables(db)).toBe(before);
    expect(legsOf(id)).toHaveLength(2);
  });

  it('requires a non-empty id', () => {
    expect(() => transfers.remove('   ')).toThrow('transfer_id cannot be empty.');
    expect(() => transfers.remove(undefined)).toThrow('payload must be a plain object.');
  });
});

describe('list', () => {
  let ids;

  beforeEach(() => {
    ids = {
      t1: createTransfer({
        occurred_at: DAY0,
        from_account_id: cash,
        to_account_id: bank,
        amount: 10,
      }),
      t2: createTransfer({
        occurred_at: DAY0 + DAY_MS,
        from_account_id: bank,
        to_account_id: savings,
        amount: 25.5,
        settled: false,
      }),
      t3: createTransfer({
        occurred_at: DAY0 + 2 * DAY_MS,
        from_account_id: savings,
        to_account_id: cash,
        amount: 5,
      }),
      t4: createTransfer({
        occurred_at: DAY0 + 3 * DAY_MS,
        from_account_id: cash,
        to_account_id: savings,
        amount: 100,
      }),
      t5: createTransfer(
        {
          occurred_at: DAY0 + 4 * DAY_MS,
          from_account_id: bank,
          to_account_id: cash,
          amount: 1,
        },
        { plan_item_id: 9 },
      ),
    };
  });

  const idsOf = (result) => result.rows.map((row) => row.id);
  const expected = (...keys) => keys.map((key) => ids[key].transfer_id);

  it('returns the newest transfers first and hides the plan item', () => {
    const result = transfers.list();

    expect(result.total).toBe(5);
    expect(idsOf(result)).toEqual(expected('t5', 't4', 't3', 't2', 't1'));
    for (const row of result.rows) {
      expect(row).not.toHaveProperty('plan_item_id');
    }
  });

  it('paginates and clamps a page beyond the last one', () => {
    const second = transfers.list({ page: 2, page_size: 2 });
    expect(idsOf(second)).toEqual(expected('t3', 't2'));
    expect(second).toMatchObject({ total: 5, page: 2, page_size: 2 });

    const beyond = transfers.list({ page: 99, page_size: 2 });
    expect(idsOf(beyond)).toEqual(expected('t1'));
    expect(beyond.page).toBe(3);
  });

  it('returns an empty first page when there are no transfers', () => {
    db.exec('DELETE FROM transfers; DELETE FROM transactions;');
    expect(transfers.list({ page: 4 })).toEqual({ rows: [], total: 0, page: 1, page_size: 10 });
  });

  it('matches an account on either side of the transfer', () => {
    expect(idsOf(transfers.list({ filters: { accounts: [savings] } }))).toEqual(
      expected('t4', 't3', 't2'),
    );
    expect(idsOf(transfers.list({ filters: { accounts: [bank, savings] } }))).toEqual(
      expected('t5', 't4', 't3', 't2', 't1'),
    );
  });

  it('returns nothing for an empty account selection', () => {
    expect(transfers.list({ filters: { accounts: [] } })).toMatchObject({ rows: [], total: 0 });
  });

  it('paginates after the account filter', () => {
    const result = transfers.list({ filters: { accounts: [savings] }, page: 2, page_size: 2 });
    expect(idsOf(result)).toEqual(expected('t2'));
    expect(result).toMatchObject({ total: 3, page: 2 });
  });

  it('filters by an inclusive date range', () => {
    const result = transfers.list({
      filters: { date_from: DAY0 + DAY_MS, date_to: DAY0 + 3 * DAY_MS },
    });
    expect(idsOf(result)).toEqual(expected('t4', 't3', 't2'));
  });

  it('filters by amount range using absolute cents', () => {
    const result = transfers.list({ filters: { amount_from: 5, amount_to: 25.5 } });
    expect(idsOf(result)).toEqual(expected('t3', 't2', 't1'));
    expect(idsOf(transfers.list({ filters: { amount_from: -100 } }))).toEqual(expected('t4'));
  });

  it('filters by settled state and plan item', () => {
    expect(idsOf(transfers.list({ filters: { settled: false } }))).toEqual(expected('t2'));
    expect(idsOf(transfers.list({ filters: { plan_item_id: 9 } }))).toEqual(expected('t5'));
    expect(transfers.list({ filters: { plan_item_id: 10 } }).total).toBe(0);
  });

  it('combines filters with AND', () => {
    const result = transfers.list({
      filters: { accounts: [cash], settled: true, amount_from: 50 },
    });
    expect(idsOf(result)).toEqual(expected('t4'));
  });

  it('rejects unknown filters and oversized pages', () => {
    expect(() => transfers.list({ filters: { category: 1 } })).toThrow(
      'Unsupported payload.filters field: "category"',
    );
    expect(() => transfers.list({ page_size: 251 })).toThrow(
      'payload.page_size cannot be greater than 250.',
    );
    expect(() => transfers.list({ filters: { accounts: [0] } })).toThrow(
      'payload.filters.accounts[0] must be a positive integer.',
    );
  });
});

// KNOWN ISSUES (PLAN 3.8). The generic transactions API knows nothing about transfers, so it can
// leave a transfer half-edited. These tests describe what happens TODAY. Once the API refuses to
// touch transfer legs they will start failing: replace each with an assertion that the call throws.
describe('transfer legs through the generic transactions API (known issues, PLAN 3.8)', () => {
  const legs = (id) => {
    const rows = legsOf(id);
    return {
      outgoing: rows.find((row) => row.amount_cents < 0) ?? rows[0],
      incoming: rows.find((row) => row.amount_cents > 0) ?? rows[1],
    };
  };

  it('lets a single leg be edited, so the pair stops cancelling out', () => {
    const { transfer_id: id } = createTransfer({ amount: 12.5 });
    expect(sumOfTransferLegs()).toBe(0);

    transactions.update({ id: legs(id).outgoing.id, changes: { amount: 500 } });

    expect(sumOfTransferLegs()).not.toBe(0);
    expect(transferRow(id).amount_cents).toBe(1250);
  });

  it('lets a leg be detached, after which the transfer can no longer be edited', () => {
    const { transfer_id: id } = createTransfer();

    transactions.update({ id: legs(id).outgoing.id, changes: { transfer_id: null } });

    expect(() => transfers.update(updatePayload(id, { amount: 3 }))).toThrow(
      'Transfer transactions not found',
    );
  });

  it('lets a single leg be deleted, orphaning the transfer row', () => {
    const { transfer_id: id } = createTransfer();

    expect(transactions.remove(legs(id).incoming.id)).toEqual({ changed: 1 });

    expect(transferRow(id)).toBeTruthy();
    expect(legsOf(id)).toHaveLength(1);
    expect(sumOfTransferLegs()).not.toBe(0);
    // Removing the transfer still cleans up what is left.
    expect(transfers.remove(id)).toEqual({ changed: 1 });
    expect(sumOfTransferLegs()).toBe(0);
  });

  it('accepts a transfer-category row that belongs to no transfer', () => {
    const row = transactions.create({
      occurred_at: DAY0,
      account_id: cash,
      category_id: TRANSFER_CATEGORY_ID,
      amount: 5,
    });

    expect(row.transfer_id).toBeNull();
    expect(sumOfTransferLegs()).toBe(500);
    expect(countRows('transfers')).toBe(0);
  });
});
