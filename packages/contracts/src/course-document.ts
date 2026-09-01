import { z } from "zod";

import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "./embedded-id";
import { PresentationConfigurationV1Schema } from "./presentation";

export const SCAFFOLD_DOCUMENT_FORMAT_VERSION = 4;

export const CourseSectionTitleSchema = z.string().trim().min(1).max(200);

export const CourseSectionAttrsSchema = z
  .object({
    id: EmbeddedNodeIdSchema,
    title: CourseSectionTitleSchema,
  })
  .strict();
export type CourseSectionAttrs = z.infer<typeof CourseSectionAttrsSchema>;
export type CourseSectionId = EmbeddedNodeId;

export const CourseThemeRefSchema = z
  .object({
    id: z.string().trim().min(1),
    revision: z.string().trim().min(1),
  })
  .strict();
export type CourseThemeRef = z.infer<typeof CourseThemeRefSchema>;

export const CourseTextSizeSchema = z.enum(["smaller", "standard", "larger"]);
export type CourseTextSize = z.infer<typeof CourseTextSizeSchema>;

export const CourseLineSpacingSchema = z.enum(["tight", "standard", "relaxed"]);
export type CourseLineSpacing = z.infer<typeof CourseLineSpacingSchema>;

export const CourseHeadingLetterSpacingSchema = z.enum(["tight", "standard", "wide"]);
export type CourseHeadingLetterSpacing = z.infer<typeof CourseHeadingLetterSpacingSchema>;

export const CourseRoundnessSchema = z.enum(["square", "subtle", "rounded", "full"]);
export type CourseRoundness = z.infer<typeof CourseRoundnessSchema>;

export const CourseStrokeSchema = z.enum(["light", "standard", "strong"]);
export type CourseStroke = z.infer<typeof CourseStrokeSchema>;

export const CourseShadowSchema = z.enum(["none", "soft", "defined"]);
export type CourseShadow = z.infer<typeof CourseShadowSchema>;

export const CourseDensitySchema = z.enum(["compact", "comfortable", "spacious"]);
export type CourseDensity = z.infer<typeof CourseDensitySchema>;

const CourseThemeTypographyAuthorOverridesSchema = z
  .object({
    defaultFontId: z.string().trim().min(1).optional(),
    headingFontId: z.string().trim().min(1).optional(),
    codeFontId: z.string().trim().min(1).optional(),
    bodyWeight: z.union([z.literal(400), z.literal(500), z.literal(600)]).optional(),
    headingWeight: z
      .union([z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800)])
      .optional(),
    courseTextSize: CourseTextSizeSchema.optional(),
    bodyLineSpacing: CourseLineSpacingSchema.optional(),
    headingLineSpacing: CourseLineSpacingSchema.optional(),
    headingLetterSpacing: CourseHeadingLetterSpacingSchema.optional(),
    uppercaseHeadings: z.boolean().optional(),
  })
  .strict()
  .refine((overrides) => Object.values(overrides).some((value) => value !== undefined), {
    message: "Typography overrides must contain at least one value",
  });

const CourseThemeDesignAuthorOverridesSchema = z
  .object({
    roundness: CourseRoundnessSchema.optional(),
    stroke: CourseStrokeSchema.optional(),
    shadow: CourseShadowSchema.optional(),
    density: CourseDensitySchema.optional(),
  })
  .strict()
  .refine((overrides) => Object.values(overrides).some((value) => value !== undefined), {
    message: "Design overrides must contain at least one value",
  });

export const CourseThemeNonColourAuthorOverridesSchema = z
  .object({
    typography: CourseThemeTypographyAuthorOverridesSchema.optional(),
    design: CourseThemeDesignAuthorOverridesSchema.optional(),
  })
  .strict();
export type CourseThemeNonColourAuthorOverrides = z.infer<
  typeof CourseThemeNonColourAuthorOverridesSchema
>;

export const PersistedCourseThemeSchema = z
  .object({
    schemaVersion: z.literal(1),
    design: CourseThemeRefSchema,
    colourSystem: CourseThemeRefSchema,
    overrides: CourseThemeNonColourAuthorOverridesSchema,
  })
  .strict();
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
    requiresScaffoldPlus: z.boolean(),
    mode: CourseModeSchema,
    surfaceSize: SurfaceSizeSchema.default("fluid"),
    overflowMode: OverflowModeSchema.default("grow"),
    theme: PersistedCourseThemeSchema,
    branching: z.unknown().optional(),
    presentation: PresentationConfigurationV1Schema.optional(),
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
