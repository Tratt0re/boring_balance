import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  closeTestDatabase,
  insertAccounts,
  loadElectronModule,
  openTestDatabase,
} from './helpers/electron-db.js';

// Tests marked `it.fails` describe the DESIRED behavior of a known defect. They pass while the
// defect exists and start failing once it is fixed, which is the signal to turn them into plain `it`.

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPENSE_CATEGORY_ID = 3;

let db;
let cash;
let bank;
let savings;
let plans;
let utils;

beforeEach(() => {
  db = openTestDatabase();
  [cash, bank, savings] = insertAccounts(db, ['Cash', 'Bank', 'Savings']);
  plans = loadElectronModule('electron/controllers/plan-items.controller.js');
  utils = loadElectronModule('electron/controllers/utils.js');
});

afterEach(closeTestDatabase);

// Date helpers use LOCAL fields on purpose: schedules are defined in the user's calendar.
const local = (year, month, day, hour = 0, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).getTime();

const pad = (value) => String(value).padStart(2, '0');
const fmt = (timestamp) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

function withTimeZone(timeZone) {
  let original;
  beforeAll(() => {
    original = process.env.TZ;
    process.env.TZ = timeZone;
  });
  afterAll(() => {
    if (original === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = original;
    }
  });
}

const transactionTemplate = (overrides = {}) => ({
  amount_cents: 1999,
  account_id: cash,
  category_id: EXPENSE_CATEGORY_ID,
  description: 'gym',
  ...overrides,
});

const transferTemplate = (overrides = {}) => ({
  amount_cents: 5000,
  from_account_id: cash,
  to_account_id: bank,
  description: 'save',
  ...overrides,
});

function planPayload({
  type = 'transaction',
  start,
  count = 3,
  unit = 'month',
  interval = 1,
  policy,
  template,
  run = false,
  title = 'Plan',
} = {}) {
  return {
    title,
    type,
    template_json:
      template ?? (type === 'transaction' ? transactionTemplate() : transferTemplate()),
    rule_json: {
      start_date: start,
      count,
      frequency: { unit, interval },
      ...(policy ? { month_policy: policy } : {}),
    },
    ...(run ? { create_and_run: true } : {}),
  };
}

/** Creates a plan, runs it and returns the local-time rendering of every generated occurrence. */
function schedule(options) {
  const { run } = plans.create(planPayload({ ...options, run: true }));
  return run.results.map((entry) => fmt(entry.occurred_at));
}

const createPlan = (options) => plans.create(planPayload(options));
const linkedTransactions = (planId) =>
  db
    .prepare(
      'SELECT * FROM transactions WHERE plan_item_id = ? AND transfer_id IS NULL ORDER BY occurred_at',
    )
    .all(planId);
const linkedTransfers = (planId) =>
  db.prepare('SELECT * FROM transfers WHERE plan_item_id = ? ORDER BY occurred_at').all(planId);
const countRows = (table) => db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get().c;

describe.each(['UTC', 'Europe/Rome', 'America/New_York', 'Pacific/Auckland'])(
  'month and year schedules in %s',
  (timeZone) => {
    withTimeZone(timeZone);

    it('runs in the expected time zone', () => {
      const probe = new Date(2026, 6, 1, 12);
      const expectedOffset = {
        UTC: 0,
        'Europe/Rome': -120,
        'America/New_York': 240,
        'Pacific/Auckland': -720,
      }[timeZone];
      expect(probe.getTimezoneOffset()).toBe(expectedOffset);
    });

    it('steps by calendar months and keeps the time of day', () => {
      expect(schedule({ start: local(2024, 11, 15, 9, 30), count: 4, interval: 3 })).toEqual([
        '2024-11-15 09:30',
        '2025-02-15 09:30',
        '2025-05-15 09:30',
        '2025-08-15 09:30',
      ]);
    });

    it('clip moves a day that does not exist to the last day of the shorter month', () => {
      expect(schedule({ start: local(2024, 1, 31, 9, 30), count: 5, policy: 'clip' })).toEqual([
        '2024-01-31 09:30',
        '2024-02-29 09:30',
        '2024-03-31 09:30',
        '2024-04-30 09:30',
        '2024-05-31 09:30',
      ]);
    });

    it('is the default policy', () => {
      expect(schedule({ start: local(2023, 1, 31), count: 3 })).toEqual(
        schedule({ start: local(2023, 1, 31), count: 3, policy: 'clip' }),
      );
    });

    it('skip leaves out months that lack the day without shortening the schedule', () => {
      expect(schedule({ start: local(2024, 1, 31, 9, 30), count: 5, policy: 'skip' })).toEqual([
        '2024-01-31 09:30',
        '2024-03-31 09:30',
        '2024-05-31 09:30',
        '2024-07-31 09:30',
        '2024-08-31 09:30',
      ]);
    });

    it('last_day always lands on the last day of the month', () => {
      expect(schedule({ start: local(2023, 1, 31, 9, 30), count: 4, policy: 'last_day' })).toEqual([
        '2023-01-31 09:30',
        '2023-02-28 09:30',
        '2023-03-31 09:30',
        '2023-04-30 09:30',
      ]);
    });

    it('last_day differs from clip when the start is mid-month', () => {
      // clip would keep the 10th; only last_day jumps to the end of each month.
      expect(schedule({ start: local(2024, 1, 10, 8, 0), count: 3, policy: 'last_day' })).toEqual([
        '2024-01-31 08:00',
        '2024-02-29 08:00',
        '2024-03-31 08:00',
      ]);
      expect(schedule({ start: local(2024, 1, 10, 8, 0), count: 3, policy: 'clip' })).toEqual([
        '2024-01-10 08:00',
        '2024-02-10 08:00',
        '2024-03-10 08:00',
      ]);
    });

    it('first_day always lands on the first day of the month', () => {
      expect(schedule({ start: local(2024, 1, 31, 9, 30), count: 3, policy: 'first_day' })).toEqual(
        ['2024-01-01 09:30', '2024-02-01 09:30', '2024-03-01 09:30'],
      );
    });

    it('yearly plans step by twelve months and clip Feb 29 outside leap years', () => {
      expect(
        schedule({ start: local(2024, 2, 29), count: 3, unit: 'year', policy: 'clip' }),
      ).toEqual(['2024-02-29 00:00', '2025-02-28 00:00', '2026-02-28 00:00']);
    });

    it('yearly skip keeps only real Feb 29 dates', () => {
      expect(
        schedule({ start: local(2024, 2, 29), count: 2, unit: 'year', policy: 'skip' }),
      ).toEqual(['2024-02-29 00:00', '2028-02-29 00:00']);
    });

    it('crosses year boundaries and large intervals', () => {
      expect(schedule({ start: local(2024, 12, 15), count: 3, interval: 14 })).toEqual([
        '2024-12-15 00:00',
        '2026-02-15 00:00',
        '2027-04-15 00:00',
      ]);
    });

    it('does not move midnight schedules across a DST change', () => {
      expect(schedule({ start: local(2026, 10, 25), count: 3 })).toEqual([
        '2026-10-25 00:00',
        '2026-11-25 00:00',
        '2026-12-25 00:00',
      ]);
    });
  },
);

describe('day and week schedules in UTC', () => {
  withTimeZone('UTC');

  it('steps by whole days', () => {
    expect(schedule({ start: local(2024, 1, 28), count: 4, unit: 'day', interval: 10 })).toEqual([
      '2024-01-28 00:00',
      '2024-02-07 00:00',
      '2024-02-17 00:00',
      '2024-02-27 00:00',
    ]);
  });

  it('steps by whole weeks', () => {
    expect(schedule({ start: local(2024, 3, 18), count: 4, unit: 'week' })).toEqual([
      '2024-03-18 00:00',
      '2024-03-25 00:00',
      '2024-04-01 00:00',
      '2024-04-08 00:00',
    ]);
  });

  it('crosses February in a leap year', () => {
    expect(schedule({ start: local(2024, 2, 27), count: 4, unit: 'day' })).toEqual([
      '2024-02-27 00:00',
      '2024-02-28 00:00',
      '2024-02-29 00:00',
      '2024-03-01 00:00',
    ]);
  });

  it('a single occurrence is the start date itself', () => {
    expect(schedule({ start: local(2024, 5, 5, 8, 15), count: 1, unit: 'week' })).toEqual([
      '2024-05-05 08:15',
    ]);
  });
});

// KNOWN DEFECT (PLAN 3.5): day and week schedules add a fixed number of milliseconds, so after a DST
// change every occurrence drifts by an hour and a "midnight" plan lands on the previous evening.
describe.each(['Europe/Rome', 'America/New_York'])(
  'weekly schedule across the autumn DST change in %s',
  (timeZone) => {
    withTimeZone(timeZone);

    const expected = [
      '2026-10-20 00:00',
      '2026-10-27 00:00',
      '2026-11-03 00:00',
      '2026-11-10 00:00',
    ];

    it.fails('keeps every occurrence at local midnight (PLAN 3.5)', () => {
      expect(schedule({ start: local(2026, 10, 20), count: 4, unit: 'week' })).toEqual(expected);
    });

    it('today the occurrences after the change drift to the previous evening', () => {
      const result = schedule({ start: local(2026, 10, 20), count: 4, unit: 'week' });
      expect(result[0]).toBe('2026-10-20 00:00');
      expect(result.slice(-1)[0]).toMatch(/23:00$/);
    });
  },
);

describe('daily and weekly schedules across the spring DST change in Europe/Rome', () => {
  withTimeZone('Europe/Rome');

  it.fails('keeps weekly occurrences at local midnight (PLAN 3.5)', () => {
    expect(schedule({ start: local(2024, 3, 18), count: 4, unit: 'week' })).toEqual([
      '2024-03-18 00:00',
      '2024-03-25 00:00',
      '2024-04-01 00:00',
      '2024-04-08 00:00',
    ]);
  });

  it.fails('keeps daily occurrences at local midnight (PLAN 3.5)', () => {
    expect(schedule({ start: local(2024, 3, 29), count: 4, unit: 'day' })).toEqual([
      '2024-03-29 00:00',
      '2024-03-30 00:00',
      '2024-03-31 00:00',
      '2024-04-01 00:00',
    ]);
  });
});

describe('create', () => {
  withTimeZone('UTC');

  it('stores parsed template and rule and defaults the month policy for month and year rules', () => {
    const month = createPlan({ start: local(2024, 1, 15), unit: 'month' });
    expect(month.template_json).toEqual(transactionTemplate());
    expect(month.rule_json).toEqual({
      start_date: local(2024, 1, 15),
      count: 3,
      frequency: { unit: 'month', interval: 1 },
      month_policy: 'clip',
    });

    const week = createPlan({ start: local(2024, 1, 15), unit: 'week' });
    expect(week.rule_json).not.toHaveProperty('month_policy');
  });

  it('defaults a missing description to an empty string and keeps an explicit settled flag', () => {
    const plan = createPlan({
      start: local(2024, 1, 15),
      template: {
        amount_cents: 100,
        account_id: cash,
        category_id: EXPENSE_CATEGORY_ID,
        settled: true,
      },
    });
    expect(plan.template_json).toEqual({
      amount_cents: 100,
      account_id: cash,
      category_id: EXPENSE_CATEGORY_ID,
      description: '',
      settled: 1,
    });
  });

  it('does not generate anything unless create_and_run is set', () => {
    createPlan({ start: local(2024, 1, 15) });
    expect(countRows('transactions')).toBe(0);
  });

  it('create_and_run returns the plan row and the run result', () => {
    const result = plans.create(planPayload({ start: local(2024, 1, 15), count: 2, run: true }));
    expect(result.row.id).toBeGreaterThan(0);
    expect(result.run.summary).toEqual({
      total_occurrences: 2,
      skipped_existing: 0,
      would_create: 0,
      created: 2,
    });
    expect(linkedTransactions(result.row.id)).toHaveLength(2);
  });

  describe('validation', () => {
    const start = () => local(2024, 1, 15);
    const base = () => planPayload({ start: start() });
    const withRule = (rule) => ({ ...base(), rule_json: { ...base().rule_json, ...rule } });
    const withTemplate = (template, type = 'transaction') => ({
      ...base(),
      type,
      template_json: template,
    });

    // Every case builds its payload lazily: account ids only exist once beforeEach has run.
    it.each([
      [
        'unknown payload field',
        () => ({ ...base(), extra: 1 }),
        'Unsupported payload field: "extra"',
      ],
      [
        'unknown type',
        () => ({ ...base(), type: 'budget' }),
        'payload.type must be one of: transaction, transfer.',
      ],
      ['empty title', () => ({ ...base(), title: '   ' }), 'payload.title cannot be empty.'],
      [
        'overlong title',
        () => ({ ...base(), title: 'x'.repeat(101) }),
        'payload.title must be at most 100 characters.',
      ],
      ['non-object payload', () => null, 'payload must be a plain object.'],
      [
        'zero count',
        () => withRule({ count: 0 }),
        'payload.rule_json.count must be a positive integer.',
      ],
      [
        'fractional count',
        () => withRule({ count: 1.5 }),
        'payload.rule_json.count must be a positive integer.',
      ],
      [
        'zero interval',
        () => withRule({ frequency: { unit: 'month', interval: 0 } }),
        'payload.rule_json.frequency.interval must be a positive integer.',
      ],
      [
        'unknown unit',
        () => withRule({ frequency: { unit: 'decade', interval: 1 } }),
        'payload.rule_json.frequency.unit must be one of: day, week, month, year.',
      ],
      [
        'missing start date',
        () => withRule({ start_date: undefined }),
        'payload.rule_json.start_date must be a Unix timestamp',
      ],
      [
        'unknown rule field',
        () => withRule({ every: 2 }),
        'Unsupported payload.rule_json field: "every"',
      ],
      [
        'month policy on a weekly rule',
        () => withRule({ frequency: { unit: 'week', interval: 1 }, month_policy: 'clip' }),
        'month_policy is only supported when frequency.unit is "month" or "year".',
      ],
      [
        'unknown month policy',
        () => withRule({ month_policy: 'whenever' }),
        'payload.rule_json.month_policy must be one of: clip, skip, last_day, first_day.',
      ],
      [
        'unknown template field',
        () => withTemplate({ ...transactionTemplate(), tags: [] }),
        'Unsupported payload.template_json field: "tags"',
      ],
      [
        'transaction without an account',
        () => withTemplate(transactionTemplate({ account_id: undefined })),
        'payload.template_json.account_id must be a positive integer.',
      ],
      [
        'transfer to the same account',
        () => withTemplate(transferTemplate({ to_account_id: cash }), 'transfer'),
        'must be different.',
      ],
      [
        'transfer with a zero amount',
        () => withTemplate(transferTemplate({ amount_cents: 0 }), 'transfer'),
        'payload.template_json.amount_cents must be a positive integer.',
      ],
      [
        'transaction with a fractional amount',
        () => withTemplate(transactionTemplate({ amount_cents: 10.5 })),
        'payload.template_json.amount_cents must be an integer.',
      ],
      [
        'overlong description',
        () => withTemplate(transactionTemplate({ description: 'x'.repeat(76) })),
        'payload.template_json.description must be at most 75 characters.',
      ],
    ])('rejects %s', (_label, buildPayload, message) => {
      expect(() => plans.create(buildPayload())).toThrow(message);
      expect(countRows('plan_items')).toBe(0);
    });
  });
});

describe('run', () => {
  withTimeZone('UTC');

  // Date.UTC, not local(): this runs while vitest collects tests, before withTimeZone('UTC') applies.
  const start = Date.UTC(2024, 0, 15);

  it('creates one transaction per occurrence, linked to the plan, with the template values', () => {
    const plan = createPlan({ start, count: 3 });
    const result = plans.run(plan.id);

    expect(result.summary).toMatchObject({ total_occurrences: 3, created: 3, skipped_existing: 0 });
    expect(result.dry_run).toBe(false);
    expect(result.results.map((entry) => entry.status)).toEqual(['created', 'created', 'created']);

    const rows = linkedTransactions(plan.id);
    expect(rows.map((row) => fmt(row.occurred_at))).toEqual([
      '2024-01-15 00:00',
      '2024-02-15 00:00',
      '2024-03-15 00:00',
    ]);
    for (const row of rows) {
      expect(row).toMatchObject({
        account_id: cash,
        category_id: EXPENSE_CATEGORY_ID,
        amount_cents: 1999,
        description: 'gym',
        plan_item_id: plan.id,
      });
    }
  });

  it('is idempotent: a second run creates nothing and reports every occurrence as existing', () => {
    const plan = createPlan({ start, count: 3 });
    plans.run(plan.id);

    const second = plans.run(plan.id);

    expect(second.summary).toMatchObject({ created: 0, skipped_existing: 3, total_occurrences: 3 });
    expect(second.results.map((entry) => entry.status)).toEqual([
      'skipped_existing',
      'skipped_existing',
      'skipped_existing',
    ]);
    expect(linkedTransactions(plan.id)).toHaveLength(3);
  });

  it('recreates only the occurrences that were deleted', () => {
    const plan = createPlan({ start, count: 4 });
    plans.run(plan.id);
    const [, second] = linkedTransactions(plan.id);
    db.prepare('DELETE FROM transactions WHERE id = ?').run(second.id);

    const rerun = plans.run(plan.id);

    expect(rerun.summary).toMatchObject({ created: 1, skipped_existing: 3 });
    expect(linkedTransactions(plan.id)).toHaveLength(4);
  });

  it('extends the schedule when the count is raised, without touching existing rows', () => {
    const plan = createPlan({ start, count: 2 });
    plans.run(plan.id);
    const original = linkedTransactions(plan.id).map((row) => row.id);

    plans.update({
      id: plan.id,
      changes: { rule_json: { ...plan.rule_json, count: 4 } },
    });
    const rerun = plans.run(plan.id);

    expect(rerun.summary).toMatchObject({ created: 2, skipped_existing: 2 });
    expect(
      linkedTransactions(plan.id)
        .slice(0, 2)
        .map((row) => row.id),
    ).toEqual(original);
  });

  it('ignores manual transactions on the same day because they are not linked to the plan', () => {
    const plan = createPlan({ start, count: 1 });
    db.prepare(
      'INSERT INTO transactions (account_id, category_id, occurred_at, amount_cents) VALUES (?, ?, ?, ?)',
    ).run(cash, EXPENSE_CATEGORY_ID, start, 1999);

    const result = plans.run(plan.id);

    expect(result.summary.created).toBe(1);
    expect(countRows('transactions')).toBe(2);
  });

  it('keeps plans independent of each other', () => {
    const first = createPlan({ start, count: 2 });
    const second = createPlan({
      start,
      count: 2,
      template: transactionTemplate({ amount_cents: 500 }),
    });

    plans.run(first.id);
    plans.run(second.id);

    expect(linkedTransactions(first.id).map((row) => row.amount_cents)).toEqual([1999, 1999]);
    expect(linkedTransactions(second.id).map((row) => row.amount_cents)).toEqual([500, 500]);
  });

  it('turns template cents into the same cents in the database (negative amounts included)', () => {
    const plan = createPlan({
      start,
      count: 1,
      template: transactionTemplate({ amount_cents: -123456 }),
    });
    plans.run(plan.id);
    expect(linkedTransactions(plan.id)[0].amount_cents).toBe(-123456);
  });

  it('survives the cents to amount to cents conversion without drift', () => {
    // The run path converts amount_cents / 100 back to cents through normalizeAmountToCents.
    const drifted = [];
    for (let cents = -200000; cents <= 200000; cents += 1) {
      if (utils.normalizeAmountToCents(cents / 100, 'a') !== cents) {
        drifted.push(cents);
      }
    }
    expect(drifted).toEqual([]);
  });

  it('uses the database default for settled unless the template says otherwise', () => {
    const unsettled = createPlan({ start, count: 1 });
    const settled = createPlan({
      start,
      count: 1,
      template: transactionTemplate({ settled: true }),
    });
    plans.run(unsettled.id);
    plans.run(settled.id);

    expect(linkedTransactions(unsettled.id)[0].settled).toBe(0);
    expect(linkedTransactions(settled.id)[0].settled).toBe(1);
  });

  it('refuses unknown plans and unexpected payload fields', () => {
    expect(() => plans.run(999)).toThrow('Plan item not found for id 999.');
    expect(() => plans.run({ id: 1, force: true })).toThrow('Unsupported payload field: "force"');
    expect(() => plans.run(0)).toThrow('id must be a positive integer.');
  });

  describe('transfer plans', () => {
    it('creates a transfer with both legs per occurrence and is idempotent', () => {
      const plan = createPlan({ type: 'transfer', start, count: 3, unit: 'week', interval: 2 });

      const first = plans.run(plan.id);
      expect(first.summary.created).toBe(3);
      expect(first.results.map((entry) => entry.created.type)).toEqual([
        'transfer',
        'transfer',
        'transfer',
      ]);
      expect(linkedTransfers(plan.id)).toHaveLength(3);
      expect(
        db.prepare('SELECT COUNT(*) c FROM transactions WHERE plan_item_id = ?').get(plan.id).c,
      ).toBe(6);

      const second = plans.run(plan.id);
      expect(second.summary).toMatchObject({ created: 0, skipped_existing: 3 });
      expect(second.results[0].existing).toHaveProperty('transfer_id');
      expect(linkedTransfers(plan.id)).toHaveLength(3);
    });

    it('moves exactly the template amount from one account to the other', () => {
      const plan = createPlan({ type: 'transfer', start, count: 2, unit: 'day' });
      plans.run(plan.id);

      const balance = (accountId) =>
        db
          .prepare('SELECT COALESCE(SUM(amount_cents), 0) s FROM transactions WHERE account_id = ?')
          .get(accountId).s;
      expect(balance(cash)).toBe(-10000);
      expect(balance(bank)).toBe(10000);
    });
  });

  // KNOWN DEFECTS (PLAN 3.4): the run loop and create_and_run are not wrapped in one transaction.
  describe('failure handling', () => {
    const failOnOccurrence = (timestamp) =>
      db.exec(`
        CREATE TRIGGER fail_one_occurrence BEFORE INSERT ON transactions
        WHEN NEW.occurred_at = ${timestamp}
        BEGIN SELECT RAISE(ABORT, 'boom occurrence'); END;
      `);

    it('surfaces the failure to the caller', () => {
      const plan = createPlan({ start, count: 5, unit: 'day' });
      failOnOccurrence(start + 3 * DAY_MS);

      expect(() => plans.run(plan.id)).toThrow('boom occurrence');
    });

    it.fails('leaves nothing behind when an occurrence fails (PLAN 3.4)', () => {
      const plan = createPlan({ start, count: 5, unit: 'day' });
      failOnOccurrence(start + 3 * DAY_MS);

      expect(() => plans.run(plan.id)).toThrow('boom occurrence');

      expect(linkedTransactions(plan.id)).toHaveLength(0);
    });

    it('today the occurrences created before the failure stay, and a re-run completes the rest', () => {
      const plan = createPlan({ start, count: 5, unit: 'day' });
      failOnOccurrence(start + 3 * DAY_MS);
      expect(() => plans.run(plan.id)).toThrow('boom occurrence');
      expect(linkedTransactions(plan.id)).toHaveLength(3);

      db.exec('DROP TRIGGER fail_one_occurrence');
      const rerun = plans.run(plan.id);

      expect(rerun.summary).toMatchObject({ created: 2, skipped_existing: 3 });
      expect(linkedTransactions(plan.id)).toHaveLength(5);
    });

    it.fails(
      'create_and_run does not leave a plan item behind when the run fails (PLAN 3.4)',
      () => {
        failOnOccurrence(start + 3 * DAY_MS);

        expect(() =>
          plans.create(planPayload({ start, count: 5, unit: 'day', run: true })),
        ).toThrow('boom occurrence');

        expect(countRows('plan_items')).toBe(0);
      },
    );

    it.fails('rejects an absurd occurrence count instead of accepting it (PLAN 3.4)', () => {
      expect(() => createPlan({ start, count: 10_000_000, unit: 'day' })).toThrow();
    });
  });
});

describe('update', () => {
  withTimeZone('UTC');

  // Date.UTC, not local(): this runs while vitest collects tests, before withTimeZone('UTC') applies.
  const start = Date.UTC(2024, 0, 15);
  const rowsByDate = (planId) =>
    Object.fromEntries(
      linkedTransactions(planId).map((row) => [fmt(row.occurred_at).slice(0, 10), row]),
    );

  it('changes only the title without touching generated rows', () => {
    const plan = createPlan({ start, count: 2, run: true }).row;
    const [first] = linkedTransactions(plan.id);
    db.prepare('UPDATE transactions SET amount_cents = 777 WHERE id = ?').run(first.id);

    const result = plans.update({ id: plan.id, changes: { title: 'Renamed' } });

    expect(result.row.title).toBe('Renamed');
    expect(result.row.updated_at).toBeGreaterThan(0);
    expect(linkedTransactions(plan.id)[0].amount_cents).toBe(777);
  });

  it('does not overwrite manual edits when the template is resent unchanged', () => {
    const plan = createPlan({ start, count: 2, run: true }).row;
    const [first] = linkedTransactions(plan.id);
    db.prepare('UPDATE transactions SET amount_cents = 777 WHERE id = ?').run(first.id);

    plans.update({ id: plan.id, changes: { title: 'Same', template_json: transactionTemplate() } });

    expect(linkedTransactions(plan.id)[0].amount_cents).toBe(777);
  });

  describe('linked items scope', () => {
    // A function, not a constant: account ids only exist after beforeEach has run.
    const newTemplate = () => transactionTemplate({ amount_cents: 5000, description: 'new' });

    function setup(count = 4) {
      const plan = createPlan({ start, count, run: true }).row;
      // A manual transaction that must never be touched.
      db.prepare(
        'INSERT INTO transactions (account_id, category_id, occurred_at, amount_cents, description) VALUES (?, ?, ?, ?, ?)',
      ).run(cash, EXPENSE_CATEGORY_ID, start, 1999, 'manual');
      return plan;
    }

    const manualRow = () =>
      db.prepare("SELECT * FROM transactions WHERE description = 'manual'").get();

    it('all (the default) rewrites every linked row', () => {
      const plan = setup();

      plans.update({ id: plan.id, changes: { template_json: newTemplate() } });

      expect(linkedTransactions(plan.id).map((row) => row.amount_cents)).toEqual([
        5000, 5000, 5000, 5000,
      ]);
      expect(linkedTransactions(plan.id).map((row) => row.description)).toEqual(
        Array(4).fill('new'),
      );
      expect(manualRow().amount_cents).toBe(1999);
    });

    it('all overwrites manual edits made to linked rows', () => {
      const plan = setup();
      const [first] = linkedTransactions(plan.id);
      db.prepare('UPDATE transactions SET amount_cents = 777 WHERE id = ?').run(first.id);

      plans.update({ id: plan.id, changes: { template_json: newTemplate() } });

      expect(linkedTransactions(plan.id)[0].amount_cents).toBe(5000);
    });

    it('from_date rewrites rows on or after the date only', () => {
      const plan = setup();

      plans.update({
        id: plan.id,
        changes: { template_json: newTemplate() },
        linked_items: { scope: 'from_date', from_date: local(2024, 3, 15) },
      });

      const byDate = rowsByDate(plan.id);
      expect(byDate['2024-01-15'].amount_cents).toBe(1999);
      expect(byDate['2024-02-15'].amount_cents).toBe(1999);
      expect(byDate['2024-03-15'].amount_cents).toBe(5000);
      expect(byDate['2024-04-15'].amount_cents).toBe(5000);
    });

    it('rule_only leaves every generated row as it was', () => {
      const plan = setup();

      plans.update({
        id: plan.id,
        changes: { template_json: newTemplate() },
        linked_items: { scope: 'rule_only' },
      });

      expect(linkedTransactions(plan.id).map((row) => row.amount_cents)).toEqual(
        Array(4).fill(1999),
      );
      expect(plans.get(plan.id).template_json.amount_cents).toBe(5000);
    });

    it('upcoming rewrites only rows from now on', () => {
      const past = createPlan({ start: local(2000, 1, 1), count: 3, run: true }).row;
      const future = createPlan({ start: local(2090, 1, 1), count: 3, run: true }).row;

      plans.update({
        id: past.id,
        changes: { template_json: newTemplate() },
        linked_items: { scope: 'upcoming' },
      });
      plans.update({
        id: future.id,
        changes: { template_json: newTemplate() },
        linked_items: { scope: 'upcoming' },
      });

      expect(linkedTransactions(past.id).map((row) => row.amount_cents)).toEqual([
        1999, 1999, 1999,
      ]);
      expect(linkedTransactions(future.id).map((row) => row.amount_cents)).toEqual([
        5000, 5000, 5000,
      ]);
    });

    it('after rewriting, a run does not duplicate the rewritten rows', () => {
      const plan = setup();
      plans.update({ id: plan.id, changes: { template_json: newTemplate() } });

      expect(plans.run(plan.id).summary).toMatchObject({ created: 0, skipped_existing: 4 });
    });

    it('rewrites a transfer plan, preserving the sign of each leg and the account pairing', () => {
      const plan = createPlan({ type: 'transfer', start, count: 2, unit: 'week', run: true }).row;

      plans.update({
        id: plan.id,
        changes: {
          template_json: transferTemplate({
            amount_cents: 9000,
            to_account_id: savings,
            description: 'moved',
          }),
        },
      });

      expect(
        linkedTransfers(plan.id).map((row) => [
          row.from_account_id,
          row.to_account_id,
          row.amount_cents,
        ]),
      ).toEqual([
        [cash, savings, 9000],
        [cash, savings, 9000],
      ]);
      const legs = db
        .prepare(
          'SELECT account_id, amount_cents FROM transactions WHERE plan_item_id = ? ORDER BY id',
        )
        .all(plan.id);
      expect(legs).toEqual([
        { account_id: cash, amount_cents: -9000 },
        { account_id: savings, amount_cents: 9000 },
        { account_id: cash, amount_cents: -9000 },
        { account_id: savings, amount_cents: 9000 },
      ]);
    });

    it.each([
      [{ scope: 'from_date' }, 'payload.linked_items.from_date must be a Unix timestamp'],
      [{ scope: 'all', from_date: 5 }, 'from_date is only supported when scope is "from_date".'],
      [
        { scope: 'later' },
        'payload.linked_items.scope must be one of: all, upcoming, from_date, rule_only.',
      ],
      [{ scope: 'all', extra: 1 }, 'Unsupported payload.linked_items field: "extra"'],
    ])('rejects linked_items %j', (linkedItems, message) => {
      const plan = createPlan({ start, count: 1 });
      expect(() =>
        plans.update({
          id: plan.id,
          changes: { template_json: newTemplate() },
          linked_items: linkedItems,
        }),
      ).toThrow(message);
    });
  });

  describe('immutable and invalid changes', () => {
    it('cannot change the type', () => {
      const plan = createPlan({ start });
      expect(() => plans.update({ id: plan.id, changes: { type: 'transfer' } })).toThrow(
        'payload.changes.type cannot be updated.',
      );
    });

    it('cannot change the start date but can change the rest of the rule', () => {
      const plan = createPlan({ start, count: 2 });
      expect(() =>
        plans.update({
          id: plan.id,
          changes: { rule_json: { ...plan.rule_json, start_date: start + 1 } },
        }),
      ).toThrow('payload.changes.rule_json.start_date cannot be updated.');

      // month_policy only applies to month and year rules, so it has to go when the unit becomes weekly.
      const { month_policy: _monthPolicy, ...weeklyRule } = plan.rule_json;
      const result = plans.update({
        id: plan.id,
        changes: {
          rule_json: { ...weeklyRule, count: 6, frequency: { unit: 'week', interval: 2 } },
        },
      });
      expect(result.row.rule_json).toMatchObject({
        count: 6,
        frequency: { unit: 'week', interval: 2 },
      });
    });

    it('rejects empty changes, unknown fields and unknown plans', () => {
      const plan = createPlan({ start });
      expect(() => plans.update({ id: plan.id, changes: {} })).toThrow(
        'payload.changes cannot be empty.',
      );
      expect(() => plans.update({ id: plan.id, changes: { color: 'red' } })).toThrow(
        'Unsupported payload.changes field: "color"',
      );
      expect(() => plans.update({ id: 999, changes: { title: 'x' } })).toThrow(
        'Plan item not found for id 999.',
      );
      expect(() => plans.update({ id: plan.id, changes: { title: 'x' }, force: true })).toThrow(
        'Unsupported payload field: "force"',
      );
    });
  });
});

describe('remove and deletePlannedItems', () => {
  withTimeZone('UTC');

  // Date.UTC, not local(): this runs while vitest collects tests, before withTimeZone('UTC') applies.
  const start = Date.UTC(2024, 0, 15);

  it('removes the plan and keeps the rows it generated', () => {
    const plan = createPlan({ start, count: 3, run: true }).row;

    expect(plans.remove(plan.id)).toEqual({ changed: 1 });

    expect(plans.get(plan.id)).toBeNull();
    expect(linkedTransactions(plan.id)).toHaveLength(3);
  });

  it('with delete_planned_items it also deletes generated transactions, transfers and their legs', () => {
    const transactionPlan = createPlan({ start, count: 3, run: true }).row;
    const transferPlan = createPlan({
      type: 'transfer',
      start,
      count: 2,
      unit: 'week',
      run: true,
    }).row;
    const otherPlan = createPlan({ start, count: 2, run: true, title: 'Other' }).row;
    db.prepare(
      'INSERT INTO transactions (account_id, category_id, occurred_at, amount_cents) VALUES (?, ?, ?, ?)',
    ).run(cash, EXPENSE_CATEGORY_ID, start, 1);

    const result = plans.remove({ id: transferPlan.id, delete_planned_items: true });

    expect(result).toMatchObject({
      changed: 1,
      deleted_planned_items: {
        deleted_transfers: 2,
        deleted_transfer_transaction_rows: 4,
        deleted_transactions: 0,
        total_deleted_rows: 6,
      },
    });
    expect(countRows('transfers')).toBe(0);
    expect(linkedTransactions(transactionPlan.id)).toHaveLength(3);
    expect(linkedTransactions(otherPlan.id)).toHaveLength(2);
    expect(countRows('transactions')).toBe(3 + 2 + 1);

    const transactionResult = plans.remove({ id: transactionPlan.id, delete_planned_items: true });
    expect(transactionResult.deleted_planned_items).toMatchObject({ deleted_transactions: 3 });
    expect(countRows('transactions')).toBe(2 + 1);
  });

  it('deletePlannedItems clears generated rows but keeps the plan, so a run regenerates them', () => {
    const plan = createPlan({ start, count: 3, run: true }).row;

    expect(plans.deletePlannedItems(plan.id)).toMatchObject({
      deleted_transactions: 3,
      total_deleted_rows: 3,
    });
    expect(plans.get(plan.id)).toBeTruthy();
    expect(plans.run(plan.id).summary.created).toBe(3);
  });

  it('rolls everything back when deleting generated rows fails', () => {
    const plan = createPlan({ type: 'transfer', start, count: 2, unit: 'week', run: true }).row;
    db.exec(`
      CREATE TRIGGER fail_transfer_delete BEFORE DELETE ON transfers
      BEGIN SELECT RAISE(ABORT, 'boom delete'); END;
    `);
    const before = [countRows('plan_items'), countRows('transfers'), countRows('transactions')];

    expect(() => plans.remove({ id: plan.id, delete_planned_items: true })).toThrow('boom delete');

    expect([countRows('plan_items'), countRows('transfers'), countRows('transactions')]).toEqual(
      before,
    );
  });

  it('reports no change for an unknown plan and validates its payload', () => {
    expect(plans.remove(999)).toEqual({ changed: 0 });
    expect(() => plans.remove({ id: 1, hard: true })).toThrow('Unsupported payload field: "hard"');
    expect(() => plans.remove({ id: 1, delete_planned_items: 'yes' })).toThrow(
      'payload.delete_planned_items must be a boolean or 0/1.',
    );
  });
});

describe('get and list', () => {
  withTimeZone('UTC');

  // Date.UTC, not local(): this runs while vitest collects tests, before withTimeZone('UTC') applies.
  const start = Date.UTC(2024, 0, 15);

  it('get returns the parsed plan or null', () => {
    const plan = createPlan({ start });
    expect(plans.get(plan.id).template_json).toEqual(transactionTemplate());
    expect(plans.get(plan.id + 100)).toBeNull();
    expect(() => plans.get(0)).toThrow('id must be a positive integer.');
  });

  it('list returns newest first, filters by type and paginates', () => {
    const a = createPlan({ start, title: 'A' });
    const b = createPlan({ start, title: 'B', type: 'transfer' });
    const c = createPlan({ start, title: 'C' });

    expect(plans.list().rows.map((row) => row.id)).toEqual([c.id, b.id, a.id]);
    expect(plans.list({ filters: { type: 'transfer' } })).toMatchObject({
      total: 1,
      rows: [{ id: b.id }],
    });
    const page = plans.list({ page: 2, page_size: 2 });
    expect(page).toMatchObject({ total: 3, page: 2, page_size: 2 });
    expect(page.rows.map((row) => row.id)).toEqual([a.id]);
    expect(() => plans.list({ filters: { type: 'budget' } })).toThrow(
      'payload.filters.type must be one of: transaction, transfer.',
    );
  });

  it('list parses template and rule for every row', () => {
    createPlan({ start });
    const [row] = plans.list().rows;
    expect(typeof row.template_json).toBe('object');
    expect(typeof row.rule_json).toBe('object');
  });
});
