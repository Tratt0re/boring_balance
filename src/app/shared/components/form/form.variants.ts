import { cva, type VariantProps } from 'class-variance-authority';

export const formFieldVariants = cva('grid gap-2');

export const formLabelVariants = cva(
  'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
  {
    variants: {
      zRequired: {
        true: "after:content-['*'] after:ml-0.5 after:text-destructive",
      },
    },
  },
);

export const formControlVariants = cva('');

export const formMessageVariants = cva('text-sm', {
  variants: {
    zType: {
      default: 'text-muted-foreground',
      error: 'text-destructive',
      success: 'text-success',
      warning: 'text-warning',
    },
  },
  defaultVariants: {
    zType: 'default',
  },
});

export type ZardFormMessageTypeVariants = NonNullable<VariantProps<typeof formMessageVariants>['zType']>;
