import { z } from "zod";

import { ExternalMediaSourceSchema, ManagedMediaSourceSchema } from "./media";

export const AnnotatedFigureSourceSchema = z.union([
  ExternalMediaSourceSchema,
  ManagedMediaSourceSchema,
  z.null(),
]);
export type AnnotatedFigureSource = z.infer<typeof AnnotatedFigureSourceSchema>;

export const AnnotatedFigureCaptionDisplaySchema = z.enum(["list", "popover"]);
export type AnnotatedFigureCaptionDisplay = z.infer<typeof AnnotatedFigureCaptionDisplaySchema>;

export const DEFAULT_ANNOTATED_FIGURE_CAPTION_DISPLAY =
  "list" satisfies AnnotatedFigureCaptionDisplay;

export const AnnotatedFigureAnnotationAttrsSchema = z
  .object({
    id: z.string().min(1),
    /** 0-100 percentage from the image's left edge. */
    x: z.number().finite().min(0).max(100),
    /** 0-100 percentage from the image's top edge. */
    y: z.number().finite().min(0).max(100),
  })
  .strict();
export type AnnotatedFigureAnnotationAttrs = z.infer<typeof AnnotatedFigureAnnotationAttrsSchema>;

export const AnnotatedFigureDataSchema = z
  .object({
    type: z.literal("annotated_figure").default("annotated_figure"),
    source: AnnotatedFigureSourceSchema.default(null),
    alt: z.string().default(""),
    captionDisplay: AnnotatedFigureCaptionDisplaySchema.default(
      DEFAULT_ANNOTATED_FIGURE_CAPTION_DISPLAY,
    ),
  })
  .strict();
export type AnnotatedFigureData = z.infer<typeof AnnotatedFigureDataSchema>;
