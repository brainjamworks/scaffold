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

export const slideCentredStageSurfaceDefinition = defineSlideCompositionSurface({
  id: "slide-centred-stage",
  title: "Centred stage",
  description: "Slide with one centred, bounded content region.",
  catalogue: {
    section: "content",
    order: 60,
    preview: {
      kind: "column",
      gap: "medium",
      children: [
        { kind: "slot", role: "title", emphasis: "strong" },
        { kind: "slot", role: "content", emphasis: "quiet" },
      ],
    },
  },
  slideComposition: {
    id: "centred-stage",
    title: "optional-default-on",
    regions: ["main"],
    imageSlots: [],
  },
  settingsSchema: SettingsSchema,
  structurePolicy: {
    fixedChildren: [{ type: "slide_title" }, { type: "region", attrs: { role: "main" } }],
    allowRootInsertion: false,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: { id: surfaceId, variant: "slide-centred-stage", settings: DEFAULT_SETTINGS },
    content: [
      { type: "slide_title" },
      { type: "region", attrs: { role: "main" }, content: [{ type: "paragraph" }] },
    ],
  }),
});
