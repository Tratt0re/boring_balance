import { cva, type VariantProps } from 'class-variance-authority';

export const paginationContentVariants = cva('flex flex-row items-center gap-1');
export type ZardPaginationContentVariants = VariantProps<typeof paginationContentVariants>;

export const paginationPreviousVariants = cva('size-9 p-0');
export type ZardPaginationPreviousVariants = VariantProps<typeof paginationPreviousVariants>;

export const paginationNextVariants = cva('size-9 p-0');
export type ZardPaginationNextVariants = VariantProps<typeof paginationNextVariants>;

export const paginationEllipsisVariants = cva('flex size-9 items-center justify-center');
export type ZardPaginationEllipsisVariants = VariantProps<typeof paginationEllipsisVariants>;

export const paginationVariants = cva('mx-auto flex w-full justify-center');
export type ZardPaginationVariants = VariantProps<typeof paginationVariants>;
