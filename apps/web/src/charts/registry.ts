import { BarChart, GaugeChart, HeatmapChart, LineChart } from "echarts/charts";
import {
  CalendarComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { chartPalette } from "../theme/providers";

echarts.use([
  BarChart,
  GaugeChart,
  HeatmapChart,
  LineChart,
  CalendarComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

let themesRegistered = false;

export function registerTokenviewerThemes(): void {
  if (themesRegistered) return;
  themesRegistered = true;

  echarts.registerTheme("tokenviewer-light", {
    color: chartPalette(),
    backgroundColor: "transparent",
    textStyle: { color: "#20251f" },
    legend: { textStyle: { color: "#4e574f" } },
    tooltip: {
      backgroundColor: "#fcfbf7",
      borderColor: "#d8d1c4",
      textStyle: { color: "#20251f" },
    },
  });

  echarts.registerTheme("tokenviewer-dark", {
    color: chartPalette(),
    backgroundColor: "transparent",
    textStyle: { color: "#ede9df" },
    legend: { textStyle: { color: "#bdb8aa" } },
    tooltip: {
      backgroundColor: "#1c1f1d",
      borderColor: "#3d443f",
      textStyle: { color: "#ede9df" },
    },
  });
}

export { echarts };
export type { EChartsCoreOption } from "echarts/core";
