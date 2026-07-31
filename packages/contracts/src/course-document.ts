import { z } from "zod";

export const SCAFFOLD_DOCUMENT_FORMAT_VERSION = 4;

export const COURSE_THEME_NUMERIC_BOUNDS = Object.freeze({
  typeScale: Object.freeze({ min: 0.8, max: 1.4 }),
  bodyLineHeight: Object.freeze({ min: 1.2, max: 2 }),
  headingLineHeight: Object.freeze({ min: 0.9, max: 1.5 }),
  headingLetterSpacing: Object.freeze({ min: -0.08, max: 0.2 }),
  roundness: Object.freeze({ min: 0, max: 1 }),
  stroke: Object.freeze({ min: 0, max: 2 }),
});

const CourseThemeIdSchema = z.string().trim().min(1).max(200);
const HexColorSchema = z.string().regex(/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
const OklchColorSchema = z.string().superRefine((value, context) => {
  const match =
    /^oklch\(\s*(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)(?:\s*\/\s*(\d*\.?\d+))?\s*\)$/i.exec(value);
  if (!match) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid oklch() colour" });
    return;
  }

  const lightness = Number(match[1]);
  const chroma = Number(match[2]);
  const hue = Number(match[3]);
  const alpha = match[4] === undefined ? undefined : Number(match[4]);
  if (
    !Number.isFinite(lightness) ||
    lightness! < 0 ||
    lightness! > 1 ||
    !Number.isFinite(chroma) ||
    chroma! < 0 ||
    chroma! > 0.5 ||
    !Number.isFinite(hue) ||
    hue! < 0 ||
    hue! > 360 ||
    (alpha !== undefined && (!Number.isFinite(alpha) || alpha < 0 || alpha > 1))
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Out-of-range oklch() colour" });
  }
});

export const CourseThemeCssColorSchema = z.union([HexColorSchema, OklchColorSchema]);
export type CourseThemeCssColor = z.infer<typeof CourseThemeCssColorSchema>;

export const CourseThemeStateColorsSchema = z
  .object({
    base: CourseThemeCssColorSchema,
    onBase: CourseThemeCssColorSchema,
    background: CourseThemeCssColorSchema,
    text: CourseThemeCssColorSchema,
  })
  .strict();
export type CourseThemeStateColors = z.infer<typeof CourseThemeStateColorsSchema>;

const CourseThemeDataSeriesSchema = z.tuple([
  CourseThemeCssColorSchema,
  CourseThemeCssColorSchema,
  CourseThemeCssColorSchema,
  CourseThemeCssColorSchema,
  CourseThemeCssColorSchema,
  CourseThemeCssColorSchema,
  CourseThemeCssColorSchema,
  CourseThemeCssColorSchema,
]);

export const CourseThemeColorPaletteSchema = z
  .object({
    background: CourseThemeCssColorSchema,
    canvas: CourseThemeCssColorSchema,
    surface: CourseThemeCssColorSchema,
    surfaceMuted: CourseThemeCssColorSchema,
    text: CourseThemeCssColorSchema,
    heading: CourseThemeCssColorSchema.optional(),
    link: CourseThemeCssColorSchema.optional(),
    textSecondary: CourseThemeCssColorSchema,
    textMuted: CourseThemeCssColorSchema,
    placeholder: CourseThemeCssColorSchema,
    border: CourseThemeCssColorSchema,
    borderSubtle: CourseThemeCssColorSchema,
    primary: CourseThemeCssColorSchema,
    onPrimary: CourseThemeCssColorSchema,
    primaryMuted: CourseThemeCssColorSchema,
    secondary: CourseThemeCssColorSchema,
    onSecondary: CourseThemeCssColorSchema,
    accent: CourseThemeCssColorSchema,
    onAccent: CourseThemeCssColorSchema,
    info: CourseThemeStateColorsSchema,
    success: CourseThemeStateColorsSchema,
    warning: CourseThemeStateColorsSchema,
    error: CourseThemeStateColorsSchema,
    focusOutline: CourseThemeCssColorSchema,
    focusRing: CourseThemeCssColorSchema,
    overlayBackdrop: CourseThemeCssColorSchema,
    overlayControl: CourseThemeCssColorSchema,
    overlayControlHover: CourseThemeCssColorSchema,
    overlayPill: CourseThemeCssColorSchema,
    dataSeries: CourseThemeDataSeriesSchema,
  })
  .strict();
export type CourseThemeColorPalette = z.infer<typeof CourseThemeColorPaletteSchema>;

export const CourseThemeAuthorPaletteSchema = z
  .object({
    background: CourseThemeCssColorSchema,
    surface: CourseThemeCssColorSchema,
    bodyText: CourseThemeCssColorSchema,
    headingText: CourseThemeCssColorSchema,
    primary: CourseThemeCssColorSchema,
    secondary: CourseThemeCssColorSchema,
    accent1: CourseThemeCssColorSchema,
    accent2: CourseThemeCssColorSchema,
    accent3: CourseThemeCssColorSchema,
    accent4: CourseThemeCssColorSchema,
    link: CourseThemeCssColorSchema,
  })
  .strict();
export type CourseThemeAuthorPalette = z.infer<typeof CourseThemeAuthorPaletteSchema>;
export type CourseThemePaletteSlot = keyof CourseThemeAuthorPalette;

const CourseThemeDarkSourceBySlotSchema = z
  .object({
    background: z.enum(["derived", "custom"]),
    surface: z.enum(["derived", "custom"]),
    bodyText: z.enum(["derived", "custom"]),
    headingText: z.enum(["derived", "custom"]),
    primary: z.enum(["derived", "custom"]),
    secondary: z.enum(["derived", "custom"]),
    accent1: z.enum(["derived", "custom"]),
    accent2: z.enum(["derived", "custom"]),
    accent3: z.enum(["derived", "custom"]),
    accent4: z.enum(["derived", "custom"]),
    link: z.enum(["derived", "custom"]),
  })
  .strict();

const LegacyCourseThemeColorsSchema = z
  .object({
    light: CourseThemeColorPaletteSchema,
    dark: z
      .object({
        source: z.enum(["derived", "custom"]),
        generatorVersion: z.literal(1),
        palette: CourseThemeColorPaletteSchema,
      })
      .strict(),
  })
  .strict();

const ExpandedCourseThemeColorsSchema = z
  .object({
    author: z
      .object({
        light: CourseThemeAuthorPaletteSchema,
        dark: z
          .object({
            sourceBySlot: CourseThemeDarkSourceBySlotSchema,
            values: CourseThemeAuthorPaletteSchema,
          })
          .strict(),
      })
      .strict(),
    recipe: z
      .object({
        id: CourseThemeIdSchema,
        version: z.number().int().positive(),
      })
      .strict(),
    resolved: z
      .object({
        light: CourseThemeColorPaletteSchema,
        dark: CourseThemeColorPaletteSchema,
      })
      .strict(),
  })
  .strict();

type LegacyCourseThemeColors = z.infer<typeof LegacyCourseThemeColorsSchema>;
export type CourseThemeColors = z.infer<typeof ExpandedCourseThemeColorsSchema>;

const extractAuthorPalette = (palette: CourseThemeColorPalette): CourseThemeAuthorPalette => ({
  background: palette.background,
  surface: palette.surface,
  bodyText: palette.text,
  headingText: palette.heading ?? palette.text,
  primary: palette.primary,
  secondary: palette.secondary,
  accent1: palette.accent,
  accent2: palette.dataSeries[3],
  accent3: palette.dataSeries[4],
  accent4: palette.dataSeries[5],
  link: palette.link ?? palette.primary,
});

const expandLegacyCourseThemeColors = (colors: LegacyCourseThemeColors): CourseThemeColors => {
  const darkSource = colors.dark.source;
  return {
    author: {
      light: extractAuthorPalette(colors.light),
      dark: {
        sourceBySlot: {
          background: darkSource,
          surface: darkSource,
          bodyText: darkSource,
          headingText: darkSource,
          primary: darkSource,
          secondary: darkSource,
          accent1: darkSource,
          accent2: darkSource,
          accent3: darkSource,
          accent4: darkSource,
          link: darkSource,
        },
        values: extractAuthorPalette(colors.dark.palette),
      },
    },
    recipe: {
      id: "scaffold.legacy-palette",
      version: 1,
    },
    resolved: {
      light: colors.light,
      dark: colors.dark.palette,
    },
  };
};

export const CourseThemeColorsSchema = z
  .union([ExpandedCourseThemeColorsSchema, LegacyCourseThemeColorsSchema])
  .transform(
    (colors): CourseThemeColors =>
      "author" in colors ? colors : expandLegacyCourseThemeColors(colors),
  );

const boundedNumber = (bounds: { min: number; max: number }) =>
  z.number().finite().min(bounds.min).max(bounds.max);

export const CourseThemeTypographySchema = z
  .object({
    headingFontId: CourseThemeIdSchema,
    bodyFontId: CourseThemeIdSchema,
    codeFontId: CourseThemeIdSchema,
    headingWeight: z.union([
      z.literal(400),
      z.literal(500),
      z.literal(600),
      z.literal(700),
      z.literal(800),
    ]),
    bodyWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]),
    typeScale: boundedNumber(COURSE_THEME_NUMERIC_BOUNDS.typeScale),
    bodyLineHeight: boundedNumber(COURSE_THEME_NUMERIC_BOUNDS.bodyLineHeight),
    headingLineHeight: boundedNumber(COURSE_THEME_NUMERIC_BOUNDS.headingLineHeight),
    headingLetterSpacing: boundedNumber(COURSE_THEME_NUMERIC_BOUNDS.headingLetterSpacing),
    uppercaseHeadings: z.boolean(),
  })
  .strict();
export type CourseThemeTypography = z.infer<typeof CourseThemeTypographySchema>;

export const CourseThemeDesignSchema = z
  .object({
    roundness: boundedNumber(COURSE_THEME_NUMERIC_BOUNDS.roundness),
    stroke: boundedNumber(COURSE_THEME_NUMERIC_BOUNDS.stroke),
    shadow: z.enum(["none", "soft", "defined"]),
    density: z.enum(["compact", "comfortable", "spacious"]),
  })
  .strict();
export type CourseThemeDesign = z.infer<typeof CourseThemeDesignSchema>;

export const CourseThemeValuesSchema = z
  .object({
    colors: CourseThemeColorsSchema,
    typography: CourseThemeTypographySchema,
    design: CourseThemeDesignSchema,
  })
  .strict();
export type CourseThemeValues = z.infer<typeof CourseThemeValuesSchema>;

export const PersistedCourseThemeSchema = z
  .object({
    schemaVersion: z.literal(1),
    preset: z
      .object({
        id: CourseThemeIdSchema,
        revision: z.string().trim().min(1).max(200).nullable(),
      })
      .strict(),
    values: CourseThemeValuesSchema.nullable(),
  })
  .strict()
  .superRefine((theme, context) => {
    if (theme.values === null && theme.preset.revision !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A legacy theme reference cannot have a preset revision",
        path: ["preset", "revision"],
      });
    }
  });
export type PersistedCourseTheme = z.infer<typeof PersistedCourseThemeSchema>;

export const CourseModeSchema = z.enum(["page", "slideshow", "branching"]);
export type CourseMode = z.infer<typeof CourseModeSchema>;

export const SurfaceSizeSchema = z.enum(["fluid", "16x9"]);
export type SurfaceSize = z.infer<typeof SurfaceSizeSchema>;

export const OverflowModeSchema = z.enum(["grow", "fit", "clip"]);
export type OverflowMode = z.infer<typeof OverflowModeSchema>;

export const CourseDocumentAttrsSchema = z
  .object({
    schemaVersion: z.literal(SCAFFOLD_DOCUMENT_FORMAT_VERSION),
    mode: CourseModeSchema,
    surfaceSize: SurfaceSizeSchema.default("fluid"),
    overflowMode: OverflowModeSchema.default("grow"),
    theme: PersistedCourseThemeSchema,
    branching: z.unknown().optional(),
  })
  .refine(
    (attrs) =>
      attrs.mode === "slideshow" ? attrs.surfaceSize === "16x9" : attrs.surfaceSize === "fluid",
    {
      message: "surfaceSize must match the course mode",
      path: ["surfaceSize"],
    },
  );
export type CourseDocumentAttrs = z.infer<typeof CourseDocumentAttrsSchema>;

export const ImagePositionSchema = z.enum([
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);
export type ImagePosition = z.infer<typeof ImagePositionSchema>;

export const DEFAULT_IMAGE_POSITION = "center" satisfies ImagePosition;

export const SurfaceBackgroundSchema = z
  .object({
    color: z.string().min(1).optional(),
    imageUrl: z.string().min(1).optional(),
    imageAlt: z.string().optional(),
    imagePosition: ImagePositionSchema.optional(),
  })
  .strict()
  .refine(
    (background) => background.color !== undefined || background.imageUrl !== undefined,
    "Surface background must define a color or imageUrl",
  );
export type SurfaceBackground = z.infer<typeof SurfaceBackgroundSchema>;

export const HorizontalAlignmentSchema = z.enum(["left", "center", "right"]);
export type HorizontalAlignment = z.infer<typeof HorizontalAlignmentSchema>;

export const VerticalContentPositionSchema = z.enum(["top", "middle", "bottom"]);
export type VerticalContentPosition = z.infer<typeof VerticalContentPositionSchema>;

export const SurfaceRegionToggleSchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict();
export type SurfaceRegionToggle = z.infer<typeof SurfaceRegionToggleSchema>;

export const SurfaceSettingsSchema = z
  .object({
    verticalPosition: VerticalContentPositionSchema.optional(),
    background: SurfaceBackgroundSchema.optional(),
    header: SurfaceRegionToggleSchema.optional(),
    footer: SurfaceRegionToggleSchema.optional(),
  })
  .passthrough();
export type SurfaceSettings = z.infer<typeof SurfaceSettingsSchema>;

export const SurfaceAttrsSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable().optional(),
  variant: z.string().min(1),
  settings: SurfaceSettingsSchema.optional(),
  notes: z.string().nullable().optional(),
});
export type SurfaceAttrs = z.infer<typeof SurfaceAttrsSchema>;

export const ScaffoldDocumentContentSchema = z
  .object({
    type: z.literal("doc"),
  })
  .passthrough();
export type ScaffoldDocumentContent = z.infer<typeof ScaffoldDocumentContentSchema>;

export const ScaffoldArtifactSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  mode: CourseModeSchema,
  content: ScaffoldDocumentContentSchema.nullable(),
});
export type ScaffoldArtifact = z.infer<typeof ScaffoldArtifactSchema>;
