// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createChartSample } from "./chart-samples";
import { Chart } from "./Chart";

vi.mock("./chart-renderer", () => ({
  ChartRenderer: ({ ariaLabel }: { ariaLabel: string }) => (
    <div aria-label={ariaLabel} className="sc-course-chart__visual" role="img" />
  ),
}));

afterEach(cleanup);

describe("Chart Course presentation", () => {
  it.each([
    { caption: "Learner confidence", title: "Confidence", expected: "Learner confidence" },
    { caption: "", title: "Confidence", expected: "Confidence" },
    { caption: "   ", title: "   ", expected: "Bar chart" },
  ])("names the visual and data table from $expected", ({ caption, title, expected }) => {
    const chart = { ...createChartSample("bar"), caption, title };
    const { container } = render(<Chart chart={chart} showCaption />);

    expect(container.querySelector("figure")).toHaveClass("sc-course-chart__figure");
    expect(screen.getByRole("img", { name: expected })).toHaveClass("sc-course-chart__visual");
    expect(screen.getByRole("table", { name: `${expected} data table` })).toBeInTheDocument();
    expect(container.querySelector('[class*="sc-chart"]')).toBeNull();
  });
});
