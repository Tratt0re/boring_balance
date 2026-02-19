import type { ZardIcon } from '@/shared/components/icon';

export interface AppVisualOption {
  readonly label: string;
  readonly value: string;
  readonly icon?: ZardIcon;
  readonly colorHex?: string;
}

export const DEFAULT_VISUAL_COLOR_KEY = 'system-app-color-11';
export const DEFAULT_VISUAL_ICON_KEY = 'circle';

export const APP_COLOR_OPTIONS: readonly AppVisualOption[] = [
  { label: 'options.colors.none', value: '', colorHex: 'var(--system-app-color-11)' },
  { label: 'options.colors.gray', value: 'system-app-color-11', colorHex: 'var(--system-app-color-11)' },
  { label: 'options.colors.coral', value: 'system-app-color-1', colorHex: 'var(--system-app-color-1)' },
  { label: 'options.colors.amber', value: 'system-app-color-2', colorHex: 'var(--system-app-color-2)' },
  { label: 'options.colors.gold', value: 'system-app-color-3', colorHex: 'var(--system-app-color-3)' },
  { label: 'options.colors.lime', value: 'system-app-color-4', colorHex: 'var(--system-app-color-4)' },
  { label: 'options.colors.green', value: 'system-app-color-5', colorHex: 'var(--system-app-color-5)' },
  { label: 'options.colors.teal', value: 'system-app-color-6', colorHex: 'var(--system-app-color-6)' },
  { label: 'options.colors.sky', value: 'system-app-color-7', colorHex: 'var(--system-app-color-7)' },
  { label: 'options.colors.blue', value: 'system-app-color-8', colorHex: 'var(--system-app-color-8)' },
  { label: 'options.colors.violet', value: 'system-app-color-9', colorHex: 'var(--system-app-color-9)' },
  { label: 'options.colors.rose', value: 'system-app-color-10', colorHex: 'var(--system-app-color-10)' },
] as const;

export const APP_COLOR_KEY_SET = new Set(
  APP_COLOR_OPTIONS.map((option) => option.value).filter((value) => value.length > 0),
);

export const APP_ICON_OPTIONS: readonly AppVisualOption[] = [
  { label: 'options.icons.none', value: '' },
  { label: 'options.icons.blocked', value: 'ban', icon: 'ban' },
  { label: 'options.icons.transfer', value: 'arrow-left-right', icon: 'move-right' },
  { label: 'options.icons.circle', value: 'circle', icon: 'circle' },
  { label: 'options.icons.income', value: 'banknote-arrow-up', icon: 'banknote-arrow-up' },
  { label: 'options.icons.expense', value: 'banknote-arrow-down', icon: 'banknote-arrow-down' },
  { label: 'options.icons.tag', value: 'tag', icon: 'tag' },
  { label: 'options.icons.tags', value: 'tags', icon: 'tags' },
  { label: 'options.icons.money', value: 'badge-euro', icon: 'badge-euro' },
  { label: 'options.icons.coins', value: 'coins', icon: 'coins' },
  { label: 'options.icons.handCoins', value: 'hand-coins', icon: 'hand-coins' },
  { label: 'options.icons.wallet', value: 'wallet', icon: 'wallet' },
  { label: 'options.icons.piggyBank', value: 'piggy-bank', icon: 'piggy-bank' },
  { label: 'options.icons.vault', value: 'vault', icon: 'vault' },
  { label: 'options.icons.bank', value: 'landmark', icon: 'landmark' },
  { label: 'options.icons.shoppingCart', value: 'shopping-cart', icon: 'shopping-cart' },
  { label: 'options.icons.store', value: 'store', icon: 'store' },
  { label: 'options.icons.backpack', value: 'backpack', icon: 'backpack' },
  { label: 'options.icons.globe', value: 'globe', icon: 'globe' },
  { label: 'options.icons.library', value: 'library-big', icon: 'library-big' },
  { label: 'options.icons.school', value: 'school', icon: 'school' },
  { label: 'options.icons.graduationCap', value: 'graduation-cap', icon: 'graduation-cap' },
  { label: 'options.icons.gamepad', value: 'gamepad-2', icon: 'gamepad-2' },
  { label: 'options.icons.music', value: 'music-4', icon: 'music-4' },
  { label: 'options.icons.cassette', value: 'cassette-tape', icon: 'cassette-tape' },
  { label: 'options.icons.film', value: 'film', icon: 'film' },
  { label: 'options.icons.camera', value: 'camera', icon: 'camera' },
  { label: 'options.icons.popcorn', value: 'popcorn', icon: 'popcorn' },
  { label: 'options.icons.cigarette', value: 'cigarette', icon: 'cigarette' },
  { label: 'options.icons.beer', value: 'beer', icon: 'beer' },
  { label: 'options.icons.coffee', value: 'coffee', icon: 'coffee' },
  { label: 'options.icons.glassWater', value: 'glass-water', icon: 'glass-water' },
  { label: 'options.icons.martini', value: 'martini', icon: 'martini' },
  { label: 'options.icons.techReceipt', value: 'receipt-text', icon: 'receipt-text' },
  { label: 'options.icons.badgePercent', value: 'badge-percent', icon: 'badge-percent' },
  { label: 'options.icons.dumbbell', value: 'dumbbell', icon: 'dumbbell' },
  { label: 'options.icons.biceps', value: 'biceps-flexed', icon: 'biceps-flexed' },
  { label: 'options.icons.ambulance', value: 'ambulance', icon: 'ambulance' },
  { label: 'options.icons.hospital', value: 'hospital', icon: 'hospital' },
  { label: 'options.icons.pill', value: 'pill', icon: 'pill' },
  { label: 'options.icons.cannabis', value: 'cannabis', icon: 'cannabis' },
  { label: 'options.icons.mountainSnow', value: 'mountain-snow', icon: 'mountain-snow' },
  { label: 'options.icons.treePalm', value: 'tree-palm', icon: 'tree-palm' },
  { label: 'options.icons.leaf', value: 'leaf', icon: 'leaf' },
  { label: 'options.icons.bird', value: 'bird', icon: 'bird' },
  { label: 'options.icons.cat', value: 'cat', icon: 'cat' },
  { label: 'options.icons.dog', value: 'dog', icon: 'dog' },
  { label: 'options.icons.fish', value: 'fish', icon: 'fish' },
  { label: 'options.icons.utensils', value: 'utensils', icon: 'utensils' },
  { label: 'options.icons.hamburger', value: 'hamburger', icon: 'hamburger' },
  { label: 'options.icons.salad', value: 'salad', icon: 'salad' },
  { label: 'options.icons.pizza', value: 'pizza', icon: 'pizza' },
  { label: 'options.icons.baby', value: 'baby', icon: 'baby' },
  { label: 'options.icons.glasses', value: 'glasses', icon: 'glasses' },
  { label: 'options.icons.gift', value: 'gift', icon: 'gift' },
  { label: 'options.icons.tech', value: 'cpu', icon: 'cpu' },
  { label: 'options.icons.laptop', value: 'laptop', icon: 'laptop' },
  { label: 'options.icons.home', value: 'house', icon: 'house' },
  { label: 'options.icons.shirt', value: 'shirt', icon: 'shirt' },
  { label: 'options.icons.armchair', value: 'armchair', icon: 'armchair' },
  { label: 'options.icons.lampDesk', value: 'lamp-desk', icon: 'lamp-desk' },
  { label: 'options.icons.frown', value: 'frown', icon: 'frown' },
  { label: 'options.icons.smile', value: 'smile', icon: 'smile' },
  { label: 'options.icons.heart', value: 'heart', icon: 'heart' },
  { label: 'options.icons.star', value: 'star', icon: 'star' },
  { label: 'options.icons.sparkles', value: 'sparkles', icon: 'sparkles' },
  { label: 'options.icons.creditCard', value: 'credit-card', icon: 'credit-card' },
  { label: 'options.icons.tractor', value: 'tractor', icon: 'tractor' },
  { label: 'options.icons.train', value: 'train-front', icon: 'train-front' },
  { label: 'options.icons.footprints', value: 'footprints', icon: 'footprints' },
  { label: 'options.icons.wrench', value: 'wrench', icon: 'wrench' },
  { label: 'options.icons.refrigerator', value: 'refrigerator', icon: 'refrigerator' },
  { label: 'options.icons.package', value: 'package', icon: 'package' },
  { label: 'options.icons.scissors', value: 'scissors', icon: 'scissors' },
  { label: 'options.icons.brain', value: 'brain', icon: 'brain' },
  { label: 'options.icons.crypto', value: 'bitcoin', icon: 'bitcoin' },
  { label: 'options.icons.factory', value: 'factory', icon: 'factory' },
  { label: 'options.icons.car', value: 'car', icon: 'car' },

] as const;

export const APP_ICON_KEY_SET = new Set(
  APP_ICON_OPTIONS.map((option) => option.value).filter((value) => value.length > 0),
);
