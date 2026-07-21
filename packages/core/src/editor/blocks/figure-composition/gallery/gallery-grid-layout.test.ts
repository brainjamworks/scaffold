import { describe, expect, it } from "vite-plus/test";

import { resolveGalleryGridLayout } from "./gallery-grid-layout";

describe("resolveGalleryGridLayout", () => {
  it.each([
    {
      input: { width: 400, height: 300, itemCount: 0, gap: 12 },
      expected: { columns: 0, rows: 0 },
    },
    {
      input: { width: 400, height: 300, itemCount: 1, gap: 12 },
      expected: { columns: 1, rows: 1 },
    },
    {
      input: { width: 800, height: 400, itemCount: 4, gap: 12 },
      expected: { columns: 3, rows: 2 },
    },
    {
      input: { width: 400, height: 800, itemCount: 4, gap: 12 },
      expected: { columns: 2, rows: 2 },
    },
    {
      input: { width: 1_000, height: 300, itemCount: 5, gap: 10 },
      expected: { columns: 5, rows: 1 },
    },
    {
      input: { width: 210, height: 100, itemCount: 2, gap: 10 },
      expected: { columns: 2, rows: 1 },
    },
  ])("chooses the largest common usable cell for $input", ({ input, expected }) => {
    expect(resolveGalleryGridLayout(input)).toEqual(expected);
  });

  it("prefers more columns when candidate usable sizes are equal", () => {
    expect(resolveGalleryGridLayout({ width: 800, height: 400, itemCount: 4, gap: 12 })).toEqual({
      columns: 3,
      rows: 2,
    });
  });

  it.each([
    { width: 0, height: 200, itemCount: 3, gap: 12 },
    { width: 200, height: 0, itemCount: 3, gap: 12 },
    { width: -1, height: 200, itemCount: 3, gap: 12 },
    { width: Number.NaN, height: 200, itemCount: 3, gap: 12 },
  ])("returns no tracks for a non-positive finite box", (input) => {
    expect(resolveGalleryGridLayout(input)).toEqual({ columns: 0, rows: 0 });
  });
});
