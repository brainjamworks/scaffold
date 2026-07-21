import { SurfaceSettingsSchema } from "@/schemas/course-document";

import {
  defineSlideCompositionSurface,
  SlideCompositionOrientationSchema,
  SlideCompositionProportionSchema,
  SlideTitleVisibilitySchema,
} from "../slide-composition-definition";
import { DEFAULT_SURFACE_SETTINGS } from "../surface-settings";

export const SlideTwoStackedSurfaceSettingsSchema = SurfaceSettingsSchema.extend({
  slideTitle: SlideTitleVisibilitySchema,
  orientation: SlideCompositionOrientationSchema,
  proportion: SlideCompositionProportionSchema,
}).strict();

const DEFAULT_SETTINGS = SlideTwoStackedSurfaceSettingsSchema.parse({
  ...DEFAULT_SURFACE_SETTINGS,
  slideTitle: { enabled: true },
  orientation: "default",
  proportion: "equal",
});

export const slideTwoStackedSurfaceDefinition = defineSlideCompositionSurface({
  id: "slide-two-stacked",
  title: "Two stacked",
  description: "Slide with two vertically stacked content regions.",
  catalogue: {
    section: "content",
    order: 40,
    preview: {
      kind: "column",
      gap: "medium",
      children: [
        { kind: "slot", role: "title", emphasis: "strong" },
        { kind: "slot", role: "content" },
        { kind: "slot", role: "content" },
      ],
    },
  },
  slideComposition: {
    id: "two-stacked",
    title: "optional-default-on",
    regions: ["primary", "secondary"],
    imageSlots: [],
    orientation: { default: "default", options: ["default", "reversed"] },
    proportion: {
      default: "equal",
      options: ["equal", "one-third-two-thirds", "two-thirds-one-third"],
    },
  },
  settingsSchema: SlideTwoStackedSurfaceSettingsSchema,
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
    attrs: { id: surfaceId, variant: "slide-two-stacked", settings: DEFAULT_SETTINGS },
    content: [
      { type: "slide_title" },
      { type: "region", attrs: { role: "primary" }, content: [{ type: "paragraph" }] },
      { type: "region", attrs: { role: "secondary" }, content: [{ type: "paragraph" }] },
    ],
  }),
});
