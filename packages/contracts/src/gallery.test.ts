import { describe, expect, it } from "vite-plus/test";

import {
  GalleryDataSchema,
  GalleryItemDataSchema,
  GalleryLayoutSchema,
  type GalleryData,
  type GalleryItemData,
} from "./gallery";

const emptyRichText = {
  type: "doc" as const,
  content: [{ type: "paragraph" }],
};

const richCaption = {
  type: "doc" as const,
  attrs: { language: "en" },
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "A rich caption", marks: [{ type: "bold" }] }],
      editorOnly: "preserved",
    },
  ],
  extensionField: true,
};

function normalizedIssues(result: ReturnType<typeof GalleryDataSchema.safeParse>) {
  if (result.success) return [];
  return result.error.issues.map(({ code, path, message }) => ({ code, path, message }));
}

describe("gallery persisted contract", () => {
  it("preserves enum order and exact defaults", () => {
    expect(GalleryLayoutSchema.options).toEqual(["carousel", "grid"]);

    const data: GalleryData = GalleryDataSchema.parse({});
    const item: GalleryItemData = GalleryItemDataSchema.parse({});

    expect(data).toEqual({
      type: "gallery",
      layout: "carousel",
      caption: emptyRichText,
    });
    expect(item).toEqual({ image: null, caption: emptyRichText });
  });

  it("preserves canonical rich text and image parsing", () => {
    expect(
      GalleryDataSchema.parse({ layout: "grid", caption: richCaption, ignored: true }),
    ).toEqual({
      type: "gallery",
      layout: "grid",
      caption: richCaption,
    });
    expect(
      GalleryItemDataSchema.parse({
        image: { mode: "managed", mediaId: " asset-1 ", alt: "  " },
        caption: richCaption,
        ignored: true,
      }),
    ).toEqual({
      image: { mode: "managed", mediaId: " asset-1 ", alt: "  " },
      caption: richCaption,
    });
    expect(
      GalleryItemDataSchema.parse({
        image: {
          mode: "external",
          src: "  https://example.com/image.jpg  ",
          alt: "External image",
        },
      }),
    ).toEqual({
      image: {
        mode: "external",
        src: "https://example.com/image.jpg",
        alt: "External image",
      },
      caption: emptyRichText,
    });
  });

  it("preserves nullable media and unknown-key stripping", () => {
    expect(GalleryItemDataSchema.parse({ image: null, editorSelection: true })).toEqual({
      image: null,
      caption: emptyRichText,
    });
  });

  it("preserves normalized invalid-value issues", () => {
    expect(normalizedIssues(GalleryDataSchema.safeParse({ layout: "stack", caption: 4 }))).toEqual([
      {
        code: "invalid_enum_value",
        path: ["layout"],
        message: "Invalid enum value. Expected 'carousel' | 'grid', received 'stack'",
      },
      {
        code: "invalid_type",
        path: ["caption"],
        message: "Expected object, received number",
      },
    ]);
    expect(
      GalleryItemDataSchema.safeParse({
        image: { mode: "external", src: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
    expect(GalleryItemDataSchema.safeParse({ image: { mode: "upload" } }).success).toBe(false);
  });
});
