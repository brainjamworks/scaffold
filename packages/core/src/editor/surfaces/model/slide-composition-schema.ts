import { z } from "zod";

import type {
  RegisteredSurfaceVariantDefinition,
  SurfaceVariantDefinition,
} from "./surface-variant-definition";

export const SlideTitleVisibilitySchema = z
  .object({
    enabled: z.boolean(),
  })
  .strict()
  .readonly();

export const SlideTitleModeSchema = z.enum([
  "required",
  "optional-default-on",
  "optional-default-off",
]);
export type SlideTitleMode = z.infer<typeof SlideTitleModeSchema>;

export const SlideCompositionOrientationSchema = z.enum(["default", "reversed"]);
export type SlideCompositionOrientation = z.infer<typeof SlideCompositionOrientationSchema>;

export const SlideCompositionProportionSchema = z.enum([
  "equal",
  "one-third-two-thirds",
  "two-thirds-one-third",
]);
export type SlideCompositionProportion = z.infer<typeof SlideCompositionProportionSchema>;

export const SlideCompositionKindSchema = z.enum([
  "content",
  "two-columns",
  "three-columns",
  "two-stacked",
  "side-title",
  "centred-stage",
  "editorial",
  "image-content-split",
  "image-content-stacked",
  "full-bleed-image",
  "image-backdrop-panel",
  "diptych",
  "triptych",
]);
export type SlideCompositionKind = z.infer<typeof SlideCompositionKindSchema>;

export const SlideRegionRoleSchema = z.enum(["main", "primary", "secondary", "tertiary"]);
export type SlideRegionRole = z.infer<typeof SlideRegionRoleSchema>;

export const SurfaceImageSlotRoleSchema = z.enum(["primary", "secondary", "tertiary"]);
export type SurfaceImageSlotRole = z.infer<typeof SurfaceImageSlotRoleSchema>;

const SlideCompositionOrientationCapabilitySchema = z
  .object({
    default: z.literal("default"),
    options: z.tuple([z.literal("default"), z.literal("reversed")]).readonly(),
  })
  .strict()
  .readonly();

const SlideCompositionProportionCapabilitySchema = z
  .object({
    default: SlideCompositionProportionSchema,
    options: z
      .tuple([
        z.literal("equal"),
        z.literal("one-third-two-thirds"),
        z.literal("two-thirds-one-third"),
      ])
      .readonly(),
  })
  .strict()
  .readonly();

export const SlideCompositionMetadataSchema = z
  .object({
    id: SlideCompositionKindSchema,
    title: SlideTitleModeSchema,
    regions: z.array(SlideRegionRoleSchema).readonly(),
    imageSlots: z.array(SurfaceImageSlotRoleSchema).readonly(),
    orientation: SlideCompositionOrientationCapabilitySchema.optional(),
    proportion: SlideCompositionProportionCapabilitySchema.optional(),
  })
  .strict()
  .superRefine((slideComposition, context) => {
    if (new Set(slideComposition.regions).size !== slideComposition.regions.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Slide composition region roles must be unique.",
        path: ["regions"],
      });
    }
    if (new Set(slideComposition.imageSlots).size !== slideComposition.imageSlots.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Slide composition image slot roles must be unique.",
        path: ["imageSlots"],
      });
    }
  })
  .readonly();
export type SlideCompositionMetadata = z.infer<typeof SlideCompositionMetadataSchema>;

export const SlideCompositionCatalogueStagingSchema = z
  .object({
    section: z.enum(["content", "image"]),
    order: z.number().int().positive(),
    preview: z.unknown().optional(),
  })
  .strict()
  .readonly();

type PropertyOr<T, Key extends PropertyKey, Fallback> = Key extends keyof T
  ? NonNullable<T[Key]>
  : Fallback;

export type SurfaceCatalogueInput = PropertyOr<
  SurfaceVariantDefinition,
  "catalogue",
  z.input<typeof SlideCompositionCatalogueStagingSchema>
>;
export type RegisteredSurfaceCatalogue = PropertyOr<
  RegisteredSurfaceVariantDefinition,
  "catalogue",
  z.infer<typeof SlideCompositionCatalogueStagingSchema>
>;
