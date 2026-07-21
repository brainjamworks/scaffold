import { SurfaceSettingsSchema } from "@/schemas/course-document";

import {
  defineSlideCompositionSurface,
  SlideTitleVisibilitySchema,
} from "../slide-composition-definition";
import { DEFAULT_SURFACE_SETTINGS } from "../surface-settings";

export const SlideContentSurfaceSettingsSchema = SurfaceSettingsSchema.extend({
  slideTitle: SlideTitleVisibilitySchema,
}).strict();

export const DEFAULT_SLIDE_CONTENT_SURFACE_SETTINGS = SlideContentSurfaceSettingsSchema.parse({
  ...DEFAULT_SURFACE_SETTINGS,
  slideTitle: { enabled: true },
});

export const slideContentSurfaceDefinition = defineSlideCompositionSurface({
  id: "slide-content",
  title: "Content",
  description: "Slide with a fixed content region for blocks and grids.",
  catalogue: {
    section: "content",
    order: 10,
    preview: {
      kind: "column",
      gap: "medium",
      proportions: [1, 3],
      children: [
        { kind: "slot", role: "title", emphasis: "strong" },
        { kind: "slot", role: "content" },
      ],
    },
  },
  slideComposition: {
    id: "content",
    title: "optional-default-on",
    regions: ["main"],
    imageSlots: [],
  },
  settingsSchema: SlideContentSurfaceSettingsSchema,
  structurePolicy: {
    fixedChildren: [{ type: "slide_title" }, { type: "region", attrs: { role: "main" } }],
    allowRootInsertion: false,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: {
      id: surfaceId,
      variant: "slide-content",
      settings: DEFAULT_SLIDE_CONTENT_SURFACE_SETTINGS,
    },
    content: [
      { type: "slide_title" },
      {
        type: "region",
        attrs: { role: "main" },
        content: [{ type: "paragraph" }],
      },
    ],
  }),
});
