import { z } from "zod";

import { SurfaceSettingsSchema } from "@/schemas/course-document";

import {
  defineSlideCompositionSurface,
  SlideCompositionOrientationSchema,
} from "../slide-composition-definition";
import { DEFAULT_SURFACE_SETTINGS } from "../surface-settings";

const SlideSideTitleSurfaceSettingsValueSchema = SurfaceSettingsSchema.extend({
  orientation: SlideCompositionOrientationSchema,
}).strict();

export const SlideSideTitleSurfaceSettingsSchema = z.preprocess(
  omitLegacyProportion,
  SlideSideTitleSurfaceSettingsValueSchema,
);

function omitLegacyProportion(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const { proportion: _legacyProportion, ...settings } = value as Record<string, unknown>;
  return settings;
}

const DEFAULT_SETTINGS = SlideSideTitleSurfaceSettingsSchema.parse({
  ...DEFAULT_SURFACE_SETTINGS,
  orientation: "default",
});

export const slideSideTitleSurfaceDefinition = defineSlideCompositionSurface({
  id: "slide-side-title",
  title: "Side title",
  description: "Slide with a required vertical margin title and wide main content region.",
  catalogue: {
    section: "content",
    order: 50,
    preview: {
      kind: "row",
      gap: "medium",
      proportions: [1, 4],
      children: [
        { kind: "slot", role: "title", emphasis: "strong" },
        { kind: "slot", role: "content" },
      ],
    },
  },
  slideComposition: {
    id: "side-title",
    title: "required",
    regions: ["main"],
    imageSlots: [],
    orientation: { default: "default", options: ["default", "reversed"] },
  },
  settingsSchema: SlideSideTitleSurfaceSettingsSchema,
  structurePolicy: {
    fixedChildren: [{ type: "slide_title" }, { type: "region", attrs: { role: "main" } }],
    allowRootInsertion: false,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: { id: surfaceId, variant: "slide-side-title", settings: DEFAULT_SETTINGS },
    content: [
      { type: "slide_title" },
      { type: "region", attrs: { role: "main" }, content: [{ type: "paragraph" }] },
    ],
  }),
});
