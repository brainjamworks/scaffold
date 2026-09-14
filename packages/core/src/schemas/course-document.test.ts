import { describe, expect, it } from "vite-plus/test";

import {
  SCAFFOLD_DOCUMENT_FORMAT_VERSION,
  CourseDocumentAttrsSchema,
  ImagePositionSchema,
  SurfaceAttrsSchema,
  SurfaceBackgroundSchema,
} from "./course-document";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

const SURFACE_ID = "AbCdEf123_--";
const COURSE_DOCUMENT_ID = "CdEfGh456_--";

describe("course document schemas", () => {
  it("requires schemaVersion and defaults surface sizing for page documents", () => {
    expect(
      CourseDocumentAttrsSchema.parse({
        id: COURSE_DOCUMENT_ID,
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        requiresScaffoldPlus: false,
        mode: "page",
        theme: currentThemeReference(),
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
        id: COURSE_DOCUMENT_ID,
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        requiresScaffoldPlus: false,
        mode: "page",
        theme: currentThemeReference(),
        branching: null,
      }),
    ).toMatchObject({
      mode: "page",
      branching: null,
    });

    expect(
      SurfaceAttrsSchema.parse({
        id: SURFACE_ID,
        title: null,
        variant: "page-default",
        notes: null,
      }),
    ).toEqual({
      id: SURFACE_ID,
      title: null,
      variant: "page-default",
      notes: null,
    });
  });

  it("requires the Contracts-owned structured course theme", () => {
    expect(
      CourseDocumentAttrsSchema.safeParse({
        id: COURSE_DOCUMENT_ID,
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        requiresScaffoldPlus: false,
        mode: "page",
        theme: "scaffold-default",
      }).success,
    ).toBe(false);
    expect(
      CourseDocumentAttrsSchema.safeParse({
        id: COURSE_DOCUMENT_ID,
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        requiresScaffoldPlus: false,
        mode: "page",
        theme: null,
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported document format versions", () => {
    expect(() =>
      CourseDocumentAttrsSchema.parse({
        id: COURSE_DOCUMENT_ID,
        mode: "page",
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1,
      }),
    ).toThrow();
  });

  it("rejects invalid course document enum values", () => {
    expect(() =>
      CourseDocumentAttrsSchema.parse({
        id: COURSE_DOCUMENT_ID,
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "deck",
      }),
    ).toThrow();
    expect(() =>
      CourseDocumentAttrsSchema.parse({
        id: COURSE_DOCUMENT_ID,
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "page",
        surfaceSize: "wide",
      }),
    ).toThrow();
    expect(() =>
      CourseDocumentAttrsSchema.parse({
        id: COURSE_DOCUMENT_ID,
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "page",
        overflowMode: "scroll",
      }),
    ).toThrow();
  });

  it("parses optional surface metadata", () => {
    expect(
      SurfaceAttrsSchema.parse({
        id: SURFACE_ID,
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
      id: SURFACE_ID,
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
        id: SURFACE_ID,
        variant: "page-default",
        settings: {
          background: { videoUrl: "https://example.com/background.mp4" },
        },
      }),
    ).toThrow();

    expect(() =>
      SurfaceAttrsSchema.parse({
        id: SURFACE_ID,
        variant: "page-default",
        settings: { background: { color: "" } },
      }),
    ).toThrow();
  });

  it("does not expose active slideshow or playback attrs in page schemas", () => {
    expect(
      CourseDocumentAttrsSchema.parse({
        id: COURSE_DOCUMENT_ID,
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        requiresScaffoldPlus: false,
        mode: "page",
        theme: currentThemeReference(),
        slideshow: { playbackMode: "auto" },
      }),
    ).not.toHaveProperty("slideshow");

    expect(
      SurfaceAttrsSchema.parse({
        id: SURFACE_ID,
        variant: "page-default",
        playback: { durationSec: 12 },
      }),
    ).not.toHaveProperty("playback");
  });

  it("requires surface variants", () => {
    expect(() => SurfaceAttrsSchema.parse({ id: SURFACE_ID })).toThrow();
    expect(() => SurfaceAttrsSchema.parse({ id: SURFACE_ID, variant: null })).toThrow();
  });

  it("rejects invalid surface ids", () => {
    expect(() => SurfaceAttrsSchema.parse({ id: "", variant: "page-default" })).toThrow();
  });
});

function currentThemeReference() {
  return createDefaultPersistedCourseTheme();
}
