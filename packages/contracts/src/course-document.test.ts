import { describe, expect, it } from "vite-plus/test";

import {
  SCAFFOLD_DOCUMENT_FORMAT_VERSION,
  CourseDocumentAttrsSchema,
  CourseThemeNonColourAuthorOverridesSchema,
  CourseThemeRefSchema,
  HorizontalAlignmentSchema,
  ImagePositionSchema,
  PersistedCourseThemeSchema,
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
  it("accepts only the current v4 document format", () => {
    expect(SCAFFOLD_DOCUMENT_FORMAT_VERSION).toBe(4);
    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: 4,
        mode: "page",
        surfaceSize: "fluid",
        theme: persistedCourseTheme(),
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

  it("requires the exact persisted Course theme on document attributes", () => {
    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "page",
        surfaceSize: "fluid",
      }).success,
    ).toBe(false);
  });

  it("accepts exact design and colour-system revisions with empty overrides", () => {
    expect(PersistedCourseThemeSchema.parse(persistedCourseTheme())).toEqual({
      schemaVersion: 1,
      design: { id: "scaffold-flow", revision: "1" },
      colourSystem: { id: "scaffold-indigo", revision: "1" },
      overrides: {},
    });
  });

  it("requires non-empty, non-null exact reference identifiers and revisions", () => {
    for (const reference of [
      { id: "", revision: "1" },
      { id: "scaffold-flow", revision: "" },
      { id: "scaffold-flow", revision: null },
    ]) {
      expect(CourseThemeRefSchema.safeParse(reference).success).toBe(false);
    }
  });

  it("accepts the complete approved non-colour author override contract", () => {
    const overrides = {
      typography: {
        defaultFontId: "scaffold-satoshi",
        headingFontId: "scaffold-source-serif",
        codeFontId: "scaffold-jetbrains-mono",
        bodyWeight: 500,
        headingWeight: 700,
        courseTextSize: "larger",
        bodyLineSpacing: "relaxed",
        headingLineSpacing: "tight",
        headingLetterSpacing: "wide",
        uppercaseHeadings: true,
      },
      design: {
        roundness: "rounded",
        stroke: "strong",
        shadow: "defined",
        density: "spacious",
      },
    } as const;

    expect(CourseThemeNonColourAuthorOverridesSchema.parse(overrides)).toEqual(overrides);
  });

  it("accepts empty outer overrides and sparse one-field sections", () => {
    expect(CourseThemeNonColourAuthorOverridesSchema.parse({})).toEqual({});

    expect(
      CourseThemeNonColourAuthorOverridesSchema.parse({
        typography: { defaultFontId: " future-font-id " },
      }),
    ).toEqual({ typography: { defaultFontId: "future-font-id" } });
    expect(
      CourseThemeNonColourAuthorOverridesSchema.parse({ design: { shadow: "soft" } }),
    ).toEqual({ design: { shadow: "soft" } });
  });

  it("accepts every approved semantic value and weight", () => {
    for (const courseTextSize of ["smaller", "standard", "larger"] as const) {
      expect(
        CourseThemeNonColourAuthorOverridesSchema.safeParse({
          typography: { courseTextSize },
        }).success,
      ).toBe(true);
    }

    for (const lineSpacing of ["tight", "standard", "relaxed"] as const) {
      expect(
        CourseThemeNonColourAuthorOverridesSchema.safeParse({
          typography: {
            bodyLineSpacing: lineSpacing,
            headingLineSpacing: lineSpacing,
          },
        }).success,
      ).toBe(true);
    }

    for (const headingLetterSpacing of ["tight", "standard", "wide"] as const) {
      expect(
        CourseThemeNonColourAuthorOverridesSchema.safeParse({
          typography: { headingLetterSpacing },
        }).success,
      ).toBe(true);
    }

    for (const bodyWeight of [400, 500, 600] as const) {
      expect(
        CourseThemeNonColourAuthorOverridesSchema.safeParse({
          typography: { bodyWeight },
        }).success,
      ).toBe(true);
    }

    for (const headingWeight of [400, 500, 600, 700, 800] as const) {
      expect(
        CourseThemeNonColourAuthorOverridesSchema.safeParse({
          typography: { headingWeight },
        }).success,
      ).toBe(true);
    }

    for (const roundness of ["square", "subtle", "rounded", "full"] as const) {
      expect(
        CourseThemeNonColourAuthorOverridesSchema.safeParse({ design: { roundness } })
          .success,
      ).toBe(true);
    }

    for (const stroke of ["light", "standard", "strong"] as const) {
      expect(
        CourseThemeNonColourAuthorOverridesSchema.safeParse({ design: { stroke } }).success,
      ).toBe(true);
    }

    for (const shadow of ["none", "soft", "defined"] as const) {
      expect(
        CourseThemeNonColourAuthorOverridesSchema.safeParse({ design: { shadow } }).success,
      ).toBe(true);
    }

    for (const density of ["compact", "comfortable", "spacious"] as const) {
      expect(
        CourseThemeNonColourAuthorOverridesSchema.safeParse({ design: { density } }).success,
      ).toBe(true);
    }
  });

  it("rejects empty nested override sections", () => {
    expect(
      CourseThemeNonColourAuthorOverridesSchema.safeParse({ typography: {} }).success,
    ).toBe(false);
    expect(
      CourseThemeNonColourAuthorOverridesSchema.safeParse({ design: {} }).success,
    ).toBe(false);
  });

  it("rejects invalid author override values", () => {
    for (const overrides of [
      { typography: { defaultFontId: " " } },
      { typography: { headingFontId: "" } },
      { typography: { codeFontId: null } },
      { typography: { bodyWeight: 300 } },
      { typography: { bodyWeight: 700 } },
      { typography: { headingWeight: 300 } },
      { typography: { headingWeight: 900 } },
      { typography: { courseTextSize: "extra-large" } },
      { typography: { bodyLineSpacing: "loose" } },
      { typography: { headingLineSpacing: "normal" } },
      { typography: { headingLetterSpacing: "extra-wide" } },
      { typography: { uppercaseHeadings: "true" } },
      { design: { roundness: "medium" } },
      { design: { stroke: "heavy" } },
      { design: { shadow: "hard" } },
      { design: { density: "dense" } },
    ]) {
      expect(CourseThemeNonColourAuthorOverridesSchema.safeParse(overrides).success).toBe(
        false,
      );
    }
  });

  it("rejects unknown keys and arbitrary colours at every override level", () => {
    for (const overrides of [
      { unknown: true },
      { colors: { primary: "#161d77" } },
      { primaryColor: "#161d77" },
      { typography: { defaultFontId: "scaffold-satoshi", fontFamily: "Satoshi" } },
      { typography: { defaultFontId: "scaffold-satoshi", color: "#161d77" } },
      { design: { shadow: "soft", radius: "large" } },
      { design: { shadow: "soft", accentColor: "indigo" } },
    ]) {
      expect(CourseThemeNonColourAuthorOverridesSchema.safeParse(overrides).success).toBe(
        false,
      );
    }
  });

  it("rejects raw CSS, Radix and resolved runtime values", () => {
    for (const overrides of [
      { typography: { courseTextSize: "1.125rem" } },
      { typography: { bodyLineSpacing: 1.5 } },
      { typography: { headingLetterSpacing: "-0.02em" } },
      { design: { roundness: "8px" } },
      { design: { stroke: "1px" } },
      { design: { shadow: "0 2px 8px rgb(0 0 0 / 20%)" } },
      { design: { density: "var(--space-4)" } },
      { radixThemeProps: { radius: "large" } },
      { cssVariables: { "--sc-radius": "8px" } },
      { resolved: { rootClassNames: ["sc-course"] } },
    ]) {
      expect(CourseThemeNonColourAuthorOverridesSchema.safeParse(overrides).success).toBe(
        false,
      );
    }
  });

  it("rejects retired theme snapshots and runtime implementation data", () => {
    for (const retiredTheme of [
      {
        schemaVersion: 1,
        preset: { id: "scaffold-default", revision: "1" },
        values: {},
      },
      { ...persistedCourseTheme(), colors: { primary: "#161d77" } },
      {
        ...persistedCourseTheme(),
        design: {
          id: "scaffold-flow",
          revision: "1",
          definition: { radius: "medium" },
        },
      },
      {
        ...persistedCourseTheme(),
        colourSystem: {
          id: "scaffold-indigo",
          revision: "1",
          palette: { accent: "indigo" },
        },
      },
      { ...persistedCourseTheme(), radixThemeProps: { accentColor: "indigo" } },
      { ...persistedCourseTheme(), resolved: { rootClassNames: ["sc-course"] } },
    ]) {
      expect(PersistedCourseThemeSchema.safeParse(retiredTheme).success).toBe(false);
    }
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
        theme: persistedCourseTheme(),
      }).success,
    ).toBe(true);
    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "page",
        surfaceSize: "fluid",
        theme: persistedCourseTheme(),
      }).success,
    ).toBe(true);
    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "branching",
        surfaceSize: "fluid",
        theme: persistedCourseTheme(),
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

function persistedCourseTheme() {
  return {
    schemaVersion: 1 as const,
    design: { id: "scaffold-flow", revision: "1" },
    colourSystem: { id: "scaffold-indigo", revision: "1" },
    overrides: {},
  };
}
