import { describe, expect, it } from "vite-plus/test";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import "@/editor/blocks/assessment/mcq/mcq-definition";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";

import { createScaffoldDocumentContent } from "@/format/artifact";
import { validateCourseDocumentJSON } from "./validators";

describe("course document JSON helpers", () => {
  it("accepts a fixed signature with optional leading header and trailing footer", () => {
    const content = fixedDocument([
      header("surface_header"),
      ...fixedChildren(),
      header("surface_footer"),
    ]);

    expect(validateCourseDocumentJSON(content)).toEqual({ ok: true, issues: [] });
  });

  it("reports a wrong fixed heading level at its exact child attribute path", () => {
    const content = fixedDocument([
      header("surface_header"),
      { type: "heading", attrs: { level: 2 } },
      { type: "slide_cover_subtitle" },
      header("surface_footer"),
    ]);

    expect(validateCourseDocumentJSON(content).issues).toContainEqual({
      code: "fixed_surface_child_attribute_mismatch",
      message: 'fixed surface child 0 "heading" must have attribute "level" equal to 1; received 2',
      path: ["content", 0, "content", 0, "content", 1, "attrs", "level"],
    });
  });

  it("reports wrong fixed child order at the exact child type path", () => {
    const content = fixedDocument([
      { type: "slide_cover_subtitle" },
      { type: "heading", attrs: { level: 1 } },
    ]);

    expect(validateCourseDocumentJSON(content).issues).toContainEqual({
      code: "fixed_surface_child_type_mismatch",
      message: 'fixed surface child 0 must be "heading"; received "slide_cover_subtitle"',
      path: ["content", 0, "content", 0, "content", 0, "type"],
    });
  });

  it("reports a missing fixed child at the exact missing child path", () => {
    const content = fixedDocument(fixedChildren().slice(0, 1));

    expect(validateCourseDocumentJSON(content).issues).toContainEqual({
      code: "fixed_surface_child_count_mismatch",
      message: "fixed surface signature requires 2 children; received 1",
      path: ["content", 0, "content", 0, "content", 1],
    });
  });

  it("reports an extra fixed child at the exact extra child path", () => {
    const content = fixedDocument([
      ...fixedChildren(),
      { type: "paragraph" },
      header("surface_footer"),
    ]);

    expect(validateCourseDocumentJSON(content).issues).toContainEqual({
      code: "fixed_surface_child_count_mismatch",
      message: "fixed surface signature requires 2 children; received 3",
      path: ["content", 0, "content", 0, "content", 2],
    });
  });

  it("reports a prepended extra fixed child at its exact path", () => {
    const content = fixedDocument([{ type: "paragraph" }, ...fixedChildren()]);

    expect(validateCourseDocumentJSON(content).issues).toContainEqual({
      code: "fixed_surface_child_count_mismatch",
      message: "fixed surface signature requires 2 children; received 3",
      path: ["content", 0, "content", 0, "content", 0],
    });
  });

  it("reports a missing internal fixed child before the next child", () => {
    const children = fixedChildren();
    const content = fixedDocument([
      header("surface_header"),
      children[0]!,
      header("surface_footer"),
    ]);

    expect(validateCourseDocumentJSON(content).issues).toContainEqual({
      code: "fixed_surface_child_count_mismatch",
      message: "fixed surface signature requires 2 children; received 1",
      path: ["content", 0, "content", 0, "content", 2],
    });
  });

  it("creates a valid empty course document with one surface", () => {
    const content = createScaffoldDocumentContent({
      mode: "page",
      surfaceId: "surface-1",
    });

    expect(content).toMatchObject({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
            mode: "page",
            surfaceSize: "fluid",
            overflowMode: "grow",
          },
          content: [
            {
              type: "surface",
              attrs: {
                id: "surface-1",
                variant: "page-default",
              },
            },
          ],
        },
      ],
    });
    expect(validateCourseDocumentJSON(content).ok).toBe(true);
  });

  it("rejects persisted surface sizes that conflict with course mode", () => {
    const slideshow = createScaffoldDocumentContent({ mode: "slideshow" });
    const page = createScaffoldDocumentContent({ mode: "page" });
    const branching = structuredClone(page);
    branching.content![0]!.attrs!.mode = "branching";

    expect(validateCourseDocumentJSON(slideshow).ok).toBe(true);
    expect(validateCourseDocumentJSON(page).ok).toBe(true);
    expect(validateCourseDocumentJSON(branching).issues).not.toContainEqual(
      expect.objectContaining({ code: "invalid_course_document_attrs" }),
    );

    const invalidSlideshow = structuredClone(slideshow);
    invalidSlideshow.content![0]!.attrs!.surfaceSize = "fluid";
    const invalidPage = structuredClone(page);
    invalidPage.content![0]!.attrs!.surfaceSize = "16x9";
    const invalidBranching = structuredClone(branching);
    invalidBranching.content![0]!.attrs!.surfaceSize = "16x9";

    for (const invalid of [invalidSlideshow, invalidPage, invalidBranching]) {
      expect(validateCourseDocumentJSON(invalid).issues).toContainEqual(
        expect.objectContaining({ code: "invalid_course_document_attrs" }),
      );
    }
  });

  it("creates a surface with an editable paragraph anchor", () => {
    const content = createScaffoldDocumentContent({
      mode: "page",
      surfaceId: "surface-1",
    });
    const surface = content.content?.[0]?.content?.[0];

    expect(surface).toMatchObject({
      type: "surface",
      attrs: { id: "surface-1", variant: "page-default" },
      content: [{ type: "paragraph" }],
    });
    expect(validateCourseDocumentJSON(content).ok).toBe(true);
  });

  it("reports page documents with multiple surfaces without repair instructions", () => {
    const first = createScaffoldDocumentContent({
      mode: "page",
      surfaceId: "surface-1",
    });
    const secondSurface = {
      type: "surface",
      attrs: { id: "surface-2", variant: "page-default" },
      content: [{ type: "paragraph" }],
    };
    const courseDocument = first.content?.[0];
    const twoSurfacePage = {
      ...first,
      content: [
        {
          ...courseDocument,
          content: [...(courseDocument?.content ?? []), secondSurface],
        },
      ],
    };

    expect(validateCourseDocumentJSON(twoSurfacePage).issues).toContainEqual(
      expect.objectContaining({
        code: "invalid_surface_cardinality",
      }),
    );
    expect(
      validateCourseDocumentJSON(twoSurfacePage).issues.every((issue) => !("repair" in issue)),
    ).toBe(true);
  });

  it("rejects slideshow and branching documents without surfaces", () => {
    const slideshow = {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
            mode: "slideshow",
            surfaceSize: "16x9",
            overflowMode: "clip",
          },
          content: [],
        },
      ],
    };
    const branching = {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
            mode: "branching",
          },
          content: [],
        },
      ],
    };

    expect(validateCourseDocumentJSON(slideshow).issues).toContainEqual(
      expect.objectContaining({ code: "invalid_surface_cardinality" }),
    );
    expect(validateCourseDocumentJSON(branching).issues).toContainEqual(
      expect.objectContaining({ code: "unsupported_surface_mode" }),
    );
  });

  it("reports invalid top-level course document attrs", () => {
    const invalid = {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
            mode: "deck",
          },
          content: [
            {
              type: "surface",
              attrs: { id: "surface-1", variant: "page-default" },
            },
          ],
        },
      ],
    };

    expect(validateCourseDocumentJSON(invalid).issues).toContainEqual(
      expect.objectContaining({ code: "invalid_course_document_attrs" }),
    );
  });

  it("reports missing schemaVersion as invalid course document attrs", () => {
    const invalid = {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode: "page" },
          content: [
            {
              type: "surface",
              attrs: { id: "surface-1", variant: "page-default" },
            },
          ],
        },
      ],
    };

    expect(validateCourseDocumentJSON(invalid).issues).toContainEqual(
      expect.objectContaining({ code: "invalid_course_document_attrs" }),
    );
  });

  it("reports surfaces without variants as invalid surface attrs", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
            mode: "page",
            surfaceSize: "fluid",
            overflowMode: "grow",
          },
          content: [{ type: "surface", attrs: { id: "surface-1" } }],
        },
      ],
    };

    expect(validateCourseDocumentJSON(content).issues).toContainEqual(
      expect.objectContaining({
        code: "invalid_surface_attrs",
        path: ["content", 0, "content", 0, "attrs", "variant"],
      }),
    );
  });

  it("reports unregistered surface variants", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
            mode: "page",
          },
          content: [
            {
              type: "surface",
              attrs: { id: "surface-1", variant: "mystery-surface" },
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
    };

    const result = validateCourseDocumentJSON(content);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "unknown_surface_variant",
        path: ["content", 0, "content", 0, "attrs", "variant"],
      }),
    );
  });

  it("reports slideshow-only variants inside page documents as mode mismatches", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
            mode: "page",
          },
          content: [
            {
              type: "surface",
              attrs: { id: "surface-1", variant: "slide-cover" },
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
    };

    const result = validateCourseDocumentJSON(content);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "surface_variant_mode_mismatch",
        path: ["content", 0, "content", 0, "attrs", "variant"],
      }),
    );
  });

  it("reports page-default variants inside slideshow documents as mode mismatches", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
            mode: "slideshow",
            surfaceSize: "16x9",
          },
          content: [
            {
              type: "surface",
              attrs: { id: "surface-1", variant: "page-default" },
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
    };

    const result = validateCourseDocumentJSON(content);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "surface_variant_mode_mismatch",
        path: ["content", 0, "content", 0, "attrs", "variant"],
      }),
    );
  });

  it("accepts registered mode-compatible slideshow variants", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
            mode: "slideshow",
            surfaceSize: "16x9",
            overflowMode: "clip",
          },
          content: [
            slideCoverSurfaceDefinition.createSurface({ surfaceId: "surface-1" }),
            slideContentSurfaceDefinition.createSurface({ surfaceId: "surface-2" }),
          ],
        },
      ],
    };

    expect(validateCourseDocumentJSON(content)).toEqual({
      ok: true,
      issues: [],
    });
  });

  it("does not report variant issues for surfaces whose attrs already fail schema parsing", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
            mode: "page",
          },
          content: [{ type: "surface", attrs: { id: "surface-1", variant: null } }],
        },
      ],
    };

    const result = validateCourseDocumentJSON(content);

    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "invalid_surface_attrs" }),
    );
    expect(result.issues).not.toContainEqual(
      expect.objectContaining({ code: "unknown_surface_variant" }),
    );
    expect(result.issues).not.toContainEqual(
      expect.objectContaining({ code: "surface_variant_mode_mismatch" }),
    );
  });

  it("reports empty quizzes as incomplete with a stable path", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
            mode: "page",
            surfaceSize: "fluid",
            overflowMode: "grow",
          },
          content: [
            {
              type: "surface",
              attrs: { id: "surface-1", variant: "page-default" },
              content: [
                {
                  type: "quiz",
                  attrs: { id: "quiz-empty" },
                },
              ],
            },
          ],
        },
      ],
    };

    expect(validateCourseDocumentJSON(content)).toMatchObject({
      ok: false,
      issues: [
        {
          code: "incomplete_quiz",
          message: "quiz must contain at least one assessment question",
          path: ["content", 0, "content", 0, "content", 0],
        },
      ],
    });
  });

  it("does not report complete quizzes with assessment question children", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
            mode: "page",
          },
          content: [
            {
              type: "surface",
              attrs: { id: "surface-1", variant: "page-default" },
              content: [
                {
                  type: "quiz",
                  attrs: { id: "quiz-complete" },
                  content: [
                    {
                      type: "mcq",
                      attrs: { id: "mcq-1" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(validateCourseDocumentJSON(content).issues).not.toContainEqual(
      expect.objectContaining({ code: "incomplete_quiz" }),
    );
  });

  it("accepts the strict current Annotated Figure structure", () => {
    expect(validateCourseDocumentJSON(documentWithAnnotatedFigure())).toEqual({
      ok: true,
      issues: [],
    });
  });

  it("reports invalid Annotated Figure fixed children at exact paths", () => {
    const missingCanvas = documentWithAnnotatedFigure();
    annotatedFigureIn(missingCanvas).content = [annotatedFigureIn(missingCanvas).content![1]!];

    expect(validateCourseDocumentJSON(missingCanvas).issues).toContainEqual({
      code: "invalid_annotated_figure_structure",
      message: 'annotated_figure child 0 must be "annotated_figure_canvas"',
      path: ["content", 0, "content", 0, "content", 0, "content", 0, "type"],
    });

    const extraCanvasContent = documentWithAnnotatedFigure();
    annotatedFigureIn(extraCanvasContent).content![0]!.content = [{ type: "paragraph" }];
    expect(validateCourseDocumentJSON(extraCanvasContent).issues).toContainEqual(
      expect.objectContaining({
        code: "invalid_annotated_figure_structure",
        path: ["content", 0, "content", 0, "content", 0, "content", 0, "content", 0],
      }),
    );
  });

  it("reports invalid and duplicate annotation attrs at exact paths", () => {
    const invalid = documentWithAnnotatedFigure();
    const annotations = annotatedFigureIn(invalid).content![1]!.content!;
    annotations[0]!.attrs = { id: "annotation-one", x: 101, y: 25 };
    annotations[1]!.attrs = { id: "annotation-one", x: 75, y: 80 };

    const issues = validateCourseDocumentJSON(invalid).issues;
    expect(issues).toContainEqual({
      code: "invalid_annotated_figure_annotation_attrs",
      message: "annotated_figure_annotation attrs are invalid",
      path: ["content", 0, "content", 0, "content", 0, "content", 1, "content", 0, "attrs", "x"],
    });
    expect(issues).toContainEqual({
      code: "duplicate_annotated_figure_annotation_id",
      message: 'annotated figure annotation id "annotation-one" must be unique',
      path: ["content", 0, "content", 0, "content", 0, "content", 1, "content", 1, "attrs", "id"],
    });
  });

  it("reports invalid annotation captions and legacy root pins at exact paths", () => {
    const invalid = documentWithAnnotatedFigure();
    const figure = annotatedFigureIn(invalid);
    figure.attrs!["data"] = { ...figure.attrs!["data"], pins: [] };
    figure.content![1]!.content![0]!.content = [{ type: "heading", attrs: { level: 2 } }];

    const issues = validateCourseDocumentJSON(invalid).issues;
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "invalid_annotated_figure_data",
        path: ["content", 0, "content", 0, "content", 0, "attrs", "data", "pins"],
      }),
    );
    expect(issues).toContainEqual({
      code: "invalid_annotated_figure_annotation_content",
      message: "annotated_figure_annotation must contain exactly one paragraph",
      path: [
        "content",
        0,
        "content",
        0,
        "content",
        0,
        "content",
        1,
        "content",
        0,
        "content",
        0,
        "type",
      ],
    });
  });

  it("does not expose registered definitions through public validation", () => {
    const result = validateCourseDocumentJSON(createScaffoldDocumentContent({ mode: "page" }));

    expect(result).toEqual({ ok: true, issues: [] });
    expect(JSON.stringify(result)).not.toContain("definition");
    expect(JSON.stringify(result)).not.toContain("createSurface");
  });

  it("returns frozen public validation results with an owned readonly issue array", () => {
    const valid = validateCourseDocumentJSON(createScaffoldDocumentContent({ mode: "page" }));
    const invalid = validateCourseDocumentJSON({ type: "paragraph" });

    expect(Object.isFrozen(valid)).toBe(true);
    expect(Object.isFrozen(valid.issues)).toBe(true);
    expect(Object.isFrozen(invalid)).toBe(true);
    expect(Object.isFrozen(invalid.issues)).toBe(true);
  });
});

function fixedDocument(surfaceContent: Array<Record<string, unknown>>) {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "slideshow",
          surfaceSize: "16x9",
          overflowMode: "clip",
        },
        content: [fixedSurface("surface-fixed", surfaceContent)],
      },
    ],
  };
}

function fixedSurface(surfaceId: string, content: Array<Record<string, unknown>>) {
  return {
    type: "surface",
    attrs: {
      id: surfaceId,
      variant: "slide-cover",
      settings: { header: { enabled: false }, footer: { enabled: false } },
    },
    content,
  };
}

function fixedChildren(): Array<Record<string, unknown>> {
  return [{ type: "heading", attrs: { level: 1 } }, { type: "slide_cover_subtitle" }];
}

function header(type: "surface_header" | "surface_footer") {
  return {
    type,
    content: ["left", "center", "right"].map((position) => ({
      type: "surface_header_footer_slot",
      attrs: { position },
      content: [{ type: "paragraph" }],
    })),
  };
}

function documentWithAnnotatedFigure() {
  const document = createScaffoldDocumentContent({ mode: "page", surfaceId: "surface-1" });
  document.content![0]!.content![0]!.content = [
    {
      type: "annotated_figure",
      attrs: {
        id: "annotated-figure-one",
        data: {
          type: "annotated_figure",
          source: { mode: "external", src: "https://example.com/figure.png" },
          alt: "Map",
          captionDisplay: "list",
        },
      },
      content: [
        { type: "annotated_figure_canvas" },
        {
          type: "annotated_figure_legend",
          content: [
            {
              type: "annotated_figure_annotation",
              attrs: { id: "annotation-one", x: 25, y: 25 },
              content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }],
            },
            {
              type: "annotated_figure_annotation",
              attrs: { id: "annotation-two", x: 75, y: 75 },
              content: [{ type: "paragraph", content: [{ type: "text", text: "Second" }] }],
            },
          ],
        },
      ],
    },
  ];
  return document;
}

function annotatedFigureIn(document: ReturnType<typeof documentWithAnnotatedFigure>) {
  const figure = document.content?.[0]?.content?.[0]?.content?.[0];
  if (!figure) throw new Error("Expected Annotated Figure fixture.");
  return figure;
}
