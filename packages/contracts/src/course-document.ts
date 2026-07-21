import { z } from "zod";

export const SCAFFOLD_DOCUMENT_FORMAT_VERSION = 3;

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
    theme: z.string().nullable().optional(),
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
