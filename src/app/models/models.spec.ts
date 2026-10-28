import type {
  AccountDto,
  AccountValuationDto,
  BudgetDto,
  CategoryDto,
  PlanItemDto,
  TransactionDto,
  TransferDto,
} from '@/dtos';
import { DEFAULT_VISUAL_COLOR_KEY, DEFAULT_VISUAL_ICON_KEY } from '@/config/visual-options.config';

import { AccountValuationModel } from './account-valuations.model';
import { AccountModel } from './accounts.model';
import { BudgetModel } from './budgets.model';
import { CategoryModel } from './categories.model';
import {
  amountToCents,
  centsToAmount,
  normalizeVisualColorKey,
  normalizeVisualIconKey,
  toBooleanFlag,
  toSqliteBooleanFlag,
} from './common.model';
import { PlanItemModel } from './plan-items.model';
import { TransactionModel } from './transactions.model';
import { TransferModel } from './transfers.model';

describe('common.model', () => {
  describe('centsToAmount / amountToCents', () => {
    it.each([
      [0, 0],
      [1, 0.01],
      [150, 1.5],
      [-150, -1.5],
      [123456789, 1234567.89],
    ])('converts %i cents to %d', (cents, amount) => {
      expect(centsToAmount(cents)).toBe(amount);
      expect(amountToCents(amount)).toBe(cents);
    });

    it('round-trips every cent value a user can realistically enter', () => {
      const drifted: number[] = [];
      for (let cents = -300_000; cents <= 300_000; cents += 1) {
        if (amountToCents(centsToAmount(cents)) !== cents) {
          drifted.push(cents);
        }
      }
      expect(drifted).toEqual([]);
    });

    it('rounds half cents away from zero for positive amounts', () => {
      expect(amountToCents(0.005)).toBe(1);
      expect(amountToCents(2.675)).toBe(268);
    });

    // The main process (normalizeAmountToCents) rounds half cents away from zero; so does this, so a
    // value converted here is never one cent off from what the main process would store.
    it('rounds negative half cents away from zero, like the main process', () => {
      expect(amountToCents(-0.005)).toBe(-1);
      expect(amountToCents(-0.015)).toBe(-2);
      expect(amountToCents(-2.675)).toBe(-268);
      expect(amountToCents(-1234567.895)).toBe(-123456790);
    });

    it('is symmetric: the negative of an amount converts to the negative of its cents', () => {
      for (const amount of [0.005, 0.015, 0.07, 2.675, 3.14, 99.99, 1234.565, 1234567.895]) {
        expect(amountToCents(-amount)).toBe(-amountToCents(amount));
      }
    });

    it('never returns negative zero', () => {
      expect(Object.is(amountToCents(-0.004), 0)).toBe(true);
      expect(Object.is(amountToCents(-0), 0)).toBe(true);
      expect(Object.is(amountToCents(0), 0)).toBe(true);
    });

    it('does not guard against NaN or Infinity', () => {
      expect(amountToCents(Number.NaN)).toBeNaN();
      expect(amountToCents(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    });
  });

  describe('flags', () => {
    it('maps SQLite 0/1 to booleans and back', () => {
      expect(toBooleanFlag(1)).toBe(true);
      expect(toBooleanFlag(0)).toBe(false);
      expect(toSqliteBooleanFlag(true)).toBe(1);
      expect(toSqliteBooleanFlag(false)).toBe(0);
    });

    it('treats anything other than exactly 1 as false', () => {
      expect(toBooleanFlag(2 as never)).toBe(false);
      expect(toBooleanFlag(true as never)).toBe(false);
      expect(toBooleanFlag('1' as never)).toBe(false);
    });
  });

  describe('visual keys', () => {
    it('keeps known keys and falls back to the defaults otherwise', () => {
      expect(normalizeVisualColorKey(DEFAULT_VISUAL_COLOR_KEY)).toBe(DEFAULT_VISUAL_COLOR_KEY);
      expect(normalizeVisualIconKey(DEFAULT_VISUAL_ICON_KEY)).toBe(DEFAULT_VISUAL_ICON_KEY);

      for (const unknown of [null, '', 'not-a-color', 'system-app-color-9999']) {
        expect(normalizeVisualColorKey(unknown)).toBe(DEFAULT_VISUAL_COLOR_KEY);
      }
      for (const unknown of [null, '', 'not-an-icon']) {
        expect(normalizeVisualIconKey(unknown)).toBe(DEFAULT_VISUAL_ICON_KEY);
      }
    });
  });
});

describe('TransactionModel', () => {
  const dto: TransactionDto = {
    id: 7,
    account_id: 2,
    category_id: 3,
    occurred_at: 1_700_000_000_000,
    amount_cents: -1999,
    description: 'gym',
    tags: ['health', 'monthly'],
    transfer_id: null,
    settled: 1,
    created_at: 1_699_999_999_000,
    updated_at: null,
  };

  it('converts cents to an amount and flags to booleans', () => {
    const model = TransactionModel.fromDTO(dto);

    expect(model).toMatchObject({
      id: 7,
      accountId: 2,
      categoryId: 3,
      occurredAt: 1_700_000_000_000,
      amount: -19.99,
      description: 'gym',
      tags: ['health', 'monthly'],
      transferId: null,
      settled: true,
      createdAt: 1_699_999_999_000,
      updatedAt: null,
    });
  });

  it('round-trips through toDTO unchanged', () => {
    expect(TransactionModel.fromDTO(dto).toDTO()).toEqual(dto);
    expect(TransactionModel.fromDTO({ ...dto, settled: 0, transfer_id: 'abc' }).toDTO()).toEqual({
      ...dto,
      settled: 0,
      transfer_id: 'abc',
    });
  });

  it('copies the tags so later changes to the DTO do not leak into the model', () => {
    const tags = ['a'];
    const model = TransactionModel.fromDTO({ ...dto, tags });
    tags.push('b');

    expect(model.tags).toEqual(['a']);
    expect(model.toDTO().tags).not.toBe(model.tags);
  });
});

describe('TransferModel', () => {
  const dto: TransferDto = {
    id: 'a5b59500-7dd8-4216-af47-99d8232ca4ce',
    from_account_id: 1,
    to_account_id: 2,
    occurred_at: 1_700_000_000_000,
    amount_cents: 1250,
    description: 'rent',
    settled: 0,
    created_at: 1_699_999_999_000,
    updated_at: 1_700_000_001_000,
  };

  it('maps the transfer id and converts the amount', () => {
    expect(TransferModel.fromDTO(dto)).toMatchObject({
      transferId: dto.id,
      fromAccountId: 1,
      toAccountId: 2,
      amount: 12.5,
      settled: false,
      updatedAt: 1_700_000_001_000,
    });
  });

  it('round-trips through toDTO unchanged', () => {
    expect(TransferModel.fromDTO(dto).toDTO()).toEqual(dto);
  });
});

describe('AccountModel', () => {
  const dto: AccountDto = {
    id: 1,
    name: 'Cash',
    type: 'cash',
    description: null,
    color_key: DEFAULT_VISUAL_COLOR_KEY,
    icon: DEFAULT_VISUAL_ICON_KEY,
    locked: 1,
    archived: 0,
    created_at: 10,
    updated_at: null,
  };

  it('maps flags and keeps valid visual keys', () => {
    expect(AccountModel.fromDTO(dto)).toMatchObject({
      name: 'Cash',
      type: 'cash',
      colorKey: DEFAULT_VISUAL_COLOR_KEY,
      icon: DEFAULT_VISUAL_ICON_KEY,
      locked: true,
      archived: false,
    });
  });

  it('round-trips through toDTO', () => {
    expect(AccountModel.fromDTO(dto).toDTO()).toEqual(dto);
  });

  it('replaces unknown or missing visual keys with the defaults, so toDTO is not always identity', () => {
    const model = AccountModel.fromDTO({ ...dto, color_key: null, icon: 'nope' });

    expect(model.colorKey).toBe(DEFAULT_VISUAL_COLOR_KEY);
    expect(model.icon).toBe(DEFAULT_VISUAL_ICON_KEY);
    expect(model.toDTO().color_key).toBe(DEFAULT_VISUAL_COLOR_KEY);
  });

  it('falls back to the bank type for an unknown stored type', () => {
    expect(AccountModel.fromDTO({ ...dto, type: 'unicorn' as never }).type).toBe('bank');
  });

  it.each([
    ['cash', 'cashflow'],
    ['bank', 'cashflow'],
    ['credit', 'cashflow'],
    ['savings', 'allocation'],
    ['brokerage', 'valuation'],
    ['crypto', 'valuation'],
  ] as const)('derives the display mode of a %s account as %s', (type, mode) => {
    expect(AccountModel.fromDTO({ ...dto, type }).displayMode).toBe(mode);
  });
});

describe('CategoryModel', () => {
  const dto: CategoryDto = {
    id: 5,
    name: 'Food',
    parent_id: 4,
    description: 'groceries',
    color_key: DEFAULT_VISUAL_COLOR_KEY,
    icon: DEFAULT_VISUAL_ICON_KEY,
    type: 'expense',
    locked: 0,
    archived: 1,
    created_at: 10,
    updated_at: 20,
  };

  it('maps fields and flags and round-trips through toDTO', () => {
    const model = CategoryModel.fromDTO(dto);

    expect(model).toMatchObject({ parentId: 4, type: 'expense', locked: false, archived: true });
    expect(model.toDTO()).toEqual(dto);
  });

  it('keeps a null parent and replaces unknown visual keys', () => {
    const model = CategoryModel.fromDTO({ ...dto, parent_id: null, color_key: 'x', icon: null });

    expect(model.parentId).toBeNull();
    expect(model.colorKey).toBe(DEFAULT_VISUAL_COLOR_KEY);
    expect(model.icon).toBe(DEFAULT_VISUAL_ICON_KEY);
  });
});

describe('BudgetModel', () => {
  const dto: BudgetDto = {
    id: 9,
    category_id: 5,
    amount_cents: 45050,
    description: null,
    archived: 0,
    created_at: 10,
    updated_at: null,
  };

  it('converts the amount and round-trips through toDTO', () => {
    const model = BudgetModel.fromDTO(dto);

    expect(model).toMatchObject({ categoryId: 5, amount: 450.5, archived: false });
    expect(model.toDTO()).toEqual(dto);
  });
});

describe('PlanItemModel', () => {
  const dto: PlanItemDto = {
    id: 3,
    title: 'Gym',
    type: 'transaction',
    template_json: { amount_cents: 1999, account_id: 1, category_id: 3, description: 'gym' },
    rule_json: {
      start_date: 1_705_276_800_000,
      count: 12,
      frequency: { unit: 'month', interval: 1 },
      month_policy: 'clip',
    },
    created_at: 10,
    updated_at: null,
  } as PlanItemDto;

  it('round-trips through toDTO', () => {
    expect(PlanItemModel.fromDTO(dto).toDTO()).toEqual(dto);
  });

  it('deep-copies the template and the rule so edits cannot reach the source object', () => {
    const model = PlanItemModel.fromDTO(dto);

    expect(model.templateJson).not.toBe(dto.template_json);
    expect(model.ruleJson).not.toBe(dto.rule_json);
    expect(model.ruleJson.frequency).not.toBe(dto.rule_json.frequency);

    const copy = model.toDTO();
    expect(copy.template_json).not.toBe(model.templateJson);
    expect(copy.rule_json.frequency).not.toBe(model.ruleJson.frequency);
  });
});

describe('AccountValuationModel', () => {
  const dto: AccountValuationDto = {
    id: 1,
    account_id: 4,
    valued_at: 1_700_000_000_000,
    value_cents: 1_000_050,
    source: 'import',
    created_at: 10,
    updated_at: null,
  };

  it('keeps the value in cents, unlike the other models', () => {
    expect(AccountValuationModel.fromDTO(dto)).toMatchObject({
      accountId: 4,
      valueCents: 1_000_050,
      source: 'import',
    });
  });

  it.each(['manual', 'api', 'import'] as const)('keeps the %s source', (source) => {
    expect(AccountValuationModel.fromDTO({ ...dto, source }).source).toBe(source);
  });

  it('falls back to manual for an unknown source', () => {
    expect(AccountValuationModel.fromDTO({ ...dto, source: 'scraper' as never }).source).toBe(
      'manual',
    );
  });
});
