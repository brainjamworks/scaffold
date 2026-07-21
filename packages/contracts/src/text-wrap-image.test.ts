import { describe, expect, it } from "vite-plus/test";

import {
  TextWrapImageDataSchema,
  TextWrapImagePositionSchema,
  TextWrapImageShapeSchema,
  TextWrapImageSizeSchema,
  TextWrapImageSourceSchema,
  type TextWrapImageData,
} from "./text-wrap-image";

function normalizedIssues(result: ReturnType<typeof TextWrapImageDataSchema.safeParse>) {
  if (result.success) return [];
  return result.error.issues.map(({ code, path, message }) => ({ code, path, message }));
}

describe("text-wrap image persisted contract", () => {
  it("preserves enum order and exact defaults", () => {
    expect(TextWrapImagePositionSchema.options).toEqual(["left", "right"]);
    expect(TextWrapImageSizeSchema.options).toEqual(["sm", "md", "lg"]);
    expect(TextWrapImageShapeSchema.options).toEqual(["square", "rounded", "circle"]);

    const data: TextWrapImageData = TextWrapImageDataSchema.parse({});

    expect(data).toEqual({
      type: "text_wrap_image",
      source: null,
      alt: "",
      position: "left",
      size: "md",
      shape: "square",
    });
    expect(TextWrapImageSourceSchema.parse(null)).toBeNull();
  });

  it("preserves source parsing and unknown-key stripping", () => {
    expect(
      TextWrapImageDataSchema.parse({
        source: {
          mode: "external",
          src: "  https://example.com/image.png  ",
          ignored: true,
        },
        alt: "  Diagram  ",
        position: "right",
        size: "lg",
        shape: "circle",
        editorSelection: true,
      }),
    ).toEqual({
      type: "text_wrap_image",
      source: { mode: "external", src: "https://example.com/image.png" },
      alt: "  Diagram  ",
      position: "right",
      size: "lg",
      shape: "circle",
    });
    expect(
      TextWrapImageSourceSchema.parse({ mode: "managed", mediaId: " asset-1 ", ignored: true }),
    ).toEqual({ mode: "managed", mediaId: " asset-1 " });
  });

  it("preserves normalized enum/type issues and unsafe URL rejection", () => {
    expect(
      normalizedIssues(TextWrapImageDataSchema.safeParse({ position: "center", alt: 4 })),
    ).toEqual([
      {
        code: "invalid_type",
        path: ["alt"],
        message: "Expected string, received number",
      },
      {
        code: "invalid_enum_value",
        path: ["position"],
        message: "Invalid enum value. Expected 'left' | 'right', received 'center'",
      },
    ]);
    expect(
      TextWrapImageDataSchema.safeParse({
        source: { mode: "external", src: "data:image/png;base64,abc" },
      }).success,
    ).toBe(false);
  });
});
