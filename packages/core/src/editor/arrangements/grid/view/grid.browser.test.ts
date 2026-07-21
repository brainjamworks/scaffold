import { afterEach, describe, expect, it } from "vite-plus/test";

import "./grid.css";

const CELL_CLASS_NAMES = ["sc-grid-cell", "sc-grid-cell-authoring"] as const;

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

function renderCell(
  className: "sc-grid-cell" | "sc-grid-cell-authoring",
  position: "top" | "middle" | "bottom",
) {
  const cell = document.createElement("div");
  cell.className = className;
  cell.dataset.verticalContentPosition = position;
  cell.style.cssText =
    "--sc-grid-cell-inset: 0; --sc-grid-cell-flow-gap: 0; width: 200px; height: 200px;";

  const content = document.createElement("div");
  content.className = `${className}__content`;
  content.style.height = "40px";
  cell.append(content);
  document.body.append(cell);

  return { cell, content };
}
