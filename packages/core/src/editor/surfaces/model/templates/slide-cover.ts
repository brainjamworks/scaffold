import { SurfaceSettingsSchema } from "@/schemas/course-document";

import { DEFAULT_SURFACE_SETTINGS } from "../surface-settings";
import type { SurfaceVariantDefinition } from "../surface-variant-definition";

export const SlideCoverSurfaceSettingsSchema = SurfaceSettingsSchema;

export type SlideCoverSurfaceSettings = typeof SlideCoverSurfaceSettingsSchema._output;

export const DEFAULT_SLIDE_COVER_SURFACE_SETTINGS =
  SlideCoverSurfaceSettingsSchema.parse(DEFAULT_SURFACE_SETTINGS);

export const slideCoverSurfaceDefinition = {
  id: "slide-cover",
  modes: ["slideshow"],
  defaultForModes: ["slideshow"],
  title: "Cover",
  description: "Opening slide with a title and short description.",
  catalogue: {
    section: "title",
    order: 10,
    preview: {
      kind: "column",
      gap: "small",
      children: [
        { kind: "slot", role: "title", emphasis: "strong" },
        { kind: "slot", role: "label", emphasis: "quiet" },
      ],
    },
  },
  alignment: {
    verticalContentPosition: {
      behavior: "finite-direct-stack",
      default: "middle",
    },
  },
  settingsSchema: SlideCoverSurfaceSettingsSchema,
  structurePolicy: {
    fixedChildren: [{ type: "heading", attrs: { level: 1 } }, { type: "slide_cover_subtitle" }],
    allowRootInsertion: false,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: {
      id: surfaceId,
      variant: "slide-cover",
      settings: DEFAULT_SLIDE_COVER_SURFACE_SETTINGS,
    },
    content: [
      { type: "heading", attrs: { level: 1, textAlign: "left" } },
      {
        type: "slide_cover_subtitle",
        content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
      },
    ],
  }),
} satisfies SurfaceVariantDefinition;
