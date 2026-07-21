import { describe, expect, it } from "vite-plus/test";

import { GlossaryDataSchema, type GlossaryData } from "./index";

describe("glossary content contract", () => {
  it("preserves the canonical serialized data shape", () => {
    const data: GlossaryData = {
      type: "glossary",
    };

    expect(GlossaryDataSchema.parse(data)).toEqual(data);
  });

  it("preserves the serialized defaults", () => {
    expect(GlossaryDataSchema.parse({})).toEqual({
      type: "glossary",
    });
  });

  it("preserves unknown-key stripping", () => {
    expect(
      GlossaryDataSchema.parse({
        type: "glossary",
        selectedTermId: "term-1",
      }),
    ).toEqual({
      type: "glossary",
    });
  });

  it("rejects an invalid discriminator", () => {
    expect(GlossaryDataSchema.safeParse({ type: "dictionary" }).success).toBe(false);
  });
});
