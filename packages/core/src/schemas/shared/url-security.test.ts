import { describe, expect, it } from "vite-plus/test";
import {
  GalleryItemDataSchema,
  PdfEmbedDataSchema,
  TextWrapImageDataSchema,
} from "@scaffold/contracts";

import { AnnotatedFigureDataSchema } from "@scaffold/contracts";

describe("authored external URL schemas", () => {
  it("accepts http and https external media URLs", () => {
    expect(
      GalleryItemDataSchema.parse({
        image: {
          mode: "external",
          src: "https://example.com/image.png",
        },
      }),
    ).toMatchObject({ image: { src: "https://example.com/image.png" } });
    expect(
      PdfEmbedDataSchema.parse({
        source: { mode: "external", src: "http://example.com/file.pdf" },
      }),
    ).toMatchObject({
      source: { src: "http://example.com/file.pdf" },
    });
  });

  it.each([
    [
      "gallery",
      () =>
        GalleryItemDataSchema.parse({
          image: {
            mode: "external",
            src: "javascript:alert(1)",
          },
        }),
    ],
    [
      "pdf",
      () =>
        PdfEmbedDataSchema.parse({
          source: { mode: "external", src: "data:application/pdf;base64,abc" },
        }),
    ],
    [
      "text wrap image",
      () =>
        TextWrapImageDataSchema.parse({
          source: { mode: "external", src: "blob:https://example.com/id" },
        }),
    ],
    [
      "annotated figure",
      () =>
        AnnotatedFigureDataSchema.parse({
          source: { mode: "external", src: "javascript:alert(1)" },
        }),
    ],
  ])("rejects unsafe external URLs for %s", (_label, parse) => {
    expect(parse).toThrow(/URL must use http or https/);
  });
});
