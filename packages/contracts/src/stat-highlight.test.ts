import { describe, expect, it } from "vite-plus/test";

import { StatHighlightAlignSchema, StatHighlightDataSchema, type StatHighlightData } from "./index";

describe("stat highlight content contract", () => {
  it("preserves the canonical serialized data shape", () => {
    const data: StatHighlightData = {
      type: "stat_highlight",
      align: "center",
    };

    expect(StatHighlightDataSchema.parse(data)).toEqual(data);
  });

  it("preserves the supported alignment values", () => {
    expect(StatHighlightAlignSchema.options).toEqual(["left", "center"]);
  });

  it("preserves the serialized defaults", () => {
    expect(StatHighlightDataSchema.parse({})).toEqual({
      type: "stat_highlight",
      align: "left",
    });
  });

  it("preserves unknown-key stripping", () => {
    expect(
      StatHighlightDataSchema.parse({
        type: "stat_highlight",
        align: "center",
        presentation: "full-bleed",
      }),
    ).toEqual({
      type: "stat_highlight",
      align: "center",
    });
  });

  it("rejects invalid serialized values", () => {
    expect(StatHighlightDataSchema.safeParse({ type: "stat", align: "left" }).success).toBe(false);
    expect(
      StatHighlightDataSchema.safeParse({ type: "stat_highlight", align: "right" }).success,
    ).toBe(false);
  });
});
