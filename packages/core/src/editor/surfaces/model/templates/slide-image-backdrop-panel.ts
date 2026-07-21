import { SurfaceSettingsSchema } from "@/schemas/course-document";

import {
  defineSlideCompositionSurface,
  SlideCompositionOrientationSchema,
  SlideCompositionProportionSchema,
  SlideTitleVisibilitySchema,
} from "../slide-composition-definition";
import { DEFAULT_SURFACE_SETTINGS } from "../surface-settings";

export const SlideImageBackdropPanelSurfaceSettingsSchema = SurfaceSettingsSchema.extend({
  slideTitle: SlideTitleVisibilitySchema,
  orientation: SlideCompositionOrientationSchema,
  proportion: SlideCompositionProportionSchema,
}).strict();

const DEFAULT_SETTINGS = SlideImageBackdropPanelSurfaceSettingsSchema.parse({
  ...DEFAULT_SURFACE_SETTINGS,
  slideTitle: { enabled: true },
  orientation: "default",
  proportion: "one-third-two-thirds",
});

export const slideImageBackdropPanelSurfaceDefinition = defineSlideCompositionSurface({
  id: "slide-image-backdrop-panel",
  title: "Image backdrop + inset panel",
  description: "Full image backdrop with a controlled title and content panel.",
  catalogue: {
    section: "image",
    order: 40,
    preview: {
      kind: "overlay",
      base: { kind: "slot", role: "image" },
      overlay: {
        kind: "column",
        gap: "small",
        children: [
          { kind: "slot", role: "title", emphasis: "strong" },
          { kind: "slot", role: "panel" },
        ],
      },
      placement: "end",
    },
  },
  slideComposition: {
    id: "image-backdrop-panel",
    title: "optional-default-on",
    regions: ["main"],
    imageSlots: [],
    orientation: { default: "default", options: ["default", "reversed"] },
    proportion: {
      default: "one-third-two-thirds",
      options: ["equal", "one-third-two-thirds", "two-thirds-one-third"],
    },
  },
  settingsSchema: SlideImageBackdropPanelSurfaceSettingsSchema,
  structurePolicy: {
    fixedChildren: [{ type: "slide_title" }, { type: "region", attrs: { role: "main" } }],
    allowRootInsertion: false,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: { id: surfaceId, variant: "slide-image-backdrop-panel", settings: DEFAULT_SETTINGS },
    content: [
      { type: "slide_title" },
      { type: "region", attrs: { role: "main" }, content: [{ type: "paragraph" }] },
    ],
  }),
});
