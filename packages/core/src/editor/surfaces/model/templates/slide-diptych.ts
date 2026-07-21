import { SurfaceSettingsSchema } from "@/schemas/course-document";

import {
  defineSlideCompositionSurface,
  SlideTitleVisibilitySchema,
} from "../slide-composition-definition";
import { defineSurfaceImageRoles } from "../surface-owned-image";
import { DEFAULT_SURFACE_SETTINGS } from "../surface-settings";

export const SlideDiptychSurfaceSettingsSchema = SurfaceSettingsSchema.extend({
  slideTitle: SlideTitleVisibilitySchema,
  images: defineSurfaceImageRoles(["primary", "secondary"]).default({}),
}).strict();

const DEFAULT_SETTINGS = SlideDiptychSurfaceSettingsSchema.parse({
  ...DEFAULT_SURFACE_SETTINGS,
  slideTitle: { enabled: true },
});

export const slideDiptychSurfaceDefinition = defineSlideCompositionSurface({
  id: "slide-diptych",
  title: "Diptych",
  description: "Slide with two fixed equal image areas.",
  catalogue: {
    section: "image",
    order: 50,
    preview: {
      kind: "column",
      gap: "medium",
      children: [
        { kind: "slot", role: "title", emphasis: "strong" },
        {
          kind: "row",
          gap: "medium",
          proportions: [1, 1],
          children: [
            { kind: "slot", role: "image" },
            { kind: "slot", role: "image" },
          ],
        },
      ],
    },
  },
  slideComposition: {
    id: "diptych",
    title: "optional-default-on",
    regions: [],
    imageSlots: ["primary", "secondary"],
  },
  settingsSchema: SlideDiptychSurfaceSettingsSchema,
  structurePolicy: { fixedChildren: [{ type: "slide_title" }], allowRootInsertion: false },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: { id: surfaceId, variant: "slide-diptych", settings: DEFAULT_SETTINGS },
    content: [{ type: "slide_title" }],
  }),
});
