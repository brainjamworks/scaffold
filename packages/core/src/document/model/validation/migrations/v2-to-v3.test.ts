import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { v2ToV3CourseDocumentMigration } from "./v2-to-v3";

describe("v2-to-v3 Scaffold document migration", () => {
  it("converts matched and caption-only legacy figure content without losing meaning", () => {
    const firstCaption = {
      type: "paragraph",
      attrs: { textAlign: "center" },
      content: [
        { type: "text", text: "First ", marks: [{ type: "bold" }] },
        { type: "text", text: "caption" },
      ],
    } satisfies JSONContent;
    const captionOnly = {
      type: "paragraph",
      content: [{ type: "text", text: "Caption without a pin" }],
    } satisfies JSONContent;
    const source = v2Document([
      legacyAnnotatedFigure({
        pins: [
          { id: "pin-one", x: 12, y: 34 },
          { id: "pin-one", x: 80, y: 90 },
        ],
        captions: [
          firstCaption,
          { type: "paragraph", content: [{ type: "text", text: "Second" }] },
          captionOnly,
          { type: "paragraph" },
        ],
      }),
    ]);

    const migrated = v2ToV3CourseDocumentMigration.migrate(structuredClone(source));
    const figure = migrated.content?.[0]?.content?.[0]?.content?.[0];

    expect(migrated.content?.[0]?.attrs).toMatchObject({ schemaVersion: 3 });
    expect(figure?.attrs?.["data"]).toEqual({
      type: "annotated_figure",
      source: { mode: "external", src: "https://example.com/figure.png" },
      alt: "Annotated figure",
      captionDisplay: "list",
    });
    expect(figure?.content?.[0]).toEqual({ type: "annotated_figure_canvas" });
    expect(figure?.content?.[1]?.type).toBe("annotated_figure_legend");
    expect(figure?.content?.[1]?.content).toHaveLength(3);
    expect(figure?.content?.[1]?.content?.[0]).toEqual({
      type: "annotated_figure_annotation",
      attrs: { id: "pin-one", x: 12, y: 34 },
      content: [firstCaption],
    });
    expect(figure?.content?.[1]?.content?.[1]).toMatchObject({
      type: "annotated_figure_annotation",
      attrs: { x: 80, y: 90 },
    });
    expect(figure?.content?.[1]?.content?.[1]?.attrs?.["id"]).toEqual(expect.any(String));
    expect(figure?.content?.[1]?.content?.[1]?.attrs?.["id"]).not.toBe("pin-one");
    expect(figure?.content?.[1]?.content?.[2]).toMatchObject({
      type: "annotated_figure_annotation",
      attrs: { x: 50, y: 50 },
      content: [captionOnly],
    });
  });

  it("creates empty captions for legacy pins without matching legend rows", () => {
    const source = v2Document([
      legacyAnnotatedFigure({
        pins: [
          { id: "pin-one", x: 10, y: 20 },
          { x: 30, y: 40 },
        ],
        captions: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }],
      }),
    ]);

    const migrated = v2ToV3CourseDocumentMigration.migrate(structuredClone(source));
    const annotations = migrated.content?.[0]?.content?.[0]?.content?.[0]?.content?.[1]?.content;

    expect(annotations).toHaveLength(2);
    expect(annotations?.[1]).toMatchObject({
      type: "annotated_figure_annotation",
      attrs: { x: 30, y: 40, id: expect.any(String) },
      content: [{ type: "paragraph" }],
    });
  });

  it("rejects a non-paragraph legacy legend child at its exact path", () => {
    const source = v2Document([
      legacyAnnotatedFigure({
        pins: [{ id: "pin-one", x: 10, y: 20 }],
        captions: [{ type: "heading", attrs: { level: 2 } }],
      }),
    ]);

    expect(() => v2ToV3CourseDocumentMigration.migrate(source)).toThrow(
      "courseDocument.content[0].content[0].content[0].content[0].type is not a legacy paragraph",
    );
  });

  it("rejects invalid legacy coordinates at their exact path", () => {
    const source = v2Document([
      legacyAnnotatedFigure({
        pins: [{ id: "pin-one", x: 101, y: 20 }],
        captions: [{ type: "paragraph" }],
      }),
    ]);

    expect(() => v2ToV3CourseDocumentMigration.migrate(source)).toThrow(
      "courseDocument.content[0].content[0].attrs.data.pins[0].x does not match the v2 annotated figure format",
    );
  });

  it("rejects unknown legacy data at its exact path", () => {
    const source = v2Document([
      {
        ...legacyAnnotatedFigure({ pins: [], captions: [] }),
        attrs: {
          id: "annotated-figure-1",
          data: {
            type: "annotated_figure",
            source: null,
            alt: "",
            pins: [],
            unsupported: true,
          },
        },
      },
    ]);

    expect(() => v2ToV3CourseDocumentMigration.migrate(source)).toThrow(
      "courseDocument.content[0].content[0].attrs.data.unsupported does not match the v2 annotated figure format",
    );
  });
});

function v2Document(surfaceContent: JSONContent[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          schemaVersion: 2,
          mode: "page",
          surfaceSize: "fluid",
          overflowMode: "grow",
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

function legacyAnnotatedFigure({
  pins,
  captions,
}: {
  pins: Array<{ id?: string; x: number; y: number }>;
  captions: JSONContent[];
}): JSONContent {
  return {
    type: "annotated_figure",
    attrs: {
      id: "annotated-figure-1",
      data: {
        type: "annotated_figure",
        source: { mode: "external", src: "https://example.com/figure.png" },
        alt: "Annotated figure",
        pins,
      },
    },
    content: [{ type: "annotated_figure_legend", content: captions }],
  };
}
