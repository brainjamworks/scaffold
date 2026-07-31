import { describe, expect, it } from "vite-plus/test";

import {
  SCAFFOLD_DOCUMENT_FORMAT_VERSION,
  CourseDocumentAttrsSchema,
  PersistedCourseThemeSchema,
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
  it("accepts only the current v4 document format", () => {
    expect(SCAFFOLD_DOCUMENT_FORMAT_VERSION).toBe(4);
    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: 4,
        mode: "page",
        surfaceSize: "fluid",
        theme: completeTheme(),
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

  it("accepts a complete persisted course theme with semantic font roles", () => {
    expect(PersistedCourseThemeSchema.parse(completeTheme())).toMatchObject({
      schemaVersion: 1,
      preset: { id: "scaffold-default", revision: "1" },
      values: {
        typography: {
          headingFontId: "scaffold-poppins",
          bodyFontId: "scaffold-poppins",
          codeFontId: "scaffold-jetbrains-mono",
        },
      },
    });
  });

  it("preserves valid author colours even when they provide no visual contrast", () => {
    const theme = PersistedCourseThemeSchema.parse(completeTheme());
    theme.values!.colors.author.light.background = "#ffffff";
    theme.values!.colors.author.light.bodyText = "#ffffff";
    theme.values!.colors.resolved.light.background = "#ffffff";
    theme.values!.colors.resolved.light.text = "#ffffff";

    const parsed = PersistedCourseThemeSchema.parse(theme);

    expect(parsed.values!.colors.author.light.bodyText).toBe("#ffffff");
    expect(parsed.values!.colors.resolved.light.text).toBe("#ffffff");
  });

  it("expands a legacy materialised palette with complete author intent and recipe provenance", () => {
    const legacy = completeTheme();
    const parsed = PersistedCourseThemeSchema.parse(legacy);
    const light = legacy.values!.colors.light;
    const dark = legacy.values!.colors.dark.palette;

    expect(parsed.values?.colors).toMatchObject({
      author: {
        light: {
          background: light.background,
          surface: light.surface,
          bodyText: light.text,
          headingText: light.text,
          primary: light.primary,
          secondary: light.secondary,
          accent1: light.accent,
          accent2: light.dataSeries[3],
          accent3: light.dataSeries[4],
          accent4: light.dataSeries[5],
          link: light.primary,
        },
        dark: {
          sourceBySlot: {
            background: "derived",
            surface: "derived",
            bodyText: "derived",
            headingText: "derived",
            primary: "derived",
            secondary: "derived",
            accent1: "derived",
            accent2: "derived",
            accent3: "derived",
            accent4: "derived",
            link: "derived",
          },
          values: {
            background: dark.background,
            surface: dark.surface,
            bodyText: dark.text,
            headingText: dark.text,
            primary: dark.primary,
            secondary: dark.secondary,
            accent1: dark.accent,
            accent2: dark.dataSeries[3],
            accent3: dark.dataSeries[4],
            accent4: dark.dataSeries[5],
            link: dark.primary,
          },
        },
      },
      recipe: { id: "scaffold.legacy-palette", version: 1 },
      resolved: {
        light,
        dark,
      },
    });
    expect(parsed.values?.colors).not.toHaveProperty("light");
    expect(parsed.values?.colors).not.toHaveProperty("dark");
  });

  it("marks every extracted dark author slot custom when legacy derivation cannot be proven", () => {
    const custom = completeTheme();
    (custom.values!.colors.dark.source as "derived" | "custom") = "custom";

    const parsed = PersistedCourseThemeSchema.parse(custom);

    expect(new Set(Object.values(parsed.values!.colors.author.dark.sourceBySlot))).toEqual(
      new Set(["custom"]),
    );
  });

  it("rejects incomplete expanded author palettes and recipe provenance", () => {
    const expanded = PersistedCourseThemeSchema.parse(completeTheme());
    const missingSlot = structuredClone(expanded);
    delete (
      missingSlot.values!.colors.author.light as Partial<
        NonNullable<typeof missingSlot.values>["colors"]["author"]["light"]
      >
    ).link;
    const missingRecipeVersion = structuredClone(expanded);
    delete (
      missingRecipeVersion.values!.colors.recipe as Partial<
        NonNullable<typeof missingRecipeVersion.values>["colors"]["recipe"]
      >
    ).version;

    expect(PersistedCourseThemeSchema.safeParse(missingSlot).success).toBe(false);
    expect(PersistedCourseThemeSchema.safeParse(missingRecipeVersion).success).toBe(false);
  });

  it("accepts approved numeric boundaries and rejects values outside them", () => {
    for (const [path, minimum, maximum] of [
      [["values", "typography", "typeScale"], 0.8, 1.4],
      [["values", "typography", "bodyLineHeight"], 1.2, 2],
      [["values", "typography", "headingLineHeight"], 0.9, 1.5],
      [["values", "typography", "headingLetterSpacing"], -0.08, 0.2],
      [["values", "design", "roundness"], 0, 1],
      [["values", "design", "stroke"], 0, 2],
    ] as const) {
      expect(PersistedCourseThemeSchema.safeParse(withThemeValue(path, minimum)).success).toBe(
        true,
      );
      expect(PersistedCourseThemeSchema.safeParse(withThemeValue(path, maximum)).success).toBe(
        true,
      );
      expect(
        PersistedCourseThemeSchema.safeParse(withThemeValue(path, minimum - 0.01)).success,
      ).toBe(false);
      expect(
        PersistedCourseThemeSchema.safeParse(withThemeValue(path, maximum + 0.01)).success,
      ).toBe(false);
    }
  });

  it("rejects invalid colours, incomplete palettes, tuples, enums, and unknown theme keys", () => {
    expect(
      PersistedCourseThemeSchema.safeParse(
        withThemeValue(["values", "colors", "light", "background"], "var(--unsafe)"),
      ).success,
    ).toBe(false);
    expect(
      PersistedCourseThemeSchema.safeParse(
        withThemeValue(["values", "colors", "light", "background"], "url(example.test/a)"),
      ).success,
    ).toBe(false);
    expect(
      PersistedCourseThemeSchema.safeParse(
        withThemeValue(["values", "colors", "light", "dataSeries"], ["#000000"]),
      ).success,
    ).toBe(false);
    expect(
      PersistedCourseThemeSchema.safeParse(
        withThemeValue(["values", "design", "density"], "enormous"),
      ).success,
    ).toBe(false);

    const incomplete = completeTheme();
    delete (incomplete.values!.colors.light as Partial<typeof incomplete.values.colors.light>).text;
    expect(PersistedCourseThemeSchema.safeParse(incomplete).success).toBe(false);

    expect(
      PersistedCourseThemeSchema.safeParse({ ...completeTheme(), injectedCss: "body {}" }).success,
    ).toBe(false);
  });

  it("reserves null theme values for recoverable legacy references", () => {
    expect(
      PersistedCourseThemeSchema.parse({
        schemaVersion: 1,
        preset: { id: "legacy-editorial", revision: null },
        values: null,
      }),
    ).toEqual({
      schemaVersion: 1,
      preset: { id: "legacy-editorial", revision: null },
      values: null,
    });
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
        theme: completeTheme(),
      }).success,
    ).toBe(true);
    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "page",
        surfaceSize: "fluid",
        theme: completeTheme(),
      }).success,
    ).toBe(true);
    expect(
      CourseDocumentAttrsSchema.safeParse({
        schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        mode: "branching",
        surfaceSize: "fluid",
        theme: completeTheme(),
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

function completeTheme() {
  const state = {
    base: "#2196f3",
    onBase: "#ffffff",
    background: "#e3f2fd",
    text: "#0d47a1",
  };
  const palette = {
    background: "#ffffff",
    canvas: "#fafafa",
    surface: "#ffffff",
    surfaceMuted: "#f4f4f5",
    text: "#18181b",
    textSecondary: "#52525b",
    textMuted: "#71717a",
    placeholder: "#a1a1aa",
    border: "#e4e4e7",
    borderSubtle: "#f4f4f5",
    primary: "oklch(0.3 0.15 270)",
    onPrimary: "#ffffff",
    primaryMuted: "oklch(0.95 0.025 270)",
    secondary: "oklch(0.64 0.22 18)",
    onSecondary: "#ffffff",
    accent: "oklch(0.68 0.18 175)",
    onAccent: "#ffffff",
    info: state,
    success: state,
    warning: state,
    error: state,
    focusOutline: "oklch(0.3 0.15 270)",
    focusRing: "#161d7759",
    overlayBackdrop: "#00000066",
    overlayControl: "#ffffff26",
    overlayControlHover: "#ffffff40",
    overlayPill: "#00000099",
    dataSeries: [
      "#161d77",
      "#f43a57",
      "#00ba92",
      "#5b6790",
      "#f47398",
      "#33bda5",
      "#52525b",
      "#a1a1aa",
    ],
  };

  return {
    schemaVersion: 1 as const,
    preset: { id: "scaffold-default", revision: "1" },
    values: {
      colors: {
        light: structuredClone(palette),
        dark: {
          source: "derived" as const,
          generatorVersion: 1 as const,
          palette: structuredClone(palette),
        },
      },
      typography: {
        headingFontId: "scaffold-poppins",
        bodyFontId: "scaffold-poppins",
        codeFontId: "scaffold-jetbrains-mono",
        headingWeight: 700 as const,
        bodyWeight: 400 as const,
        typeScale: 1,
        bodyLineHeight: 1.5,
        headingLineHeight: 1.2,
        headingLetterSpacing: 0,
        uppercaseHeadings: false,
      },
      design: {
        roundness: 0.5,
        stroke: 1,
        shadow: "soft" as const,
        density: "comfortable" as const,
      },
    },
  };
}

function withThemeValue(path: readonly string[], value: unknown) {
  const theme = completeTheme() as unknown as Record<string, unknown>;
  let target = theme;
  for (const segment of path.slice(0, -1)) {
    target = target[segment] as Record<string, unknown>;
  }
  target[path.at(-1)!] = value;
  return theme;
}
