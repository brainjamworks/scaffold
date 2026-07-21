import { describe, expect, it } from "vite-plus/test";

import {
  ChapterEpigraphAlignSchema,
  ChapterEpigraphDataSchema,
  type ChapterEpigraphData,
} from "./index";

describe("chapter epigraph content contract", () => {
  it("preserves the canonical serialized data shape", () => {
    const data: ChapterEpigraphData = {
      type: "chapter_epigraph",
      align: "left",
    };

    expect(ChapterEpigraphDataSchema.parse(data)).toEqual(data);
  });

  it("preserves the supported alignment values", () => {
    expect(ChapterEpigraphAlignSchema.options).toEqual(["left", "center"]);
  });

  it("preserves the serialized defaults", () => {
    expect(ChapterEpigraphDataSchema.parse({})).toEqual({
      type: "chapter_epigraph",
      align: "center",
    });
  });

  it("preserves unknown-key stripping", () => {
    expect(
      ChapterEpigraphDataSchema.parse({
        type: "chapter_epigraph",
        align: "left",
        presentation: "full-bleed",
      }),
    ).toEqual({
      type: "chapter_epigraph",
      align: "left",
    });
  });

  it("rejects invalid serialized values", () => {
    expect(ChapterEpigraphDataSchema.safeParse({ type: "epigraph", align: "left" }).success).toBe(
      false,
    );
    expect(
      ChapterEpigraphDataSchema.safeParse({ type: "chapter_epigraph", align: "right" }).success,
    ).toBe(false);
  });
});
