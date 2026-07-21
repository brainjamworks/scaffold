import { SurfaceSettingsSchema } from "@/schemas/course-document";

import type { SurfaceVariantDefinition } from "../surface-variant-definition";
import { SurfaceOwnedImageSchema, type SurfaceOwnedImage } from "../surface-owned-image";
import { DEFAULT_SURFACE_SETTINGS } from "../surface-settings";

export const SlideImageBandSurfaceSettingsSchema = SurfaceSettingsSchema.extend({
  image: SurfaceOwnedImageSchema.default({}),
});

export type SlideImageBandImage = SurfaceOwnedImage;

export type SlideImageBandSurfaceSettings = typeof SlideImageBandSurfaceSettingsSchema._output;

export const DEFAULT_SLIDE_IMAGE_BAND_SURFACE_SETTINGS =
  SlideImageBandSurfaceSettingsSchema.parse(DEFAULT_SURFACE_SETTINGS);

export function readSlideImageBandSurfaceSettings(value: unknown): SlideImageBandSurfaceSettings {
  const parsed = SlideImageBandSurfaceSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_SLIDE_IMAGE_BAND_SURFACE_SETTINGS;
}

export function writeSlideImageBandImageSettings(
  value: unknown,
  image: SlideImageBandImage,
): SlideImageBandSurfaceSettings {
  const settings = readSlideImageBandSurfaceSettings(value);
  const nextImage = normaliseSlideImageBandImage(image);
  return SlideImageBandSurfaceSettingsSchema.parse({
    ...settings,
    image: nextImage,
  });
}

export function slideImageBandDataAttrs(value: unknown): Record<string, string> {
  const settings = readSlideImageBandSurfaceSettings(value);
  return {
    "data-slide-image": settings.image.imageUrl ? "set" : "empty",
  };
}

export const slideImageBandSurfaceDefinition = {
  id: "slide-image-band",
  modes: ["slideshow"],
  title: "Image band",
  description: "Cover slide with a full-width image band above the title.",
  catalogue: {
    section: "title",
    order: 40,
    preview: {
      kind: "column",
      gap: "medium",
      proportions: [1, 1],
      children: [
        { kind: "slot", role: "image" },
        {
          kind: "column",
          gap: "small",
          children: [
            { kind: "slot", role: "title", emphasis: "strong" },
            { kind: "slot", role: "label", emphasis: "quiet" },
          ],
        },
      ],
    },
  },
  alignment: {
    verticalContentPosition: {
      behavior: "finite-direct-stack",
      default: "middle",
    },
  },
  settingsSchema: SlideImageBandSurfaceSettingsSchema,
  structurePolicy: {
    fixedChildren: [{ type: "heading", attrs: { level: 1 } }, { type: "slide_cover_subtitle" }],
    allowRootInsertion: false,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: {
      id: surfaceId,
      variant: "slide-image-band",
      settings: DEFAULT_SLIDE_IMAGE_BAND_SURFACE_SETTINGS,
    },
    content: [
      { type: "heading", attrs: { level: 1, textAlign: "left" } },
      {
        type: "slide_cover_subtitle",
        content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
      },
    ],
  }),
} satisfies SurfaceVariantDefinition;

function normaliseSlideImageBandImage(value: SlideImageBandImage): SlideImageBandImage {
  return {
    ...(value.imageUrl ? { imageUrl: value.imageUrl } : {}),
    ...(value.imageAlt ? { imageAlt: value.imageAlt } : {}),
    ...(value.imagePosition ? { imagePosition: value.imagePosition } : {}),
  };
}
