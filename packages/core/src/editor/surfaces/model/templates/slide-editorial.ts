import { SurfaceSettingsSchema } from "@/schemas/course-document";

import {
  defineSlideCompositionSurface,
  SlideCompositionOrientationSchema,
  SlideTitleVisibilitySchema,
} from "../slide-composition-definition";
import { DEFAULT_SURFACE_SETTINGS } from "../surface-settings";

const SettingsSchema = SurfaceSettingsSchema.extend({
  slideTitle: SlideTitleVisibilitySchema,
  orientation: SlideCompositionOrientationSchema,
}).strict();
const DEFAULT_SETTINGS = SettingsSchema.parse({
  ...DEFAULT_SURFACE_SETTINGS,
  slideTitle: { enabled: true },
  orientation: "default",
});

export const slideEditorialSurfaceDefinition = defineSlideCompositionSurface({
  id: "slide-editorial",
  title: "Editorial",
  description: "Slide with one dominant region and two supporting regions.",
  catalogue: {
    section: "content",
    order: 70,
    preview: {
      kind: "column",
      gap: "medium",
      children: [
        { kind: "slot", role: "title", emphasis: "strong" },
        {
          kind: "row",
          gap: "medium",
          proportions: [2, 1],
          children: [
            { kind: "slot", role: "content" },
            {
              kind: "column",
              gap: "medium",
              children: [
                { kind: "slot", role: "content" },
                { kind: "slot", role: "content" },
              ],
            },
          ],
        },
      ],
    },
  },
  slideComposition: {
    id: "editorial",
    title: "optional-default-on",
    regions: ["primary", "secondary", "tertiary"],
    imageSlots: [],
    orientation: { default: "default", options: ["default", "reversed"] },
  },
  settingsSchema: SettingsSchema,
  structurePolicy: {
    fixedChildren: [
      { type: "slide_title" },
      { type: "region", attrs: { role: "primary" } },
      { type: "region", attrs: { role: "secondary" } },
      { type: "region", attrs: { role: "tertiary" } },
    ],
    allowRootInsertion: false,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: { id: surfaceId, variant: "slide-editorial", settings: DEFAULT_SETTINGS },
    content: [
      { type: "slide_title" },
      { type: "region", attrs: { role: "primary" }, content: [{ type: "paragraph" }] },
      { type: "region", attrs: { role: "secondary" }, content: [{ type: "paragraph" }] },
      { type: "region", attrs: { role: "tertiary" }, content: [{ type: "paragraph" }] },
    ],
  }),
});
