// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { createEditorDisposalPool } from "@/editor/testing";
import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { defineConfiguration } from "@/editor/configuration/definition";
import { builtInSurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-views";

import { resolveInteractionSettingsSheetDescriptor as resolveInteractionSettingsSheetDescriptorWithLookup } from "./interaction-settings-sheet-target";

const SETTINGS_BLOCK = "v2_settings_sheet_block";
const PLAIN_BLOCK = "v2_settings_sheet_plain_block";

const settingsBlockDefinition = defineBlock({
  nodeType: SETTINGS_BLOCK,
  configuration: defineConfiguration({
    attr: "settings",
    schema: z.object({ label: z.string().default("") }),
    sheet: {
      title: "Settings block settings",
      sections: [{ id: "general", title: "General" }],
    },
    controls: [
      {
        kind: "text",
        name: "label",
        label: "Label",
        placement: { sheet: { section: "general" } },
      },
    ],
  }),
});

const plainBlockDefinition = defineBlock({ nodeType: PLAIN_BLOCK });

const testBlockRegistry = createBlockRegistry([settingsBlockDefinition, plainBlockDefinition]);
const editorDisposal = createEditorDisposalPool();

afterEach(() => editorDisposal.destroyAll());

const resolveInteractionSettingsSheetDescriptor = (
  editor: Parameters<typeof resolveInteractionSettingsSheetDescriptorWithLookup>[0],
  target: Parameters<typeof resolveInteractionSettingsSheetDescriptorWithLookup>[1],
) =>
  resolveInteractionSettingsSheetDescriptorWithLookup(
    editor,
    target,
    testBlockRegistry,
    builtInSurfaceAuthoringChromeResolver,
  );

function structuralNode(name: string, content: string) {
  return Node.create({
    name,
    content,
    defining: true,
    group: "block",

    addAttributes() {
      return {
        id: { default: null },
        variant: { default: null },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-v2-settings-target-${name}]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", { ...HTMLAttributes, [`data-v2-settings-target-${name}`]: "" }, 0];
    },
  });
}

const TestSurfaceNode = structuralNode("surface", "region+");
const TestRegionNode = structuralNode("region", "block+");
const TestLayoutNode = structuralNode("layout", "section+");
const TestSectionNode = structuralNode("section", "block+");
const TestGridNode = structuralNode("grid", "cell+");
const TestCellNode = structuralNode("cell", "block+");
const TestSettingsBlockNode = structuralNode(SETTINGS_BLOCK, "paragraph+");
const TestPlainBlockNode = structuralNode(PLAIN_BLOCK, "paragraph+");

function makeEditor() {
  return editorDisposal.track(
    new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        TestSurfaceNode,
        TestRegionNode,
        TestLayoutNode,
        TestSectionNode,
        TestGridNode,
        TestCellNode,
        TestSettingsBlockNode,
        TestPlainBlockNode,
      ],
      content: fixtureContent(),
    }),
  );
}

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function fixtureContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "surface",
        attrs: { id: "surface-a", variant: "page-default" },
        content: [
          {
            type: "region",
            attrs: { id: "region-a" },
            content: [
              {
                type: "layout",
                attrs: { id: "layout-a", variant: "tabs" },
                content: [
                  {
                    type: "section",
                    attrs: { id: "section-a" },
                    content: [
                      {
                        type: "grid",
                        attrs: { id: "grid-a" },
                        content: [
                          {
                            type: "cell",
                            attrs: { id: "cell-a" },
                            content: [
                              {
                                type: SETTINGS_BLOCK,
                                attrs: { id: "block-a" },
                                content: [paragraph("block a text")],
                              },
                              {
                                type: PLAIN_BLOCK,
                                attrs: { id: "block-plain" },
                                content: [paragraph("plain block text")],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                type: "layout",
                attrs: { id: null, variant: "tabs" },
                content: [
                  {
                    type: "section",
                    attrs: { id: "section-noid-parent" },
                    content: [paragraph("anonymous layout text")],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "surface",
        attrs: { id: "surface-unknown", variant: "no-such-variant" },
        content: [
          {
            type: "region",
            attrs: { id: "region-b" },
            content: [paragraph("unknown surface text")],
          },
        ],
      },
    ],
  };
}

function findPos(editor: Editor, nodeType: string, id: string | null): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === nodeType && node.attrs["id"] === id) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found < 0) throw new Error(`fixture node not found: ${nodeType} ${id}`);
  return found;
}

function ref(kind: InteractionTargetKind, pos: number, id?: string): InteractionTargetRef {
  return { kind, pos, ...(id ? { id } : {}) };
}

describe("resolveInteractionSettingsSheetDescriptor", () => {
  it("resolves block settings from the registry definition", () => {
    const editor = makeEditor();
    const pos = findPos(editor, SETTINGS_BLOCK, "block-a");

    const descriptor = resolveInteractionSettingsSheetDescriptor(
      editor,
      ref(InteractionTargetKind.Block, pos, "block-a"),
    );

    expect(descriptor).not.toBeNull();
    expect(descriptor?.entry).toBe(settingsBlockDefinition.settingsSheet);
    expect(descriptor?.nodeType).toBe(SETTINGS_BLOCK);
    expect(descriptor?.pos).toBe(pos);
    expect(descriptor?.targetId).toBe("block-a");
    expect(descriptor?.targetKey).toBe(`settings:block:${SETTINGS_BLOCK}:${pos}:block-a`);
  });

  it("returns null for a registered block without a settings sheet", () => {
    const editor = makeEditor();
    const pos = findPos(editor, PLAIN_BLOCK, "block-plain");

    expect(
      resolveInteractionSettingsSheetDescriptor(
        editor,
        ref(InteractionTargetKind.Block, pos, "block-plain"),
      ),
    ).toBeNull();
  });

  it("resolves layout settings from the layout definition", () => {
    const editor = makeEditor();
    const pos = findPos(editor, "layout", "layout-a");

    const descriptor = resolveInteractionSettingsSheetDescriptor(
      editor,
      ref(InteractionTargetKind.Layout, pos, "layout-a"),
    );

    expect(descriptor).not.toBeNull();
    expect(descriptor?.entry.title).toBe("Tabs settings");
    expect(descriptor?.nodeType).toBe("layout");
    expect(descriptor?.pos).toBe(pos);
    expect(descriptor?.targetId).toBe("layout-a");
    expect(descriptor?.targetKey).toBe(`settings:layout:layout:${pos}:layout-a`);
    expect(descriptor?.title).toBe("Tabs");
  });

  it("resolves section settings with the section label as title", () => {
    const editor = makeEditor();
    const pos = findPos(editor, "section", "section-a");

    const descriptor = resolveInteractionSettingsSheetDescriptor(
      editor,
      ref(InteractionTargetKind.Section, pos, "section-a"),
    );

    expect(descriptor).not.toBeNull();
    expect(descriptor?.entry.title).toBe("Tab settings");
    expect(descriptor?.nodeType).toBe("section");
    expect(descriptor?.targetId).toBe("section-a");
    expect(descriptor?.title).toBe("Tab");
  });

  it("resolves surface settings from the registered authoring view", () => {
    const editor = makeEditor();
    const pos = findPos(editor, "surface", "surface-a");

    const descriptor = resolveInteractionSettingsSheetDescriptor(
      editor,
      ref(InteractionTargetKind.Surface, pos, "surface-a"),
    );

    expect(descriptor).not.toBeNull();
    expect(descriptor?.entry.title).toBe("Surface settings");
    expect(descriptor?.nodeType).toBe("surface");
    expect(descriptor?.targetId).toBe("surface-a");
  });

  it("returns null for a surface without a registered authoring view", () => {
    const editor = makeEditor();
    const pos = findPos(editor, "surface", "surface-unknown");

    expect(
      resolveInteractionSettingsSheetDescriptor(
        editor,
        ref(InteractionTargetKind.Surface, pos, "surface-unknown"),
      ),
    ).toBeNull();
  });

  it("returns null for grid, cell, region, and field targets", () => {
    const editor = makeEditor();

    expect(
      resolveInteractionSettingsSheetDescriptor(
        editor,
        ref(InteractionTargetKind.Grid, findPos(editor, "grid", "grid-a"), "grid-a"),
      ),
    ).toBeNull();
    expect(
      resolveInteractionSettingsSheetDescriptor(
        editor,
        ref(InteractionTargetKind.Cell, findPos(editor, "cell", "cell-a"), "cell-a"),
      ),
    ).toBeNull();
    expect(
      resolveInteractionSettingsSheetDescriptor(
        editor,
        ref(InteractionTargetKind.Region, findPos(editor, "region", "region-a"), "region-a"),
      ),
    ).toBeNull();
    expect(
      resolveInteractionSettingsSheetDescriptor(editor, {
        kind: InteractionTargetKind.Field,
        pos: findPos(editor, SETTINGS_BLOCK, "block-a"),
      }),
    ).toBeNull();
  });

  it("returns null for stale and kind-mismatched targets", () => {
    const editor = makeEditor();
    const layoutPos = findPos(editor, "layout", "layout-a");
    const cellPos = findPos(editor, "cell", "cell-a");

    expect(
      resolveInteractionSettingsSheetDescriptor(
        editor,
        ref(InteractionTargetKind.Block, layoutPos),
      ),
    ).toBeNull();
    expect(
      resolveInteractionSettingsSheetDescriptor(
        editor,
        ref(InteractionTargetKind.Layout, cellPos, "layout-a"),
      ),
    ).toBeNull();
    expect(
      resolveInteractionSettingsSheetDescriptor(
        editor,
        ref(InteractionTargetKind.Layout, editor.state.doc.content.size + 10, "layout-a"),
      ),
    ).toBeNull();
  });

  it("returns null for id-mismatched targets", () => {
    const editor = makeEditor();
    const blockPos = findPos(editor, SETTINGS_BLOCK, "block-a");
    const layoutPos = findPos(editor, "layout", "layout-a");

    expect(
      resolveInteractionSettingsSheetDescriptor(
        editor,
        ref(InteractionTargetKind.Block, blockPos, "someone-else"),
      ),
    ).toBeNull();
    expect(
      resolveInteractionSettingsSheetDescriptor(
        editor,
        ref(InteractionTargetKind.Layout, layoutPos, "someone-else"),
      ),
    ).toBeNull();
  });

  it("returns null for structural targets without a stable id", () => {
    const editor = makeEditor();
    const pos = findPos(editor, "layout", null);

    expect(
      resolveInteractionSettingsSheetDescriptor(editor, ref(InteractionTargetKind.Layout, pos)),
    ).toBeNull();
  });

  it("returns null for a missing target ref", () => {
    const editor = makeEditor();

    expect(resolveInteractionSettingsSheetDescriptor(editor, null)).toBeNull();
    expect(resolveInteractionSettingsSheetDescriptor(editor, undefined)).toBeNull();
  });
});
