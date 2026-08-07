import { CircleIcon } from "@phosphor-icons/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { createLayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";

import { createSemanticDefinitionLookup } from "./semantic-definition-lookup";

describe("createSemanticDefinitionLookup", () => {
  it("adapts exact registries into frozen narrow views without invoking callbacks", () => {
    const describe = vi.fn(() => ({ label: "Host block" }));
    const projectChildren = vi.fn(() => []);
    const block = defineBlock({
      nodeType: "host_semantic_block",
      title: "Host semantic block",
      documentSemantics: { describe, projectChildren },
      insert: {
        id: "host-semantic-block",
        title: "Insert host semantic block",
        description: "Host insertion metadata",
        icon: CircleIcon,
        category: "content",
        content: () => ({ type: "host_semantic_block" }),
      },
    });
    const layouts = createLayoutRegistry([
      {
        id: "host-semantic-layout",
        title: "Host semantic layout",
        description: "Host layout",
        icon: CircleIcon,
        documentSemantics: { describe },
        section: {
          label: "Panel",
          addLabel: "Add panel",
          documentSemantics: { projectChildren },
          create: () => ({ type: "section" }),
        },
        createContent: () => ({ type: "layout", attrs: { variant: "host-semantic-layout" } }),
      },
    ]);
    const surfaces = createSurfaceVariantRegistry([
      {
        id: "host-semantic-surface",
        modes: ["page"],
        defaultForModes: ["page"],
        title: "Host semantic surface",
        description: "Host surface",
        documentSemantics: { describe },
        createSurface: ({ surfaceId }) => ({
          type: "surface",
          attrs: { id: surfaceId, variant: "host-semantic-surface" },
        }),
      },
    ]);

    const lookup = createSemanticDefinitionLookup({
      blocks: createBlockRegistry([block]),
      layouts,
      surfaces,
    });
    const semanticBlock = lookup.blocks.get(block.nodeType);

    expect(semanticBlock).toEqual({
      nodeType: block.nodeType,
      title: block.title,
      isAssessment: false,
      documentSemantics: block.documentSemantics,
    });
    expect(semanticBlock).toBe(lookup.blocks.get(block.nodeType));
    expect(semanticBlock).not.toHaveProperty("insert");
    expect(lookup.layouts.get("host-semantic-layout")).toEqual({
      id: "host-semantic-layout",
      title: "Host semantic layout",
      documentSemantics: layouts.getById("host-semantic-layout")?.documentSemantics,
      section: {
        label: "Panel",
        documentSemantics: layouts.getById("host-semantic-layout")?.section?.documentSemantics,
      },
    });
    expect(lookup.surfaces.get("host-semantic-surface")).toEqual({
      id: "host-semantic-surface",
      title: "Host semantic surface",
      documentSemantics: surfaces.get("host-semantic-surface")?.documentSemantics,
    });
    expect(lookup.blocks.get("unmounted_block")).toBeUndefined();
    expect(lookup.layouts.get("unmounted-layout")).toBeUndefined();
    expect(lookup.surfaces.get("unmounted-surface")).toBeUndefined();
    expect(Object.isFrozen(lookup)).toBe(true);
    expect(Object.isFrozen(lookup.blocks)).toBe(true);
    expect(Object.isFrozen(semanticBlock)).toBe(true);
    expect(describe).not.toHaveBeenCalled();
    expect(projectChildren).not.toHaveBeenCalled();
  });
});
