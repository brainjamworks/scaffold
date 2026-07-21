import { SurfaceSettingsSchema } from "@/schemas/course-document";

import {
  defineSlideCompositionSurface,
  SlideCompositionOrientationSchema,
  SlideCompositionProportionSchema,
  SlideTitleVisibilitySchema,
} from "../slide-composition-definition";
import { defineSurfaceImageRoles } from "../surface-owned-image";
import { DEFAULT_SURFACE_SETTINGS } from "../surface-settings";

export const SlideImageContentStackedSurfaceSettingsSchema = SurfaceSettingsSchema.extend({
  slideTitle: SlideTitleVisibilitySchema,
  orientation: SlideCompositionOrientationSchema,
  proportion: SlideCompositionProportionSchema,
  images: defineSurfaceImageRoles(["primary"]).default({}),
}).strict();

const DEFAULT_SETTINGS = SlideImageContentStackedSurfaceSettingsSchema.parse({
  ...DEFAULT_SURFACE_SETTINGS,
  slideTitle: { enabled: true },
  orientation: "default",
  proportion: "equal",
});

export const slideImageContentStackedSurfaceDefinition = defineSlideCompositionSurface({
  id: "slide-image-content-stacked",
  title: "Image + content stacked",
  description: "Slide with a built-in image above one content region.",
  catalogue: {
    section: "image",
    order: 20,
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
            { kind: "slot", role: "content" },
          ],
        },
      ],
    },
  },
  slideComposition: {
    id: "image-content-stacked",
    title: "optional-default-on",
    regions: ["main"],
    imageSlots: ["primary"],
    orientation: { default: "default", options: ["default", "reversed"] },
    proportion: {
      default: "equal",
      options: ["equal", "one-third-two-thirds", "two-thirds-one-third"],
    },
  },
  settingsSchema: SlideImageContentStackedSurfaceSettingsSchema,
  structurePolicy: {
    fixedChildren: [{ type: "slide_title" }, { type: "region", attrs: { role: "main" } }],
    allowRootInsertion: false,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: { id: surfaceId, variant: "slide-image-content-stacked", settings: DEFAULT_SETTINGS },
    content: [
      { type: "slide_title" },
      { type: "region", attrs: { role: "main" }, content: [{ type: "paragraph" }] },
    ],
  }),
});
