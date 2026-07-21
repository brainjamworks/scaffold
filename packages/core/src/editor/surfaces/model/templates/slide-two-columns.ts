import { SurfaceSettingsSchema } from "@/schemas/course-document";

import {
  defineSlideCompositionSurface,
  SlideCompositionOrientationSchema,
  SlideCompositionProportionSchema,
  SlideTitleVisibilitySchema,
} from "../slide-composition-definition";
import { DEFAULT_SURFACE_SETTINGS } from "../surface-settings";

export const SlideTwoColumnsSurfaceSettingsSchema = SurfaceSettingsSchema.extend({
  slideTitle: SlideTitleVisibilitySchema,
  orientation: SlideCompositionOrientationSchema,
  proportion: SlideCompositionProportionSchema,
}).strict();

const DEFAULT_SETTINGS = SlideTwoColumnsSurfaceSettingsSchema.parse({
  ...DEFAULT_SURFACE_SETTINGS,
  slideTitle: { enabled: true },
  orientation: "default",
  proportion: "equal",
});

export const slideTwoColumnsSurfaceDefinition = defineSlideCompositionSurface({
  id: "slide-two-columns",
  title: "Two columns",
  description: "Slide with two side-by-side content regions.",
  catalogue: {
    section: "content",
    order: 20,
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
            { kind: "slot", role: "content" },
            { kind: "slot", role: "content" },
          ],
        },
      ],
    },
  },
  slideComposition: {
    id: "two-columns",
    title: "optional-default-on",
    regions: ["primary", "secondary"],
    imageSlots: [],
    orientation: { default: "default", options: ["default", "reversed"] },
    proportion: {
      default: "equal",
      options: ["equal", "one-third-two-thirds", "two-thirds-one-third"],
    },
  },
  settingsSchema: SlideTwoColumnsSurfaceSettingsSchema,
  structurePolicy: {
    fixedChildren: [
      { type: "slide_title" },
      { type: "region", attrs: { role: "primary" } },
      { type: "region", attrs: { role: "secondary" } },
    ],
    allowRootInsertion: false,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: { id: surfaceId, variant: "slide-two-columns", settings: DEFAULT_SETTINGS },
    content: [
      { type: "slide_title" },
      { type: "region", attrs: { role: "primary" }, content: [{ type: "paragraph" }] },
      { type: "region", attrs: { role: "secondary" }, content: [{ type: "paragraph" }] },
    ],
  }),
});
