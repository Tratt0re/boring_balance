import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeTestDatabase,
  insertAccounts,
  loadElectronModule,
  openTestDatabase,
} from './helpers/electron-db.js';

// Deleting an account or category that still has rows used to surface SQLite's raw
// "FOREIGN KEY constraint failed". It now says what is in the way, and deletes nothing.

const EXPENSE_CATEGORY_ID = 3;

let db;
let accounts;
let categories;
let transactions;
let cash;
let bank;

beforeEach(() => {
  db = openTestDatabase();
  [cash, bank] = insertAccounts(db, ['Cash', 'Bank']);
  accounts = loadElectronModule('electron/controllers/accounts.controller.js');
  categories = loadElectronModule('electron/controllers/categories.controller.js');
  transactions = loadElectronModule('electron/controllers/transactions/transactions.controller.js');
});

afterEach(closeTestDatabase);

const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const addTransaction = (accountId, categoryId = EXPENSE_CATEGORY_ID) =>
  transactions.create({
    occurred_at: Date.UTC(2024, 0, 1),
    account_id: accountId,
    category_id: categoryId,
    amount: 5,
  });
const makeCategory = (name, parentId = null) =>
  Number(
    db
      .prepare(
        "INSERT INTO categories (name, parent_id, color_key, icon, type, locked, archived) VALUES (?, ?, 'c', 'i', 'expense', 0, 0)",
      )
      .run(name, parentId).lastInsertRowid,
  );

describe('deleting an account that is in use', () => {
  it('says it has transactions, and deletes nothing', () => {
    addTransaction(cash);

    expect(() => accounts.remove(cash)).toThrow(/account.*transactions|transactions.*account/i);

    expect(count('accounts')).toBe(2);
    expect(count('transactions')).toBe(1);
  });

  it('never shows the raw database error', () => {
    addTransaction(cash);

    expect(() => accounts.remove(cash)).toThrow(/^(?!.*(FOREIGN KEY|constraint)).*$/is);
  });

  // A bare transfer row, with no leg transactions, so only the transfer reference is in the way.
  const insertBareTransfer = (from, to) =>
    db
      .prepare(
        "INSERT INTO transfers (id, from_account_id, to_account_id, occurred_at, amount_cents) VALUES ('t1', ?, ?, 1, 100)",
      )
      .run(from, to);

  it('says it is part of a transfer when it is the sender', () => {
    insertBareTransfer(cash, bank);

    expect(() => accounts.remove(cash)).toThrow(/transfer/i);
    expect(count('accounts')).toBe(2);
  });

  it('says it is part of a transfer when it is the receiver', () => {
    insertBareTransfer(cash, bank);

    expect(() => accounts.remove(bank)).toThrow(/transfer/i);
    expect(count('accounts')).toBe(2);
  });

  it('counts the transfers on both sides together', () => {
    insertBareTransfer(cash, bank);
    db.prepare(
      "INSERT INTO transfers (id, from_account_id, to_account_id, occurred_at, amount_cents) VALUES ('t2', ?, ?, 1, 100)",
    ).run(bank, cash);

    expect(() => accounts.remove(cash)).toThrow(/2 transfer/i);
  });

  it('says it has balance history', () => {
    db.prepare(
      'INSERT INTO account_valuations (account_id, value_cents, valued_at, created_at) VALUES (?, 100, 1, 1)',
    ).run(cash);

    expect(() => accounts.remove(cash)).toThrow(/valuation|balance/i);
    expect(count('accounts')).toBe(2);
  });

  it('still deletes an account nothing refers to', () => {
    expect(accounts.remove(cash)).toEqual({ changed: 1 });
    expect(count('accounts')).toBe(1);
  });

  it('still says nothing was deleted for an account that does not exist', () => {
    expect(accounts.remove(999999)).toEqual({ changed: 0 });
  });

  it('still refuses a locked account first', () => {
    db.prepare('UPDATE accounts SET locked = 1 WHERE id = ?').run(cash);
    addTransaction(cash);

    expect(() => accounts.remove(cash)).toThrow('Locked accounts cannot be deleted.');
  });
});

describe('deleting a category that is in use', () => {
  it('says it has transactions, and deletes nothing', () => {
    const own = makeCategory('Own');
    addTransaction(cash, own);

    expect(() => categories.remove(own)).toThrow(/category.*transactions|transactions.*category/i);

    expect(count('transactions')).toBe(1);
    expect(db.prepare('SELECT id FROM categories WHERE id = ?').get(own)).toBeTruthy();
  });

  it('says it has subcategories, and deletes nothing', () => {
    const parent = makeCategory('Parent');
    const child = makeCategory('Child', parent);

    expect(() => categories.remove(parent)).toThrow(/subcategor|child/i);

    expect(
      db.prepare('SELECT id FROM categories WHERE id IN (?, ?)').all(parent, child),
    ).toHaveLength(2);
  });

  it('never shows the raw database error', () => {
    const own = makeCategory('Own');
    addTransaction(cash, own);

    expect(() => categories.remove(own)).toThrow(/^(?!.*(FOREIGN KEY|constraint)).*$/is);
  });

  it('still deletes a category nothing refers to', () => {
    const own = makeCategory('Own');

    expect(categories.remove(own)).toEqual({ changed: 1 });
  });

  it('still says nothing was deleted for a category that does not exist', () => {
    expect(categories.remove(999999)).toEqual({ changed: 0 });
  });

  it('still refuses a locked category first', () => {
    expect(() => categories.remove(EXPENSE_CATEGORY_ID)).toThrow(
      'Locked categories cannot be deleted.',
    );
  });
});
