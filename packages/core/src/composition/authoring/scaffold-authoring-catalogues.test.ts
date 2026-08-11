import { CircleIcon } from "@phosphor-icons/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { resolveScaffoldCapabilities } from "@/composition/model/resolved-scaffold-capabilities";
import type { LayoutDefinition } from "@/editor/arrangements/layout/model/layout-definition";
import type { SurfaceVariantDefinition } from "@/editor/surfaces/model/surface-variant-definition";

import { createScaffoldAuthoringCatalogues } from "./scaffold-authoring-catalogues";

describe("createScaffoldAuthoringCatalogues", () => {
  it("projects installed Block, Layout, Surface, and fixed structural entries in source order", () => {
    const capabilities = createTestCapabilities();
    const catalogues = createScaffoldAuthoringCatalogues(capabilities);

    expect(capabilities.blocks.registry.definitions[0]).toMatchObject({
      nodeType: "host_block",
      insert: { id: "host-block" },
    });
    expect(catalogues.inDocument.actions.map(({ id }) => id)).toEqual([
      "host-block",
      "host-block-variant",
      "host-layout",
      "grid",
    ]);
    expect(catalogues.surfaceCreation.forMode("page").map(({ variantId }) => variantId)).toEqual([
      "host-surface",
    ]);
  });

  it("owns frozen catalogue and entry copies while retaining opaque callback references", () => {
    const blockContent = () => ({ type: "host_block" });
    const capabilities = createTestCapabilities({ blockContent });

    const first = createScaffoldAuthoringCatalogues(capabilities);
    const second = createScaffoldAuthoringCatalogues(capabilities);

    expect(first).not.toBe(second);
    expect(first.inDocument).not.toBe(second.inDocument);
    expect(first.surfaceCreation).not.toBe(second.surfaceCreation);
    expect(first.inDocument.actions).not.toBe(second.inDocument.actions);
    first.inDocument.actions.forEach((action, index) => {
      expect(action).not.toBe(second.inDocument.actions[index]);
    });
    expect(first.inDocument.actions[0]?.keywords).not.toBe(second.inDocument.actions[0]?.keywords);
    expect(first.inDocument.actions[0]?.content).toBe(blockContent);
    expect(first.surfaceCreation.forMode("page")[0]).not.toBe(
      second.surfaceCreation.forMode("page")[0],
    );
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.inDocument)).toBe(true);
    expect(Object.isFrozen(first.inDocument.actions[0])).toBe(true);
    expect(Object.isFrozen(first.inDocument.actions[0]?.keywords)).toBe(true);
    expect(Object.isFrozen(first.surfaceCreation)).toBe(true);
    expect(Object.isFrozen(first.surfaceCreation.forMode("page")[0])).toBe(true);
  });

  it("keeps Block action, Layout action, and Surface creation factories dormant", () => {
    const blockContent = vi.fn(() => ({ type: "host_block" }));
    const layoutContent = vi.fn(() => ({
      type: "layout",
      attrs: { variant: "host-layout" },
    }));
    const surfaceContent = vi.fn(({ surfaceId }: { surfaceId: string }) => ({
      type: "surface",
      attrs: { id: surfaceId, variant: "host-surface", settings: {} },
    }));

    createScaffoldAuthoringCatalogues(
      createTestCapabilities({ blockContent, layoutContent, surfaceContent }),
    );

    expect(blockContent).not.toHaveBeenCalled();
    expect(layoutContent).not.toHaveBeenCalled();
    expect(surfaceContent).not.toHaveBeenCalled();
  });
});

interface TestCapabilitiesOptions {
  readonly blockContent?: () => Record<string, unknown>;
  readonly layoutContent?: LayoutDefinition["createContent"];
  readonly surfaceContent?: SurfaceVariantDefinition["createSurface"];
}

function createTestCapabilities({
  blockContent = () => ({ type: "host_block" }),
  layoutContent = () => ({ type: "layout", attrs: { variant: "host-layout" } }),
  surfaceContent = ({ surfaceId }) => ({
    type: "surface",
    attrs: { id: surfaceId, variant: "host-surface", settings: {} },
  }),
}: TestCapabilitiesOptions = {}) {
  return resolveScaffoldCapabilities({
    blockCapabilities: [
      {
        definition: {
          nodeType: "host_block",
          title: "Host Block",
          insert: {
            id: "host-block",
            title: "Host Block",
            description: "A host Block",
            icon: CircleIcon,
            category: "content",
            keywords: ["host"],
            content: blockContent,
            variants: [
              {
                id: "host-block-variant",
                title: "Host Block Variant",
                description: "A host Block variant",
                content: () => ({ type: "host_block", attrs: { variant: true } }),
              },
            ],
          },
        },
      },
    ],
    layoutDefinitions: [
      {
        id: "host-layout",
        title: "Host Layout",
        description: "A host Layout",
        icon: CircleIcon,
        createContent: layoutContent,
      },
    ],
    surfaceDefinitions: [
      {
        id: "host-surface",
        modes: ["page"],
        defaultForModes: ["page"],
        title: "Host Surface",
        description: "A host Surface",
        catalogue: {
          section: "content",
          order: 1,
          preview: { kind: "slot", role: "content" },
        },
        createSurface: surfaceContent,
      },
    ],
  });
}
