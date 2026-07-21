import { describe, expect, it } from "vite-plus/test";

import {
  inferDataGridColumnTypes,
  normalizeDataGridValue,
  parseClipboardTable,
} from "./data-grid-model";

describe("data grid field model", () => {
  it("normalizes missing values to a two-column empty grid", () => {
    expect(normalizeDataGridValue(undefined)).toEqual({
      headers: ["Column 1", "Column 2"],
      rows: [["", ""]],
    });
  });

  it("pads ragged rows to the normalized header width", () => {
    expect(
      normalizeDataGridValue({
        headers: ["Fruit"],
        rows: [["Apples", "12"], ["Bananas"]],
      }),
    ).toEqual({
      headers: ["Fruit", "Column 2"],
      rows: [
        ["Apples", "12"],
        ["Bananas", ""],
      ],
    });
  });

  it("parses pasted tabular text as TSV or CSV", () => {
    expect(parseClipboardTable("Fruit\tVotes\nApples\t12")).toEqual([
      ["Fruit", "Votes"],
      ["Apples", "12"],
    ]);
    expect(parseClipboardTable('"Fruit, label",Votes\nApples,12')).toEqual([
      ["Fruit, label", "Votes"],
      ["Apples", "12"],
    ]);
  });

  it("infers numeric columns from populated cell values", () => {
    expect(
      inferDataGridColumnTypes(
        [
          ["Apples", "12", "1.5"],
          ["Bananas", "18", "2"],
        ],
        3,
      ),
    ).toEqual(["text", "number", "number"]);
  });

  it("keeps mixed and empty columns as text columns", () => {
    expect(
      inferDataGridColumnTypes(
        [
          ["Apples", "12"],
          ["Bananas", "n/a"],
          ["Cherries", ""],
        ],
        3,
      ),
    ).toEqual(["text", "text", "text"]);
  });
});
