import { z } from "zod";

import { SurfaceSettingsSchema } from "@/schemas/course-document";

import type { SurfaceVariantDefinition } from "../surface-variant-definition";
import { SurfaceOwnedImageSchema, type SurfaceOwnedImage } from "../surface-owned-image";
import { DEFAULT_SURFACE_SETTINGS } from "../surface-settings";

export const SlideImageCoverImageSideSchema = z.enum(["left", "right"]);

export const SlideImageCoverSurfaceSettingsSchema = SurfaceSettingsSchema.extend({
  image: SurfaceOwnedImageSchema.default({}),
  imageSide: SlideImageCoverImageSideSchema.default("right"),
});

export type SlideImageCoverImage = SurfaceOwnedImage;

export type SlideImageCoverSurfaceSettings = typeof SlideImageCoverSurfaceSettingsSchema._output;

export const DEFAULT_SLIDE_IMAGE_COVER_SURFACE_SETTINGS =
  SlideImageCoverSurfaceSettingsSchema.parse(DEFAULT_SURFACE_SETTINGS);

export function readSlideImageCoverSurfaceSettings(value: unknown): SlideImageCoverSurfaceSettings {
  const parsed = SlideImageCoverSurfaceSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_SLIDE_IMAGE_COVER_SURFACE_SETTINGS;
}

export function writeSlideImageCoverImageSettings(
  value: unknown,
  image: SlideImageCoverImage,
): SlideImageCoverSurfaceSettings {
  const settings = readSlideImageCoverSurfaceSettings(value);
  const nextImage = normaliseSlideImageCoverImage(image);
  return SlideImageCoverSurfaceSettingsSchema.parse({
    ...settings,
    image: nextImage,
  });
}

export function slideImageCoverDataAttrs(value: unknown): Record<string, string> {
  const settings = readSlideImageCoverSurfaceSettings(value);
  return {
    "data-slide-image-side": settings.imageSide,
    "data-slide-image": settings.image.imageUrl ? "set" : "empty",
  };
}

export const slideImageCoverSurfaceDefinition = {
  id: "slide-image-cover",
  modes: ["slideshow"],
  title: "Image cover",
  description: "Cover slide with a title, subtitle, and side image.",
  catalogue: {
    section: "title",
    order: 30,
    preview: {
      kind: "row",
      gap: "medium",
      proportions: [2, 1],
      children: [
        {
          kind: "column",
          gap: "small",
          children: [
            { kind: "slot", role: "title", emphasis: "strong" },
            { kind: "slot", role: "label", emphasis: "quiet" },
          ],
        },
        { kind: "slot", role: "image" },
      ],
    },
  },
  alignment: {
    verticalContentPosition: {
      behavior: "finite-direct-stack",
      default: "middle",
    },
  },
  settingsSchema: SlideImageCoverSurfaceSettingsSchema,
  structurePolicy: {
    fixedChildren: [{ type: "heading", attrs: { level: 1 } }, { type: "slide_cover_subtitle" }],
    allowRootInsertion: false,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: {
      id: surfaceId,
      variant: "slide-image-cover",
      settings: DEFAULT_SLIDE_IMAGE_COVER_SURFACE_SETTINGS,
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

function normaliseSlideImageCoverImage(value: SlideImageCoverImage): SlideImageCoverImage {
  return {
    ...(value.imageUrl ? { imageUrl: value.imageUrl } : {}),
    ...(value.imageAlt ? { imageAlt: value.imageAlt } : {}),
    ...(value.imagePosition ? { imagePosition: value.imagePosition } : {}),
  };
}
