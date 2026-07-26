import { useEffect, useRef } from "react";
import { echarts, registerTokenviewerThemes, type EChartsCoreOption } from "./registry";
import type { ThemeName } from "../theme/useTheme";

interface EChartProps {
  option: EChartsCoreOption;
  theme: ThemeName;
  className?: string;
  ariaLabel: string;
}

export function EChart({ option, theme, className, ariaLabel }: EChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    registerTokenviewerThemes();
  }, []);

  useEffect(() => {
    if (!ref.current) return;

    chartRef.current?.dispose();
    chartRef.current = echarts.init(ref.current, theme, { renderer: "canvas" });
    chartRef.current.setOption(option, { notMerge: true });

    const observer = new ResizeObserver(() => {
      chartRef.current?.resize();
    });
    observer.observe(ref.current);

    return () => {
      observer.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [option, theme]);

  return <div ref={ref} className={className ?? "chart"} role="img" aria-label={ariaLabel} />;
}

