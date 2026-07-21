import type { SurfaceVariantDefinition } from "../surface-variant-definition";

export const slideModuleCoverSurfaceDefinition = {
  id: "slide-module-cover",
  modes: ["slideshow"],
  title: "Module cover",
  description: "Structured opener for a course module or unit.",
  catalogue: {
    section: "title",
    order: 20,
    preview: {
      kind: "column",
      gap: "medium",
      children: [
        { kind: "slot", role: "label", emphasis: "quiet" },
        {
          kind: "column",
          gap: "small",
          children: [
            { kind: "slot", role: "title", emphasis: "strong" },
            { kind: "slot", role: "label" },
            { kind: "slot", role: "label", emphasis: "quiet" },
          ],
        },
      ],
    },
  },
  structurePolicy: {
    fixedChildren: [
      { type: "slide_cover_subtitle" },
      { type: "heading", attrs: { level: 1 } },
      { type: "slide_cover_subtitle" },
      { type: "slide_cover_subtitle" },
    ],
    allowRootInsertion: false,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: {
      id: surfaceId,
      variant: "slide-module-cover",
    },
    content: [
      {
        type: "slide_cover_subtitle",
        content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
      },
      { type: "heading", attrs: { level: 1, textAlign: "left" } },
      {
        type: "slide_cover_subtitle",
        content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
      },
      {
        type: "slide_cover_subtitle",
        content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
      },
    ],
  }),
} satisfies SurfaceVariantDefinition;
