import { CircleIcon } from "@phosphor-icons/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { createLayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";

import { createDocumentTreeDefinitionLookup } from "./document-tree-definition-lookup";

describe("createDocumentTreeDefinitionLookup", () => {
  it("adapts exact registries into frozen narrow views without invoking callbacks", () => {
    const describe = vi.fn(() => ({ label: "Host block" }));
    const projectChildren = vi.fn(() => []);
    const block = defineBlock({
      nodeType: "host_semantic_block",
      title: "Host semantic block",
      documentTree: { describe, projectChildren },
      control: {
        owner: { events: [{ type: "submitted", label: "Submitted" }] },
      },
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
        documentTree: { describe },
        control: {
          semanticChildren: {
            section: { commands: [{ type: "select", label: "Select" }] },
          },
        },
        section: {
          label: "Panel",
          addLabel: "Add panel",
          compositionSlot: { kind: "child", nodeType: "host_panel" },
          structure: { kind: "ordered-children", nodeTypes: ["host_title", "host_panel"] },
          documentTree: { projectChildren },
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
        documentTree: { describe },
        control: {
          owner: {
            states: [{ key: "active", label: "Active", valueType: { kind: "boolean" } }],
          },
        },
        createSurface: ({ surfaceId }) => ({
          type: "surface",
          attrs: { id: surfaceId, variant: "host-semantic-surface" },
        }),
      },
    ]);

    const lookup = createDocumentTreeDefinitionLookup({
      blocks: createBlockRegistry([block]),
      layouts,
      surfaces,
    });
    const semanticBlock = lookup.blocks.get(block.nodeType);

    expect(semanticBlock).toEqual({
      nodeType: block.nodeType,
      title: block.title,
      isAssessment: false,
      documentTree: block.documentTree,
      control: block.control,
    });
    expect(semanticBlock).toBe(lookup.blocks.get(block.nodeType));
    expect(semanticBlock).not.toHaveProperty("insert");
    expect(lookup.layouts.get("host-semantic-layout")).toEqual({
      id: "host-semantic-layout",
      title: "Host semantic layout",
      documentTree: layouts.getById("host-semantic-layout")?.documentTree,
      control: layouts.getById("host-semantic-layout")?.control,
      section: {
        label: "Panel",
        compositionSlot: { kind: "child", nodeType: "host_panel" },
        structure: { kind: "ordered-children", nodeTypes: ["host_title", "host_panel"] },
        documentTree: layouts.getById("host-semantic-layout")?.section?.documentTree,
      },
    });
    expect(lookup.surfaces.get("host-semantic-surface")).toEqual({
      id: "host-semantic-surface",
      title: "Host semantic surface",
      documentTree: surfaces.get("host-semantic-surface")?.documentTree,
      control: surfaces.get("host-semantic-surface")?.control,
    });
    expect(lookup.blocks.get("unmounted_block")).toBeUndefined();
    expect(lookup.layouts.get("unmounted-layout")).toBeUndefined();
    expect(lookup.surfaces.get("unmounted-surface")).toBeUndefined();
    expect(Object.isFrozen(lookup)).toBe(true);
    expect(Object.isFrozen(lookup.blocks)).toBe(true);
    expect(Object.isFrozen(semanticBlock)).toBe(true);
    expect(
      Object.isFrozen(lookup.layouts.get("host-semantic-layout")?.section?.compositionSlot),
    ).toBe(true);
    expect(
      Object.isFrozen(lookup.layouts.get("host-semantic-layout")?.section?.structure?.nodeTypes),
    ).toBe(true);
    expect(semanticBlock?.control).toBe(block.control);
    expect(Object.isFrozen(semanticBlock?.control)).toBe(true);
    expect(describe).not.toHaveBeenCalled();
    expect(projectChildren).not.toHaveBeenCalled();
  });
});
