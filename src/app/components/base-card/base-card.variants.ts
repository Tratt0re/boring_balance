import { cva } from 'class-variance-authority';

import { mergeClasses } from '@/shared/utils/merge-classes';

export const baseCardVariants = cva('bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm');

export const baseCardHeaderVariants = cva(
  mergeClasses('@container/card-header items-start gap-2 px-6', '[.border-b]:pb-6'),
  {
    variants: {
      variant: {
        default: 'grid auto-rows-min grid-rows-[auto_auto]',
        segmented: 'flex flex-col',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export const baseCardTitleVariants = cva('leading-none font-semibold', {
  variants: {
    variant: {
      default: '',
      segmented: 'w-full font-normal leading-normal',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export const baseCardBodyVariants = cva('px-6');

export const baseCardFooterVariants = cva('flex flex-col gap-2 items-center px-6 [.border-t]:pt-6');
