import { describe, expect, it } from "vite-plus/test";

import { PdfEmbedDataSchema, PdfEmbedSourceSchema, type PdfEmbedData } from "./pdf-embed";

function normalizedIssues(result: ReturnType<typeof PdfEmbedDataSchema.safeParse>) {
  if (result.success) return [];
  return result.error.issues.map(({ code, path, message }) => ({ code, path, message }));
}

describe("PDF embed persisted contract", () => {
  it("preserves exact defaults and nullable source layering", () => {
    const data: PdfEmbedData = PdfEmbedDataSchema.parse({});

    expect(data).toEqual({
      type: "pdf_embed",
      source: null,
      initialPage: 1,
      title: "",
    });
    expect(PdfEmbedSourceSchema.parse(null)).toBeNull();
  });

  it("preserves external and managed source parsing", () => {
    expect(
      PdfEmbedDataSchema.parse({
        source: {
          mode: "external",
          src: "  https://example.com/file.pdf  ",
          ignored: true,
        },
        initialPage: 3,
        title: "Handbook",
        editorSelection: true,
      }),
    ).toEqual({
      type: "pdf_embed",
      source: { mode: "external", src: "https://example.com/file.pdf" },
      initialPage: 3,
      title: "Handbook",
    });
    expect(
      PdfEmbedSourceSchema.parse({ mode: "managed", mediaId: " asset-1 ", ignored: true }),
    ).toEqual({ mode: "managed", mediaId: " asset-1 " });
  });

  it("preserves normalized numeric issues and unsafe URL rejection", () => {
    expect(normalizedIssues(PdfEmbedDataSchema.safeParse({ initialPage: 0, title: 4 }))).toEqual([
      {
        code: "too_small",
        path: ["initialPage"],
        message: "Number must be greater than or equal to 1",
      },
      {
        code: "invalid_type",
        path: ["title"],
        message: "Expected string, received number",
      },
    ]);
    expect(
      PdfEmbedDataSchema.safeParse({
        source: { mode: "external", src: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
  });
});
