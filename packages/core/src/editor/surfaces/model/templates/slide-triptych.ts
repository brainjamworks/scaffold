import { SurfaceSettingsSchema } from "@/schemas/course-document";

import {
  defineSlideCompositionSurface,
  SlideTitleVisibilitySchema,
} from "../slide-composition-definition";
import { defineSurfaceImageRoles } from "../surface-owned-image";
import { DEFAULT_SURFACE_SETTINGS } from "../surface-settings";

export const SlideTriptychSurfaceSettingsSchema = SurfaceSettingsSchema.extend({
  slideTitle: SlideTitleVisibilitySchema,
  images: defineSurfaceImageRoles(["primary", "secondary", "tertiary"]).default({}),
}).strict();

const DEFAULT_SETTINGS = SlideTriptychSurfaceSettingsSchema.parse({
  ...DEFAULT_SURFACE_SETTINGS,
  slideTitle: { enabled: true },
});

export const slideTriptychSurfaceDefinition = defineSlideCompositionSurface({
  id: "slide-triptych",
  title: "Triptych",
  description: "Slide with three fixed equal image areas.",
  catalogue: {
    section: "image",
    order: 60,
    preview: {
      kind: "column",
      gap: "medium",
      children: [
        { kind: "slot", role: "title", emphasis: "strong" },
        {
          kind: "row",
          gap: "medium",
          proportions: [1, 1, 1],
          children: [
            { kind: "slot", role: "image" },
            { kind: "slot", role: "image" },
            { kind: "slot", role: "image" },
          ],
        },
      ],
    },
  },
  slideComposition: {
    id: "triptych",
    title: "optional-default-on",
    regions: [],
    imageSlots: ["primary", "secondary", "tertiary"],
  },
  settingsSchema: SlideTriptychSurfaceSettingsSchema,
  structurePolicy: { fixedChildren: [{ type: "slide_title" }], allowRootInsertion: false },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: { id: surfaceId, variant: "slide-triptych", settings: DEFAULT_SETTINGS },
    content: [{ type: "slide_title" }],
  }),
});
