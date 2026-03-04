import type { ZardIcon } from '@/shared/components/icon';

export interface ActivityTransactionRow {
  readonly id: number;
  readonly occurredAt: number;
  readonly amount: number;
  readonly settled: boolean;
  readonly accountName: string;
  readonly accountIcon: ZardIcon;
  readonly accountColorHex: string;
  readonly categoryName: string;
  readonly categoryIcon: ZardIcon;
  readonly categoryColorHex: string;
  readonly description: string | null;
}

export interface ActivityTransferRow {
  readonly transferId: string;
  readonly occurredAt: number;
  readonly amount: number;
  readonly settled: boolean;
  readonly fromAccountId: number;
  readonly toAccountId: number;
  readonly fromAccountName: string;
  readonly fromAccountIcon: ZardIcon;
  readonly fromAccountColorHex: string;
  readonly toAccountName: string;
  readonly toAccountIcon: ZardIcon;
  readonly toAccountColorHex: string;
  readonly description: string | null;
}
