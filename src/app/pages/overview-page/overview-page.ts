import { Component, OnDestroy, OnInit } from '@angular/core';

import { AppBaseCardComponent } from '@/components/base-card';
import {
  AppBarChartComponent,
  AppCalendarChartComponent,
  AppLineChartComponent,
  AppPieChartComponent,
  AppRadarChartComponent,
  AppSankeyChartComponent,
  type AppBarChartSeries,
  type AppCalendarChartItem,
  type AppLineChartSeries,
  type AppPieChartItem,
  type AppRadarChartIndicator,
  type AppRadarChartSeries,
  type AppSankeyChartLink,
  type AppSankeyChartNode,
} from '@/components/charts';
import { ToolbarContextService } from '@/services/toolbar-context.service';

const CALENDAR_DEMO_MONTH = '2026-03';

function formatCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildCalendarDemoDataForMonth(month: string): readonly AppCalendarChartItem[] {
  const start = new Date(`${month}-01T00:00:00`);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  const points: AppCalendarChartItem[] = [];
  const cursor = new Date(start);
  let dayIndex = 0;

  while (cursor <= end) {
    const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6;
    const value = 18 + ((dayIndex * 11) % 53) + (isWeekend ? 14 : 0);
    points.push({
      date: formatCalendarDate(cursor),
      value,
    });
    cursor.setDate(cursor.getDate() + 1);
    dayIndex += 1;
  }

  return points;
}

@Component({
  selector: 'app-overview-page',
  imports: [
    AppBaseCardComponent,
    AppLineChartComponent,
    AppBarChartComponent,
    AppPieChartComponent,
    AppCalendarChartComponent,
    AppRadarChartComponent,
    AppSankeyChartComponent,
  ],
  templateUrl: './overview-page.html',
})
export class OverviewPage implements OnInit, OnDestroy {
  private releaseToolbarActions: (() => void) | null = null;
  protected readonly monthlySpendingLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  protected readonly monthlySpendingSeries: readonly AppLineChartSeries[] = [
    {
      name: 'Expenses',
      data: [38, 35, 40, 31, 44, 39],
      themeColor: 'chart-1',
    },
    {
      name: 'Incomes',
      data: [35, 33, 30, 37, 28, 33],
      themeColor: 'chart-4',
    },
    {
      name: 'Profit',
      data: [27, 32, 30, 32, 28, 28],
      themeColor: 'chart-8',
    },
  ];
  protected readonly monthlyTotalsBarSeries: readonly AppBarChartSeries[] = [
    {
      name: 'Expenses',
      data: [740, -620, 780, 540, 860, 690],
      themeColor: 'chart-1',
    },
    {
      name: 'Incomes',
      data: [1240, 1150, 1300, 1250, 1400, 1360],
      themeColor: 'chart-2',
    },
    {
      name: 'Profit',
      data: [500, 530, 520, 710, 540, 670],
      themeColor: 'chart-3',
    },
  ];
  protected readonly monthlyTotalsPieData: readonly AppPieChartItem[] = [
    { name: 'Expenses', value: 4230, themeColor: 'chart-1' },
    { name: 'Incomes', value: 7700, themeColor: 'chart-2' },
    { name: 'Profit', value: 3470, themeColor: 'chart-3' },
  ];
  protected readonly budgetHealthIndicators: readonly AppRadarChartIndicator[] = [
    { name: 'Housing', max: 100 },
    { name: 'Food', max: 100 },
    { name: 'Utilities', max: 100 },
    { name: 'Savings', max: 100 },
    { name: 'Debt', max: 100 },
    { name: 'Leisure', max: 100 },
  ];
  protected readonly budgetHealthSeries: readonly AppRadarChartSeries[] = [
    {
      name: 'Current',
      value: [72, 63, 58, 81, 49, 66],
      themeColor: 'chart-2',
      showArea: true,
      areaOpacity: 0.2,
      lineWidth: 2.6,
      pointSize: 5,
    },
    {
      name: 'Target',
      value: [78, 70, 64, 86, 42, 60],
      themeColor: 'chart-5',
      showArea: false,
      lineWidth: 2.4,
      pointSize: 5,
    },
  ];
  protected readonly cashflowSankeyNodes: readonly AppSankeyChartNode[] = [
    { name: 'Income', themeColor: 'chart-2' },
    { name: 'Needs', themeColor: 'chart-1' },
    { name: 'Wants', themeColor: 'chart-4' },
    { name: 'Savings', themeColor: 'chart-5' },
    { name: 'Investments', themeColor: 'chart-6' },
    { name: 'Emergency Fund', themeColor: 'chart-7' },
    { name: 'Debt Paydown', themeColor: 'chart-3' },
  ];
  protected readonly cashflowSankeyLinks: readonly AppSankeyChartLink[] = [
    { source: 'Income', target: 'Needs', value: 3200 },
    { source: 'Income', target: 'Wants', value: 1450 },
    { source: 'Income', target: 'Savings', value: 1550 },
    { source: 'Savings', target: 'Investments', value: 900 },
    { source: 'Savings', target: 'Emergency Fund', value: 400 },
    { source: 'Savings', target: 'Debt Paydown', value: 250 },
  ];
  protected readonly dailyActivityCalendarRange = CALENDAR_DEMO_MONTH;
  protected readonly dailyActivityCalendarData = buildCalendarDemoDataForMonth(CALENDAR_DEMO_MONTH);

  constructor(
    private readonly toolbarContextService: ToolbarContextService,
  ) {}

  ngOnInit(): void {
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.overview',
      actions: [],
    });
  }

  ngOnDestroy(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
  }
}
