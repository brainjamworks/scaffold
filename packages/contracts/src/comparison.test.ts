import { describe, expect, it } from "vite-plus/test";

import { ComparisonDataSchema, type ComparisonData } from "./index";

describe("comparison content contract", () => {
  it("preserves the canonical serialized data shape", () => {
    const data: ComparisonData = {
      type: "comparison",
      leftLabel: "Before",
      rightLabel: "After",
    };

    expect(ComparisonDataSchema.parse(data)).toEqual(data);
  });

  it("preserves the serialized defaults", () => {
    expect(ComparisonDataSchema.parse({})).toEqual({
      type: "comparison",
      leftLabel: "Option A",
      rightLabel: "Option B",
    });
  });

  it("preserves unknown-key stripping", () => {
    expect(
      ComparisonDataSchema.parse({
        type: "comparison",
        leftLabel: "Before",
        rightLabel: "After",
        columnCount: 2,
      }),
    ).toEqual({
      type: "comparison",
      leftLabel: "Before",
      rightLabel: "After",
    });
  });

  it("rejects invalid serialized values", () => {
    expect(
      ComparisonDataSchema.safeParse({
        type: "compare",
        leftLabel: "Before",
        rightLabel: "After",
      }).success,
    ).toBe(false);
    expect(
      ComparisonDataSchema.safeParse({
        type: "comparison",
        leftLabel: 1,
        rightLabel: "After",
      }).success,
    ).toBe(false);
  });
});
