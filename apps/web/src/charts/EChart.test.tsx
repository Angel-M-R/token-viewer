import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const dispose = vi.fn();
  const resize = vi.fn();
  const setOption = vi.fn();
  const init = vi.fn(() => ({ dispose, resize, setOption }));
  return { dispose, resize, setOption, init };
});

vi.mock("echarts/core", () => ({
  use: vi.fn(),
  registerTheme: vi.fn(),
  init: mocks.init,
}));
vi.mock("echarts/charts", () => ({ BarChart: {}, GaugeChart: {}, HeatmapChart: {}, LineChart: {} }));
vi.mock("echarts/components", () => ({
  CalendarComponent: {},
  GridComponent: {},
  LegendComponent: {},
  TooltipComponent: {},
  VisualMapComponent: {},
}));
vi.mock("echarts/renderers", () => ({ CanvasRenderer: {} }));

import { EChart } from "./EChart";

describe("EChart", () => {
  beforeEach(() => {
    mocks.dispose.mockClear();
    mocks.resize.mockClear();
    mocks.setOption.mockClear();
    mocks.init.mockClear();
  });

  it("initializes, sets options, and disposes on unmount", () => {
    const { unmount } = render(
      <EChart option={{ series: [] }} theme="tokenviewer-light" ariaLabel="Example chart" />,
    );

    expect(mocks.init).toHaveBeenCalledOnce();
    expect(mocks.setOption).toHaveBeenCalledWith({ series: [] }, { notMerge: true });

    unmount();
    expect(mocks.dispose).toHaveBeenCalled();
  });
});
