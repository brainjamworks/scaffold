import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { EmptyScaffoldRichTextDocument } from "@/schemas/rich-text";

import { validateCourseDocumentJSON } from "../validators";
import { v1ToV2CourseDocumentMigration } from "./v1-to-v2";
import { v2ToV3CourseDocumentMigration } from "./v2-to-v3";

const LEGACY_FIGURE_LAYOUTS = ["row-2", "row-3", "grid", "lead", "stack"] as const;

describe("v1-to-v2 Scaffold document migration", () => {
  it("normalizes empty and populated legacy Galleries without losing identity or media", () => {
    const source = v1Document([
      {
        type: "gallery",
        attrs: {
          id: "gallery-empty",
          retained: "parent-attr",
          data: { type: "gallery", layout: "carousel", showCaptions: false },
        },
      },
      {
        type: "gallery",
        attrs: {
          id: "gallery-populated",
          data: { type: "gallery", layout: "grid", showCaptions: true },
        },
        content: [
          {
            type: "gallery_item",
            attrs: {
              id: "managed-item",
              retained: "item-attr",
              data: {
                mode: "managed",
                mediaId: "media-1",
                alt: "Managed alt",
                caption: "Managed caption",
              },
            },
          },
          {
            type: "gallery_item",
            attrs: {
              id: "external-item",
              data: {
                mode: "external",
                src: "https://example.com/external.png",
                alt: "External alt",
                caption: "External caption",
              },
            },
          },
          {
            type: "gallery_item",
            attrs: { id: "empty-item", data: null },
          },
        ],
      },
      { type: "paragraph", attrs: { retained: "unrelated" } },
    ]);

    const migrated = expectSuccessfulMigration(source);
    const surfaceContent = migrated.content?.[0]?.content?.[0]?.content;

    expect(surfaceContent).toEqual([
      {
        type: "gallery",
        attrs: {
          id: "gallery-empty",
          retained: "parent-attr",
          data: {
            type: "gallery",
            layout: "carousel",
            caption: EmptyScaffoldRichTextDocument,
          },
        },
      },
      {
        type: "gallery",
        attrs: {
          id: "gallery-populated",
          data: {
            type: "gallery",
            layout: "grid",
            caption: EmptyScaffoldRichTextDocument,
          },
        },
        content: [
          {
            type: "gallery_item",
            attrs: {
              id: "managed-item",
              retained: "item-attr",
              data: {
                image: { mode: "managed", mediaId: "media-1", alt: "Managed alt" },
                caption: richText("Managed caption"),
              },
            },
          },
          {
            type: "gallery_item",
            attrs: {
              id: "external-item",
              data: {
                image: {
                  mode: "external",
                  src: "https://example.com/external.png",
                  alt: "External alt",
                },
                caption: richText("External caption"),
              },
            },
          },
          {
            type: "gallery_item",
            attrs: {
              id: "empty-item",
              data: { image: null, caption: EmptyScaffoldRichTextDocument },
            },
          },
        ],
      },
      { type: "paragraph", attrs: { retained: "unrelated" } },
    ]);
    expect(
      validateCourseDocumentJSON(v2ToV3CourseDocumentMigration.migrate(structuredClone(migrated)))
        .ok,
    ).toBe(true);
  });

  it.each(LEGACY_FIGURE_LAYOUTS)("maps legacy Figure layout %s to Grid", (layout) => {
    const sharedCaption = [
      {
        type: "paragraph",
        attrs: { textAlign: "center" },
        content: [
          { type: "text", text: "Shared ", marks: [{ type: "italic" }] },
          {
            type: "text",
            text: "caption",
            marks: [{ type: "link", attrs: { href: "https://example.com" } }],
          },
        ],
      },
    ];
    const source = v1Document([
      {
        type: "figure_pair",
        attrs: {
          id: `figures-${layout}`,
          retained: "parent-attr",
          data: { type: "figure_pair", layout },
        },
        content: [
          {
            type: "figure_pair_figure",
            attrs: {
              id: "managed-figure",
              data: {
                source: { mode: "managed", mediaId: "media-1" },
                alt: "Managed alt",
                caption: "Managed caption",
              },
            },
          },
          {
            type: "figure_pair_figure",
            attrs: {
              id: "external-figure",
              data: {
                source: { mode: "external", src: "https://example.com/figure.png" },
                alt: "External alt",
                caption: "External caption",
              },
            },
          },
          {
            type: "figure_pair_figure",
            attrs: {
              id: "empty-figure",
              data: { source: null, alt: "Empty alt", caption: "" },
            },
          },
          { type: "figure_pair_caption", content: sharedCaption },
        ],
      },
    ]);

    const migrated = expectSuccessfulMigration(source);
    const gallery = migrated.content?.[0]?.content?.[0]?.content?.[0];

    expect(gallery).toEqual({
      type: "gallery",
      attrs: {
        id: `figures-${layout}`,
        retained: "parent-attr",
        data: {
          type: "gallery",
          layout: "grid",
          caption: { type: "doc", content: sharedCaption },
        },
      },
      content: [
        {
          type: "gallery_item",
          attrs: {
            id: "managed-figure",
            data: {
              image: { mode: "managed", mediaId: "media-1", alt: "Managed alt" },
              caption: richText("Managed caption"),
            },
          },
        },
        {
          type: "gallery_item",
          attrs: {
            id: "external-figure",
            data: {
              image: {
                mode: "external",
                src: "https://example.com/figure.png",
                alt: "External alt",
              },
              caption: richText("External caption"),
            },
          },
        },
        {
          type: "gallery_item",
          attrs: {
            id: "empty-figure",
            data: { image: null, caption: EmptyScaffoldRichTextDocument },
          },
        },
      ],
    });
  });

  it("rejects malformed legacy media instead of stamping it as v2", () => {
    const source = v1Document([
      {
        type: "gallery",
        attrs: {
          id: "gallery-1",
          data: { type: "gallery", layout: "grid", showCaptions: true },
        },
        content: [
          {
            type: "gallery_item",
            attrs: {
              id: "item-1",
              data: { mode: "external", src: "not-a-url", alt: "", caption: "" },
            },
          },
        ],
      },
    ]);

    expect(() => v1ToV2CourseDocumentMigration.migrate(source)).toThrow(
      "courseDocument.content[0].content[0].content[0].attrs.data does not match the v1 format",
    );
  });
});

function v1Document(surfaceContent: JSONContent[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          schemaVersion: 1,
          mode: "page",
          surfaceSize: "fluid",
          overflowMode: "grow",
          retained: "course-document-attr",
        },
        content: [
          {
            type: "surface",
            attrs: { id: "surface-1", variant: "page-default" },
            content: surfaceContent,
          },
        ],
      },
    ],
  };
}

function expectSuccessfulMigration(source: JSONContent): JSONContent {
  const migrated = v1ToV2CourseDocumentMigration.migrate(structuredClone(source));
  expect(migrated).toMatchObject({
    content: [
      {
        attrs: {
          schemaVersion: 2,
        },
      },
    ],
  });
  return migrated;
}

function richText(text: string): JSONContent {
  if (!text) return EmptyScaffoldRichTextDocument;
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}
