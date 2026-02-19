import type { ZardComboboxGroup, ZardComboboxOption } from '@/shared/components/combobox';
import type { ZardIcon } from '@/shared/components/icon';
import type { ZardSelectSizeVariants } from '@/shared/components/select';

export type AppSheetFieldType = 'date-picker' | 'combobox' | 'select' | 'checkbox';
export type AppSheetFieldWidth = `${number}/${number}` | 'full';

export type AppSheetFieldValue = Date | string | readonly string[] | boolean | null;
export type AppSheetFieldValueMap = Record<string, AppSheetFieldValue>;

export interface AppSheetFieldBase<TType extends AppSheetFieldType, TValue extends AppSheetFieldValue> {
  readonly id: string;
  readonly type: TType;
  readonly value?: TValue;
  readonly label?: string;
  readonly description?: string;
  readonly placeholder?: string;
  readonly width?: AppSheetFieldWidth;
  readonly translate?: boolean;
  readonly required?: boolean;
  readonly disabled?: boolean;
}

export interface AppSheetDatePickerField extends AppSheetFieldBase<'date-picker', Date | string | null> {
  readonly zFormat?: string;
  readonly zIconPosition?: 'left' | 'right';
  readonly minDate?: Date | string | number | null;
  readonly maxDate?: Date | string | number | null;
}

export interface AppSheetComboboxOption extends Omit<ZardComboboxOption, 'label'> {
  readonly label: string;
  readonly translate?: boolean;
}

export interface AppSheetComboboxGroup extends Omit<ZardComboboxGroup, 'label' | 'options'> {
  readonly label?: string;
  readonly translate?: boolean;
  readonly options: readonly AppSheetComboboxOption[];
}

export interface AppSheetComboboxField
  extends AppSheetFieldBase<'combobox', string | readonly string[] | null> {
  readonly multiple?: boolean;
  readonly maxLabelCount?: number;
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
  readonly emptyText?: string;
  readonly ariaLabel?: string;
  readonly options?: readonly AppSheetComboboxOption[];
  readonly groups?: readonly AppSheetComboboxGroup[];
}

export interface AppSheetSelectOption {
  readonly value: string;
  readonly label: string;
  readonly translate?: boolean;
  readonly icon?: ZardIcon;
  readonly colorHex?: string | null;
  readonly disabled?: boolean;
}

export interface AppSheetSelectField extends AppSheetFieldBase<'select', string | readonly string[] | null> {
  readonly multiple?: boolean;
  readonly maxLabelCount?: number;
  readonly showSelectedLabel?: boolean;
  readonly size?: ZardSelectSizeVariants;
  readonly options: readonly AppSheetSelectOption[];
}

export interface AppSheetCheckboxField extends AppSheetFieldBase<'checkbox', boolean> {
  readonly checkboxLabel?: string;
  readonly icon?: ZardIcon;
}

export type AppSheetField = AppSheetDatePickerField | AppSheetComboboxField | AppSheetSelectField | AppSheetCheckboxField;

export interface AppSheetFormData {
  readonly fields: readonly AppSheetField[];
  readonly values?: AppSheetFieldValueMap;
}
