export interface UpdateResult<TRow> {
  readonly changed: number;
  readonly row: TRow | null;
}

export interface PaginatedResult<TRow> {
  readonly rows: readonly TRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export interface TransferBundleResult<TTransfer, TTransaction> {
  readonly transferId: string;
  readonly transfer: TTransfer;
  readonly transactions: readonly TTransaction[];
}

interface UpdateResponseLike<TRowDto> {
  readonly changed: number;
  readonly row: TRowDto | null;
}

interface PaginatedResponseLike<TRowDto> {
  readonly rows: readonly TRowDto[];
  readonly total: number;
  readonly page: number;
  readonly page_size: number;
}

interface TransferBundleResponseLike<TTransferDto, TTransactionDto> {
  readonly transfer_id: string;
  readonly transfer: TTransferDto;
  readonly transactions: readonly TTransactionDto[];
}

export function mapNullableRow<TRowDto, TRow>(
  row: TRowDto | null,
  mapRow: (row: TRowDto) => TRow,
): TRow | null {
  return row === null ? null : mapRow(row);
}

export function mapUpdateResult<TRowDto, TRow>(
  result: UpdateResponseLike<TRowDto>,
  mapRow: (row: TRowDto) => TRow,
): UpdateResult<TRow> {
  return {
    changed: result.changed,
    row: mapNullableRow(result.row, mapRow),
  };
}

export function mapPaginatedResult<TRowDto, TRow>(
  response: PaginatedResponseLike<TRowDto>,
  mapRow: (row: TRowDto) => TRow,
): PaginatedResult<TRow> {
  const pageSize = response.page_size;

  return {
    rows: response.rows.map((row) => mapRow(row)),
    total: response.total,
    page: response.page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(response.total / pageSize)),
  };
}

export function mapTransferBundleResult<TTransferDto, TTransfer, TTransactionDto, TTransaction>(
  result: TransferBundleResponseLike<TTransferDto, TTransactionDto>,
  mapTransfer: (transfer: TTransferDto) => TTransfer,
  mapTransaction: (transaction: TTransactionDto) => TTransaction,
): TransferBundleResult<TTransfer, TTransaction> {
  return {
    transferId: result.transfer_id,
    transfer: mapTransfer(result.transfer),
    transactions: result.transactions.map((transaction) => mapTransaction(transaction)),
  };
}
