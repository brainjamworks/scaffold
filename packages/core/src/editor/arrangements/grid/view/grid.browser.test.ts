import { afterEach, describe, expect, it } from "vite-plus/test";

import "../authoring/grid-authoring.css";
import "./grid.css";

const CELL_CLASS_NAMES = ["sc-grid-cell", "sc-grid-cell sc-app-grid-cell-authoring"] as const;

afterEach(() => {
  document.body.replaceChildren();
});

describe("Cell vertical content geometry", () => {
  it.each(CELL_CLASS_NAMES)("positions %s content at Top, Middle, and Bottom", (className) => {
    for (const [position, expectedOffset] of [
      ["top", 0],
      ["middle", 80],
      ["bottom", 160],
    ] as const) {
      const { cell, content } = renderCell(className, position);

      expect(content.getBoundingClientRect().top - cell.getBoundingClientRect().top).toBeCloseTo(
        expectedOffset,
        0,
      );
    }
  });
});

describe("Grid authoring resize target", () => {
  it("provides a 24px minimum hit area without widening the visible divider", () => {
    const grid = document.createElement("div");
    grid.className = "sc-grid sc-app-grid-authoring";
    grid.style.cssText = "width: 320px; height: 96px;";

    const controls = document.createElement("div");
    controls.className = "sc-app-grid-column-controls";

    const handle = document.createElement("button");
    handle.className = "sc-app-grid-column-resize-handle";
    handle.style.setProperty("--sc-grid-column-position", "50%");
    controls.append(handle);
    grid.append(controls);
    document.body.append(grid);

    expect(handle.getBoundingClientRect().width).toBeGreaterThanOrEqual(24);
    expect(getComputedStyle(handle, "::before").width).toBe("1px");
  });
});

function renderCell(
  className: (typeof CELL_CLASS_NAMES)[number],
  position: "top" | "middle" | "bottom",
) {
  const cell = document.createElement("div");
  cell.className = className;
  cell.dataset.verticalContentPosition = position;
  cell.style.cssText =
    "--sc-grid-cell-inset: 0; --sc-grid-cell-flow-gap: 0; width: 200px; height: 200px;";

  const content = document.createElement("div");
  content.className = "sc-grid-cell__content";
  content.style.height = "40px";
  cell.append(content);
  document.body.append(cell);

  return { cell, content };
}
