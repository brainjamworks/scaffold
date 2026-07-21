import { describe, expect, it } from "vite-plus/test";

import {
  SCAFFOLD_DOCUMENT_FORMAT_VERSION,
  CourseDocumentAttrsSchema,
  HorizontalAlignmentSchema,
  ImagePositionSchema,
  SurfaceAttrsSchema,
  SurfaceBackgroundSchema,
  SurfaceSettingsSchema,
  SurfaceSizeSchema,
  VerticalContentPositionSchema,
} from "./course-document";

const IMAGE_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

describe("course document contracts", () => {
  it("accepts only the current v3 document format", () => {
    expect(SCAFFOLD_DOCUMENT_FORMAT_VERSION).toBe(3);
    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: 3,
        mode: "page",
        surfaceSize: "fluid",
      }).success,
    ).toBe(true);
    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: 1,
        mode: "page",
        surfaceSize: "fluid",
      }).success,
    ).toBe(false);
    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: 2,
        mode: "page",
        surfaceSize: "fluid",
      }).success,
    ).toBe(false);
  });

  it("accepts only common horizontal alignment values", () => {
    expect(
      ["left", "center", "right"].map((value) => HorizontalAlignmentSchema.parse(value)),
    ).toEqual(["left", "center", "right"]);
    expect(() => HorizontalAlignmentSchema.parse("justify")).toThrow();
  });

  it("accepts only common vertical content positions", () => {
    expect(
      ["top", "middle", "bottom"].map((value) => VerticalContentPositionSchema.parse(value)),
    ).toEqual(["top", "middle", "bottom"]);
    expect(() => VerticalContentPositionSchema.parse("center")).toThrow();
  });

  it("accepts only fluid and 16x9 surface sizes", () => {
    expect(SurfaceSizeSchema.parse("fluid")).toBe("fluid");
    expect(SurfaceSizeSchema.parse("16x9")).toBe("16x9");
    expect(() => SurfaceSizeSchema.parse("4x3")).toThrow();
  });

  it("accepts only the surface size assigned to each course mode", () => {
    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "slideshow",
        surfaceSize: "16x9",
      }).success,
    ).toBe(true);
    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "page",
        surfaceSize: "fluid",
      }).success,
    ).toBe(true);
    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "branching",
        surfaceSize: "fluid",
      }).success,
    ).toBe(true);

    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "slideshow",
        surfaceSize: "fluid",
      }).success,
    ).toBe(false);
    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "page",
        surfaceSize: "16x9",
      }).success,
    ).toBe(false);
    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "branching",
        surfaceSize: "16x9",
      }).success,
    ).toBe(false);
  });

  it("accepts persisted surface variants", () => {
    expect(
      SurfaceAttrsSchema.parse({
        id: "surface-1",
        variant: "slide-title-content",
        settings: {
          verticalPosition: "bottom",
          background: { color: "#ffffff" },
          header: { enabled: true },
          footer: { enabled: false },
        },
      }),
    ).toEqual({
      id: "surface-1",
      variant: "slide-title-content",
      settings: {
        verticalPosition: "bottom",
        background: { color: "#ffffff" },
        header: { enabled: true },
        footer: { enabled: false },
      },
    });
  });

  it("rejects invalid persisted surface vertical positions", () => {
    expect(
      SurfaceAttrsSchema.safeParse({
        id: "surface-1",
        variant: "slide-cover",
        settings: { verticalPosition: "center" },
      }).success,
    ).toBe(false);
  });

  it("does not declare combined Surface alignment while retaining variant settings", () => {
    expect(SurfaceSettingsSchema.keyof().options).not.toContain("alignment");
    expect(
      SurfaceSettingsSchema.parse({
        verticalPosition: "top",
        imageSide: "left",
      }),
    ).toEqual({ verticalPosition: "top", imageSide: "left" });
  });

  it("requires persisted surface variants", () => {
    expect(() =>
      SurfaceAttrsSchema.parse({
        id: "surface-1",
      }),
    ).toThrow();
    expect(() =>
      SurfaceAttrsSchema.parse({
        id: "surface-1",
        variant: null,
      }),
    ).toThrow();
  });

  it("accepts the nine standard image positions", () => {
    expect(IMAGE_POSITIONS.map((position) => ImagePositionSchema.parse(position))).toEqual(
      IMAGE_POSITIONS,
    );
    expect(() => ImagePositionSchema.parse("25% 75%")).toThrow();
  });

  it("accepts positioned background images but rejects position-only backgrounds", () => {
    expect(
      SurfaceBackgroundSchema.parse({
        imageUrl: "https://example.com/background.png",
        imagePosition: "top-left",
      }),
    ).toEqual({
      imageUrl: "https://example.com/background.png",
      imagePosition: "top-left",
    });

    expect(() => SurfaceBackgroundSchema.parse({ imagePosition: "top-left" })).toThrow();
  });
});
