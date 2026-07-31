import { describe, expect, it } from "vite-plus/test";

import {
  SCAFFOLD_DOCUMENT_FORMAT_VERSION,
  CourseDocumentAttrsSchema,
  ImagePositionSchema,
  SurfaceAttrsSchema,
  SurfaceBackgroundSchema,
} from "./course-document";

describe("course document schemas", () => {
  it("requires schemaVersion and defaults surface sizing for page documents", () => {
    expect(
      CourseDocumentAttrsSchema.parse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "page",
        theme: legacyThemeReference(),
      }),
    ).toMatchObject({
      schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
      mode: "page",
      surfaceSize: "fluid",
      overflowMode: "grow",
    });
    expect(() => CourseDocumentAttrsSchema.parse({ mode: "page" })).toThrow();
  });

  it("accepts Tiptap nulls for optional document and surface metadata attrs", () => {
    expect(
      CourseDocumentAttrsSchema.parse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "page",
        theme: legacyThemeReference(),
        branching: null,
      }),
    ).toMatchObject({
      mode: "page",
      branching: null,
    });

    expect(
      SurfaceAttrsSchema.parse({
        id: "surface-1",
        title: null,
        variant: "page-default",
        notes: null,
      }),
    ).toEqual({
      id: "surface-1",
      title: null,
      variant: "page-default",
      notes: null,
    });
  });

  it("requires the Contracts-owned structured course theme", () => {
    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "page",
        theme: "scaffold-default",
      }).success,
    ).toBe(false);
    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "page",
        theme: null,
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported document format versions", () => {
    expect(() =>
      CourseDocumentAttrsSchema.parse({
        mode: "page",
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1,
      }),
    ).toThrow();
  });

  it("rejects invalid course document enum values", () => {
    expect(() =>
      CourseDocumentAttrsSchema.parse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "deck",
      }),
    ).toThrow();
    expect(() =>
      CourseDocumentAttrsSchema.parse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "page",
        surfaceSize: "wide",
      }),
    ).toThrow();
    expect(() =>
      CourseDocumentAttrsSchema.parse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "page",
        overflowMode: "scroll",
      }),
    ).toThrow();
  });

  it("parses optional surface metadata", () => {
    expect(
      SurfaceAttrsSchema.parse({
        id: "surface-1",
        title: "Introduction",
        variant: "slide-title",
        settings: {
          background: { color: "#ffffff" },
          header: { enabled: true },
          footer: { enabled: false },
        },
        notes: "Presenter notes",
      }),
    ).toEqual({
      id: "surface-1",
      title: "Introduction",
      variant: "slide-title",
      settings: {
        background: { color: "#ffffff" },
        header: { enabled: true },
        footer: { enabled: false },
      },
      notes: "Presenter notes",
    });
  });

  it("parses page-safe surface backgrounds", () => {
    expect(SurfaceBackgroundSchema.parse({ color: "#ffffff" })).toEqual({
      color: "#ffffff",
    });

    expect(
      SurfaceBackgroundSchema.parse({
        imageUrl: "https://example.com/background.png",
        imageAlt: "Soft gradient background",
        imagePosition: "bottom-right",
      }),
    ).toEqual({
      imageUrl: "https://example.com/background.png",
      imageAlt: "Soft gradient background",
      imagePosition: "bottom-right",
    });

    expect(ImagePositionSchema.parse("center-left")).toBe("center-left");
  });

  it("rejects untyped surface backgrounds", () => {
    expect(() =>
      SurfaceAttrsSchema.parse({
        id: "surface-1",
        variant: "page-default",
        settings: {
          background: { videoUrl: "https://example.com/background.mp4" },
        },
      }),
    ).toThrow();

    expect(() =>
      SurfaceAttrsSchema.parse({
        id: "surface-1",
        variant: "page-default",
        settings: { background: { color: "" } },
      }),
    ).toThrow();
  });

  it("does not expose active slideshow or playback attrs in page schemas", () => {
    expect(
      CourseDocumentAttrsSchema.parse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "page",
        theme: legacyThemeReference(),
        slideshow: { playbackMode: "auto" },
      }),
    ).not.toHaveProperty("slideshow");

    expect(
      SurfaceAttrsSchema.parse({
        id: "surface-1",
        variant: "page-default",
        playback: { durationSec: 12 },
      }),
    ).not.toHaveProperty("playback");
  });

  it("requires surface variants", () => {
    expect(() => SurfaceAttrsSchema.parse({ id: "surface-1" })).toThrow();
    expect(() => SurfaceAttrsSchema.parse({ id: "surface-1", variant: null })).toThrow();
  });

  it("rejects invalid surface ids", () => {
    expect(() => SurfaceAttrsSchema.parse({ id: "", variant: "page-default" })).toThrow();
  });
});

function legacyThemeReference() {
  return {
    schemaVersion: 1 as const,
    preset: { id: "legacy-default", revision: null },
    values: null,
  };
}
