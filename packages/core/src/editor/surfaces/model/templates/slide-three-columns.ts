import { SurfaceSettingsSchema } from "@/schemas/course-document";

import {
  defineSlideCompositionSurface,
  SlideTitleVisibilitySchema,
} from "../slide-composition-definition";
import { DEFAULT_SURFACE_SETTINGS } from "../surface-settings";

const SettingsSchema = SurfaceSettingsSchema.extend({
  slideTitle: SlideTitleVisibilitySchema,
}).strict();
const DEFAULT_SETTINGS = SettingsSchema.parse({
  ...DEFAULT_SURFACE_SETTINGS,
  slideTitle: { enabled: true },
});

export const slideThreeColumnsSurfaceDefinition = defineSlideCompositionSurface({
  id: "slide-three-columns",
  title: "Three columns",
  description: "Slide with three equal content columns.",
  catalogue: {
    section: "content",
    order: 30,
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
            { kind: "slot", role: "content" },
            { kind: "slot", role: "content" },
            { kind: "slot", role: "content" },
          ],
        },
      ],
    },
  },
  slideComposition: {
    id: "three-columns",
    title: "optional-default-on",
    regions: ["primary", "secondary", "tertiary"],
    imageSlots: [],
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
    attrs: { id: surfaceId, variant: "slide-three-columns", settings: DEFAULT_SETTINGS },
    content: [
      { type: "slide_title" },
      { type: "region", attrs: { role: "primary" }, content: [{ type: "paragraph" }] },
      { type: "region", attrs: { role: "secondary" }, content: [{ type: "paragraph" }] },
      { type: "region", attrs: { role: "tertiary" }, content: [{ type: "paragraph" }] },
    ],
  }),
});
