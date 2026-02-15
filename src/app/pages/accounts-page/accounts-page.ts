import { JsonPipe } from '@angular/common';
import { Component, signal } from '@angular/core';

import {
  AppDataTableComponent,
  type EditableValidationErrorEvent,
  type EditableValueChangeEvent,
  type TableDataItem,
  type TableSortState,
} from '@/components/data-table';

interface AccountDemoRow {
  readonly id: number;
  readonly name: string;
  readonly type: 'checking' | 'savings' | 'cash' | 'credit';
  readonly balance: number;
  readonly lastActivity: string;
  readonly nextReviewDate: string;
  readonly reconciled: boolean;
  readonly includeInTotals: boolean;
  readonly status: 'active' | 'paused' | 'closed';
  readonly notes: string;
  readonly isLocked: boolean;
}

@Component({
  selector: 'app-accounts-page',
  imports: [AppDataTableComponent, JsonPipe],
  templateUrl: './accounts-page.html',
})
export class AccountsPage {
  protected readonly demoRows: readonly AccountDemoRow[] = [
    {
      id: 1,
      name: 'Main Checking',
      type: 'checking',
      balance: 2840.15,
      lastActivity: '2026-02-13T09:14:00.000Z',
      nextReviewDate: '2026-03-01',
      reconciled: true,
      includeInTotals: true,
      status: 'active',
      notes: 'Salary and daily expenses',
      isLocked: false,
    },
    {
      id: 2,
      name: 'Emergency Savings',
      type: 'savings',
      balance: 12050.0,
      lastActivity: '2026-02-01T18:42:00.000Z',
      nextReviewDate: '2026-03-15',
      reconciled: true,
      includeInTotals: true,
      status: 'active',
      notes: '6 months reserve',
      isLocked: false,
    },
    {
      id: 3,
      name: 'Wallet Cash',
      type: 'cash',
      balance: 180.4,
      lastActivity: '2026-02-14T20:11:00.000Z',
      nextReviewDate: '2026-02-20',
      reconciled: false,
      includeInTotals: true,
      status: 'active',
      notes: 'Small daily cash',
      isLocked: false,
    },
    {
      id: 4,
      name: 'Travel Card',
      type: 'credit',
      balance: -925.66,
      lastActivity: '2026-02-10T06:50:00.000Z',
      nextReviewDate: '2026-03-10',
      reconciled: false,
      includeInTotals: false,
      status: 'paused',
      notes: 'Used only for trips',
      isLocked: false,
    },
    {
      id: 5,
      name: 'Old Joint Account',
      type: 'checking',
      balance: 0,
      lastActivity: '2025-10-04T11:30:00.000Z',
      nextReviewDate: '2026-04-01',
      reconciled: true,
      includeInTotals: false,
      status: 'closed',
      notes: 'Archived account',
      isLocked: true,
    },
  ];

  protected readonly tableStructure: readonly TableDataItem[] = [
    {
      columnName: 'ID',
      columnKey: 'id',
      type: 'number',
      sortable: true,
    },
    {
      columnName: 'Name',
      columnKey: 'name',
      type: 'string',
      sortable: true,
      editableType: 'input',
      inputType: 'text',
      placeholder: 'Account name',
      disabled: (row: object) => this.isAccountReadOnly(row),
      validation: {
        required: true,
        minLength: 3,
        maxLength: 32,
      },
    },
    {
      columnName: 'Type',
      columnKey: 'type',
      type: 'string',
      sortable: true,
      editableType: 'select',
      disabled: (row: object) => this.isAccountReadOnly(row),
      options: [
        { label: 'checking', value: 'checking' },
        { label: 'savings', value: 'savings' },
        { label: 'cash', value: 'cash' },
        { label: 'credit', value: 'credit' },
      ],
      validation: {
        required: true,
      },
    },
    {
      columnName: 'Balance',
      columnKey: 'balance',
      type: 'currency',
      sortable: true,
    },
    {
      columnName: 'Last Activity',
      columnKey: 'lastActivity',
      type: 'datetime',
      sortable: true,
    },
    {
      columnName: 'Next Review',
      columnKey: 'nextReviewDate',
      type: 'date',
      sortable: true,
      editableType: 'date',
      placeholder: 'Choose review date',
      disabled: (row: object) => this.isAccountReadOnly(row),
      validation: {
        required: true,
      },
    },
    {
      columnName: 'Reconciled',
      columnKey: 'reconciled',
      type: 'boolean',
      sortable: true,
      editableType: 'checkbox',
      disabled: (row: object) => this.isAccountReadOnly(row),
    },
    {
      columnName: 'Include Totals',
      columnKey: 'includeInTotals',
      type: 'boolean',
      sortable: true,
      editableType: 'switch',
      disabled: (row: object) => this.isAccountReadOnly(row),
    },
    {
      columnName: 'Status',
      columnKey: 'status',
      type: 'string',
      sortable: true,
      editableType: 'select',
      disabled: (row: object) => this.isAccountReadOnly(row),
      options: [
        { label: 'active', value: 'active' },
        { label: 'paused', value: 'paused' },
        { label: 'closed', value: 'closed' },
      ],
      validation: {
        required: true,
        validator: (value: unknown, row: object) => {
          const account = row as AccountDemoRow;
          if (value === 'closed' && account.balance > 0) {
            return 'Cannot close an account with positive balance.';
          }
          return null;
        },
      },
    },
    {
      columnName: 'Notes',
      columnKey: 'notes',
      type: 'string',
      editableType: 'input',
      inputType: 'text',
      placeholder: 'Short note',
      disabled: (row: object) => this.isAccountReadOnly(row),
      validation: {
        maxLength: 60,
      },
    },
    {
      actionItems: [
        {
          id: 'view',
          icon: 'eye',
          label: 'View account',
          buttonType: 'ghost',
          action: (row: object) => this.handleAction('View', row),
        },
        {
          id: 'edit',
          icon: 'settings',
          label: 'Edit account',
          buttonType: 'outline',
          disabled: (row: object) => (row as AccountDemoRow).isLocked,
          action: (row: object) => this.handleAction('Edit', row),
        },
        {
          id: 'delete',
          icon: 'trash',
          label: 'Delete account',
          buttonType: 'destructive',
          disabled: (row: object) => (row as AccountDemoRow).isLocked,
          action: (row: object) => this.handleAction('Delete', row),
        },
      ],
    },
  ] as const;

  protected readonly selectedRowsCount = signal(0);
  protected readonly lastSortState = signal<TableSortState | null>(null);
  protected readonly lastValueChange = signal<EditableValueChangeEvent | null>(null);
  protected readonly lastValidationError = signal<EditableValidationErrorEvent | null>(null);
  protected readonly actionLog = signal<readonly string[]>([]);

  protected onSelectedRowsChange(rows: readonly object[]): void {
    this.selectedRowsCount.set(rows.length);
  }

  protected onSortChange(sortState: TableSortState | null): void {
    this.lastSortState.set(sortState);
  }

  protected onEditableValueChange(event: EditableValueChangeEvent): void {
    this.lastValueChange.set(event);
  }

  protected onEditableValidationError(event: EditableValidationErrorEvent): void {
    this.lastValidationError.set(event);
  }

  private isAccountReadOnly(row: object): boolean {
    const account = row as AccountDemoRow;
    return account.id === 1 || account.isLocked;
  }

  private handleAction(action: 'View' | 'Edit' | 'Delete', row: object): void {
    const account = row as AccountDemoRow;
    const message = `${new Date().toLocaleTimeString()} - ${action}: ${account.name} (#${account.id})`;
    this.actionLog.set([message, ...this.actionLog()].slice(0, 8));
  }
}
