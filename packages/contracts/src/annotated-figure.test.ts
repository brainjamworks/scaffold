import { describe, expect, it } from "vite-plus/test";

import {
  AnnotatedFigureAnnotationAttrsSchema,
  AnnotatedFigureCaptionDisplaySchema,
  AnnotatedFigureDataSchema,
  AnnotatedFigureSourceSchema,
  DEFAULT_ANNOTATED_FIGURE_CAPTION_DISPLAY,
  type AnnotatedFigureAnnotationAttrs,
  type AnnotatedFigureData,
} from "./annotated-figure";

function normalizedDataIssues(result: ReturnType<typeof AnnotatedFigureDataSchema.safeParse>) {
  if (result.success) return [];
  return result.error.issues.map(({ code, path, message }) => ({ code, path, message }));
}

function normalizedAnnotationIssues(
  result: ReturnType<typeof AnnotatedFigureAnnotationAttrsSchema.safeParse>,
) {
  if (result.success) return [];
  return result.error.issues.map(({ code, path, message }) => ({ code, path, message }));
}

describe("annotated-figure persisted contracts", () => {
  it("preserves enum order and exact data defaults", () => {
    expect(AnnotatedFigureCaptionDisplaySchema.options).toEqual(["list", "popover"]);
    expect(DEFAULT_ANNOTATED_FIGURE_CAPTION_DISPLAY).toBe("list");

    const data: AnnotatedFigureData = AnnotatedFigureDataSchema.parse({});

    expect(data).toEqual({
      type: "annotated_figure",
      source: null,
      alt: "",
      captionDisplay: "list",
    });
    expect(AnnotatedFigureSourceSchema.parse(null)).toBeNull();
  });

  it("preserves canonical external and managed source parsing", () => {
    expect(
      AnnotatedFigureDataSchema.parse({
        source: {
          mode: "external",
          src: "  https://example.com/diagram.png  ",
          ignored: true,
        },
        alt: "  Diagram  ",
        captionDisplay: "popover",
      }),
    ).toEqual({
      type: "annotated_figure",
      source: { mode: "external", src: "https://example.com/diagram.png" },
      alt: "  Diagram  ",
      captionDisplay: "popover",
    });
    expect(
      AnnotatedFigureSourceSchema.parse({ mode: "managed", mediaId: " asset-1 ", ignored: true }),
    ).toEqual({ mode: "managed", mediaId: " asset-1 " });
  });

  it("preserves strict finite annotation geometry and boundary values", () => {
    const annotation: AnnotatedFigureAnnotationAttrs = AnnotatedFigureAnnotationAttrsSchema.parse({
      id: " ",
      x: 0,
      y: 100,
    });

    expect(annotation).toEqual({ id: " ", x: 0, y: 100 });
    expect(
      normalizedAnnotationIssues(
        AnnotatedFigureAnnotationAttrsSchema.safeParse({
          id: "",
          x: Number.POSITIVE_INFINITY,
          y: 101,
          editorOnly: true,
        }),
      ),
    ).toEqual([
      {
        code: "too_small",
        path: ["id"],
        message: "String must contain at least 1 character(s)",
      },
      {
        code: "not_finite",
        path: ["x"],
        message: "Number must be finite",
      },
      {
        code: "too_big",
        path: ["x"],
        message: "Number must be less than or equal to 100",
      },
      {
        code: "too_big",
        path: ["y"],
        message: "Number must be less than or equal to 100",
      },
      {
        code: "unrecognized_keys",
        path: [],
        message: "Unrecognized key(s) in object: 'editorOnly'",
      },
    ]);
    expect(AnnotatedFigureAnnotationAttrsSchema.safeParse({ id: "a", x: -1, y: 0 }).success).toBe(
      false,
    );
  });

  it("preserves strict data issues and unsafe URL rejection", () => {
    expect(
      normalizedDataIssues(
        AnnotatedFigureDataSchema.safeParse({ captionDisplay: "inline", editorOnly: true }),
      ),
    ).toEqual([
      {
        code: "invalid_enum_value",
        path: ["captionDisplay"],
        message: "Invalid enum value. Expected 'list' | 'popover', received 'inline'",
      },
      {
        code: "unrecognized_keys",
        path: [],
        message: "Unrecognized key(s) in object: 'editorOnly'",
      },
    ]);
    expect(
      AnnotatedFigureDataSchema.safeParse({
        source: { mode: "external", src: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
  });
});
