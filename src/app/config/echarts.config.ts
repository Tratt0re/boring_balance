import {
  BarChart,
  LineChart,
  PieChart,
  RadarChart,
  SankeyChart,
  TreemapChart,
} from 'echarts/charts';
import {
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TitleComponent,
  TooltipComponent,
  TransformComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

// Register the chart types/components we want available app-wide.
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  RadarChart,
  SankeyChart,
  TreemapChart,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TitleComponent,
  TooltipComponent,
  TransformComponent,
  CanvasRenderer,
]);

export { echarts };
