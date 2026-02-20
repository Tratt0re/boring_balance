import {
  BarChart,
  EffectScatterChart,
  HeatmapChart,
  LineChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  TreemapChart,
} from 'echarts/charts';
import {
  CalendarComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TitleComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

// Register the chart types/components we want available app-wide.
echarts.use([
  BarChart,
  EffectScatterChart,
  HeatmapChart,
  LineChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  TreemapChart,
  CalendarComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TitleComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export { echarts };
