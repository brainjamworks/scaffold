import type { SurfaceVariantDefinition } from "../surface-variant-definition";

export const pageDefaultSurfaceDefinition = {
  id: "page-default",
  modes: ["page"],
  defaultForModes: ["page"],
  title: "Page",
  description: "Default single-surface page body.",
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: { id: surfaceId, variant: "page-default" },
    content: [{ type: "paragraph" }],
  }),
} satisfies SurfaceVariantDefinition;
