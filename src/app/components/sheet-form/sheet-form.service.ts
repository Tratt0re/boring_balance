import { Injectable } from '@angular/core';

import {
  type SheetOnClickCallback,
  type ZardSheetOptions,
  ZardSheetRef,
  ZardSheetService,
} from '@/shared/components/sheet';
import { AppSheetFormComponent } from './sheet-form.component';
import type { AppSheetField, AppSheetFieldValueMap, AppSheetFormData } from './sheet-form.types';

export interface AppSheetFormOpenOptions
  extends Omit<ZardSheetOptions<AppSheetFormComponent, AppSheetFormData>, 'zContent' | 'zData' | 'zOnOk'> {
  readonly fields: readonly AppSheetField[];
  readonly values?: AppSheetFieldValueMap;
  readonly validateBeforeSubmit?: boolean;
  readonly onSubmit?: SheetOnClickCallback<AppSheetFormComponent>;
}

@Injectable({
  providedIn: 'root',
})
export class AppSheetFormService {
  constructor(private readonly zardSheetService: ZardSheetService) {}

  open(options: AppSheetFormOpenOptions): ZardSheetRef<AppSheetFormComponent> {
    const {
      fields,
      values,
      validateBeforeSubmit = true,
      onSubmit,
      ...sheetOptions
    } = options;

    const data: AppSheetFormData = {
      fields,
      values,
    };

    return this.zardSheetService.create<AppSheetFormComponent, AppSheetFormData>({
      ...sheetOptions,
      zContent: AppSheetFormComponent,
      zData: data,
      zOnOk: (component) => {
        if (validateBeforeSubmit && !component.isValid()) {
          return false;
        }

        if (onSubmit) {
          return onSubmit(component);
        }

        return component.getValues();
      },
    });
  }
}
