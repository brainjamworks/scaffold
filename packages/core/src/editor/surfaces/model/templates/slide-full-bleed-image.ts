import { SurfaceSettingsSchema } from "@/schemas/course-document";

import {
  defineSlideCompositionSurface,
  SlideTitleVisibilitySchema,
} from "../slide-composition-definition";
import { DEFAULT_SURFACE_SETTINGS } from "../surface-settings";

export const SlideFullBleedImageSurfaceSettingsSchema = SurfaceSettingsSchema.extend({
  slideTitle: SlideTitleVisibilitySchema,
}).strict();

const DEFAULT_SETTINGS = SlideFullBleedImageSurfaceSettingsSchema.parse({
  ...DEFAULT_SURFACE_SETTINGS,
  slideTitle: { enabled: false },
});

export const slideFullBleedImageSurfaceDefinition = defineSlideCompositionSurface({
  id: "slide-full-bleed-image",
  title: "Full-bleed image",
  description: "Image-led slide with an optional controlled title panel.",
  catalogue: {
    section: "image",
    order: 30,
    preview: {
      kind: "overlay",
      base: { kind: "slot", role: "image" },
      overlay: { kind: "slot", role: "title", emphasis: "strong" },
      placement: "start",
    },
  },
  slideComposition: {
    id: "full-bleed-image",
    title: "optional-default-off",
    regions: [],
    imageSlots: [],
  },
  settingsSchema: SlideFullBleedImageSurfaceSettingsSchema,
  structurePolicy: { fixedChildren: [{ type: "slide_title" }], allowRootInsertion: false },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: { id: surfaceId, variant: "slide-full-bleed-image", settings: DEFAULT_SETTINGS },
    content: [{ type: "slide_title" }],
  }),
});
