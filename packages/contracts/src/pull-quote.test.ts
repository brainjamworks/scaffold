import { describe, expect, it } from "vite-plus/test";

import { PullQuoteAlignSchema, PullQuoteDataSchema, type PullQuoteData } from "./index";

describe("pull quote content contract", () => {
  it("preserves the canonical serialized data shape", () => {
    const data: PullQuoteData = {
      type: "pull_quote",
      align: "center",
    };

    expect(PullQuoteDataSchema.parse(data)).toEqual(data);
  });

  it("preserves the supported alignment values", () => {
    expect(PullQuoteAlignSchema.options).toEqual(["left", "center"]);
  });

  it("preserves the serialized defaults", () => {
    expect(PullQuoteDataSchema.parse({})).toEqual({
      type: "pull_quote",
      align: "left",
    });
  });

  it("preserves unknown-key stripping", () => {
    expect(
      PullQuoteDataSchema.parse({
        type: "pull_quote",
        align: "center",
        presentation: "full-bleed",
      }),
    ).toEqual({
      type: "pull_quote",
      align: "center",
    });
  });

  it("rejects invalid serialized values", () => {
    expect(PullQuoteDataSchema.safeParse({ type: "quote", align: "left" }).success).toBe(false);
    expect(PullQuoteDataSchema.safeParse({ type: "pull_quote", align: "right" }).success).toBe(
      false,
    );
  });
});
