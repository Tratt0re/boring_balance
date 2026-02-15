import type { ZardIcon } from '@/shared/components/icon';

export interface AppVisualOption {
  readonly label: string;
  readonly value: string;
  readonly icon?: ZardIcon;
  readonly colorHex?: string;
}

export const APP_COLOR_OPTIONS: readonly AppVisualOption[] = [
  { label: 'options.colors.none', value: '', colorHex: 'var(--category-color-11)' },
  { label: 'options.colors.gray', value: 'category-11', colorHex: 'var(--category-color-11)' },
  { label: 'options.colors.coral', value: 'category-1', colorHex: 'var(--category-color-1)' },
  { label: 'options.colors.amber', value: 'category-2', colorHex: 'var(--category-color-2)' },
  { label: 'options.colors.gold', value: 'category-3', colorHex: 'var(--category-color-3)' },
  { label: 'options.colors.lime', value: 'category-4', colorHex: 'var(--category-color-4)' },
  { label: 'options.colors.green', value: 'category-5', colorHex: 'var(--category-color-5)' },
  { label: 'options.colors.teal', value: 'category-6', colorHex: 'var(--category-color-6)' },
  { label: 'options.colors.sky', value: 'category-7', colorHex: 'var(--category-color-7)' },
  { label: 'options.colors.blue', value: 'category-8', colorHex: 'var(--category-color-8)' },
  { label: 'options.colors.violet', value: 'category-9', colorHex: 'var(--category-color-9)' },
  { label: 'options.colors.rose', value: 'category-10', colorHex: 'var(--category-color-10)' },
] as const;

export const APP_COLOR_KEY_SET = new Set(
  APP_COLOR_OPTIONS.map((option) => option.value).filter((value) => value.length > 0),
);

export const APP_ICON_OPTIONS: readonly AppVisualOption[] = [
  { label: 'options.icons.none', value: '' },
  { label: 'options.icons.blocked', value: 'ban', icon: 'ban' },
  { label: 'options.icons.transfer', value: 'arrow-left-right', icon: 'move-right' },
  { label: 'options.icons.circle', value: 'circle', icon: 'circle' },
  { label: 'options.icons.income', value: 'circle-dollar-sign', icon: 'circle-dollar-sign' },
  { label: 'options.icons.tag', value: 'tag', icon: 'tag' },
  { label: 'options.icons.tags', value: 'tags', icon: 'tags' },
  { label: 'options.icons.money', value: 'badge-euro', icon: 'badge-euro' },
  { label: 'options.icons.bank', value: 'landmark', icon: 'landmark' },
  { label: 'options.icons.home', value: 'house', icon: 'house' },
  { label: 'options.icons.heart', value: 'heart', icon: 'heart' },
  { label: 'options.icons.star', value: 'star', icon: 'star' },
  { label: 'options.icons.sparkles', value: 'sparkles', icon: 'sparkles' },
  { label: 'options.icons.card', value: 'credit-card', icon: 'credit-card' },
] as const;

export const APP_ICON_KEY_SET = new Set(
  APP_ICON_OPTIONS.map((option) => option.value).filter((value) => value.length > 0),
);
