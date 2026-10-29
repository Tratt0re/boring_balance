import { cva } from 'class-variance-authority';

export const paginationContentVariants = cva('flex flex-row items-center gap-1');

export const paginationPreviousVariants = cva('size-9 p-0');

export const paginationNextVariants = cva('size-9 p-0');

export const paginationEllipsisVariants = cva('flex size-9 items-center justify-center');

export const paginationVariants = cva('mx-auto flex w-full justify-center');
