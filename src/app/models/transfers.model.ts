import type { RowId, UnixTimestampMilliseconds } from './common.model';
import type { TransactionModel } from './transactions.model';

export class TransferModel {
  constructor(
    public readonly transferId: string,
    public readonly occurredAt: UnixTimestampMilliseconds,
    public readonly fromTransaction: TransactionModel,
    public readonly toTransaction: TransactionModel,
    public readonly amount: number,
  ) {}

  get fromAccountId(): RowId {
    return this.fromTransaction.accountId;
  }

  get toAccountId(): RowId {
    return this.toTransaction.accountId;
  }

  static fromTransactions(transactions: readonly TransactionModel[]): readonly TransferModel[] {
    const groupedByTransferId = new Map<string, TransactionModel[]>();

    for (const transaction of transactions) {
      if (!transaction.transferId) {
        continue;
      }

      const transferRows = groupedByTransferId.get(transaction.transferId) ?? [];
      transferRows.push(transaction);
      groupedByTransferId.set(transaction.transferId, transferRows);
    }

    const transfers: TransferModel[] = [];
    for (const [transferId, transferRows] of groupedByTransferId.entries()) {
      const fromTransaction = transferRows.find((row) => row.amount < 0);
      const toTransaction = transferRows.find((row) => row.amount > 0);

      if (!fromTransaction || !toTransaction) {
        continue;
      }

      transfers.push(
        new TransferModel(
          transferId,
          fromTransaction.occurredAt,
          fromTransaction,
          toTransaction,
          Math.abs(fromTransaction.amount),
        ),
      );
    }

    return transfers.sort(
      (left, right) => Number(right.occurredAt) - Number(left.occurredAt) || right.transferId.localeCompare(left.transferId),
    );
  }
}
