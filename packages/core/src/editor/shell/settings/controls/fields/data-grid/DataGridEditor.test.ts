// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vite-plus/test";

import { repairRevoGridAria } from "./DataGridEditor";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("repairRevoGridAria", () => {
  it("projects a valid one-based grid hierarchy over RevoGrid's zero-based attributes", () => {
    document.body.innerHTML = `
      <div id="shell">
        <revo-grid role="treegrid" aria-colcount="2" aria-rowcount="2">
          <revogr-attribution>
            <a href="https://rv-grid.com">RevoGrid</a>
          </revogr-attribution>
          <revogr-viewport-scroll row-header>
            <revogr-header>
              <div class="header-rgRow">
                <div class="rgHeaderCell" role="columnheader" data-rgcol="0" aria-colindex="0"></div>
              </div>
            </revogr-header>
          </revogr-viewport-scroll>
          <revogr-header>
            <div class="header-rgRow">
              <div class="rgHeaderCell" role="columnheader" data-rgcol="0" aria-colindex="0">Category</div>
              <div class="rgHeaderCell" role="columnheader" data-rgcol="1" aria-colindex="1">Value</div>
            </div>
          </revogr-header>
          <revogr-data slot="content">
            <div class="rgRow" role="row" data-rgrow="0" aria-rowindex="0">
              <div class="rgCell">1</div>
            </div>
          </revogr-data>
          <revogr-data slot="data">
            <div class="rgRow" role="row" data-rgrow="0" aria-rowindex="0">
              <div class="rgCell" role="gridcell" data-rgcol="0" data-rgrow="0" aria-colindex="0" aria-rowindex="0">Apples</div>
              <div class="rgCell" role="gridcell" data-rgcol="1" data-rgrow="0" aria-colindex="1" aria-rowindex="0">34</div>
            </div>
          </revogr-data>
          <revogr-data slot="data" type="rowPinEnd"></revogr-data>
        </revo-grid>
      </div>
    `;

    const shell = document.querySelector("#shell");
    if (!shell) throw new Error("Expected grid shell fixture");
    repairRevoGridAria(shell, { columnCount: 2, rowCount: 2 });

    const grid = shell.querySelector("revo-grid");
    expect(grid).toHaveAttribute("role", "grid");
    expect(grid).toHaveAttribute("aria-colcount", "2");
    expect(grid).toHaveAttribute("aria-rowcount", "3");
    expect(shell.querySelector("revogr-attribution")).toHaveAttribute("aria-hidden", "true");
    expect(shell.querySelector("revogr-attribution a")).toHaveAttribute("tabindex", "-1");
    expect(shell.querySelector("revogr-header")).toHaveAttribute("role", "rowgroup");
    expect(shell.querySelector(".header-rgRow")).toHaveAttribute("role", "row");
    expect(shell.querySelector(".header-rgRow")).toHaveAttribute("aria-rowindex", "1");
    expect(shell.querySelector('[data-rgcol="0"][role="columnheader"]')).toHaveAttribute(
      "aria-colindex",
      "1",
    );
    expect(shell.querySelector('revogr-data[slot="content"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(shell.querySelector("revogr-viewport-scroll[row-header]")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(shell.querySelector('revogr-data[type="rowPinEnd"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(shell.querySelector('revogr-data[type="rowPinEnd"]')).not.toHaveAttribute(
      "role",
      "rowgroup",
    );
    expect(shell.querySelector('revogr-data[slot="data"]')).toHaveAttribute("role", "rowgroup");
    expect(shell.querySelector('revogr-data[slot="data"] .rgRow')).toHaveAttribute(
      "aria-rowindex",
      "2",
    );
    expect(shell.querySelector('revogr-data[slot="data"] [data-rgcol="0"]')).toHaveAttribute(
      "aria-colindex",
      "1",
    );
    expect(shell.querySelector('revogr-data[slot="data"] [data-rgcol="0"]')).toHaveAttribute(
      "aria-rowindex",
      "2",
    );
  });
});
