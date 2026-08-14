// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import { afterEach, describe, expect, expectTypeOf, it } from "vite-plus/test";

import { DocumentNode } from "@/document/model/nodes";
import { CourseDocumentNode, createCourseSectionNode } from "@/document/model/nodes";
import { createTestNodeIdentityExtension } from "@/editor/testing";
import { createGridNode, createCellNode } from "@/editor/arrangements/grid/model/grid-nodes";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { createLayoutNode, createSectionNode } from "@/editor/arrangements/layout/model/layout-nodes";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

import { resolveStableNode } from "@/document/model/identity/resolve-stable-node";
import type { Transaction } from "@tiptap/pm/state";
import {
  setContainerContentLayoutChecked,
  type PresentationContainerNodeType,
  type SetContainerContentLayoutResult,
} from "./content-layout-command";
import { CONTENT_LAYOUT_ATTR } from "./content-layout-attribute";

const FLOW = PresentationContentLayout.Flow;
const SEQUENCE = PresentationContentLayout.Sequence;

const TestRegisteredFillNode = Node.create({
  name: "registered_fill_block",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      payload: { default: "fill-payload" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-node="registered-fill-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-node": "registered-fill-block" }];
  },
});

const testBlockRegistry = createBlockRegistry([
  defineBlock({
    nodeType: "registered_fill_block",
    title: "Registered fill block",
    boundedPlacement: "fill",
  }),
]);

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("setContainerContentLayoutChecked", () => {
  it.each([
    ["region", "region000001"],
    ["cell", "cell00000001"],
    ["section", "section00001"],
  ] satisfies readonly [PresentationContainerNodeType, string][]) (
    "changes a %s from Flow to Sequence",
    (nodeType, containerId) => {
      const editor = makeEditor([nestedRegion()]);
      const tr = editor.state.tr;

      const result = setContainerContentLayoutChecked({
        tr,
        containerId: id(containerId),
        contentLayout: SEQUENCE,
        blockDefinitions: testBlockRegistry,
        layoutDefinitions: builtInLayoutRegistry,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.tr.steps).toHaveLength(1);
      const target = resolveStableNode(editor.state.doc, {
        id: containerId,
        nodeType,
      });
      if (target.status !== "ready") throw new Error(`Expected ${nodeType} target`);
      expect(result.tr.doc.nodeAt(target.pos)?.attrs[CONTENT_LAYOUT_ATTR]).toBe(SEQUENCE);
    },
  );

  it("rejects an invalid requested layout atomically", () => {
    const editor = makeEditor([nestedRegion()]);
    const original = editor.state.doc;
    const tr = editor.state.tr;

    const result = setContainerContentLayoutChecked({
      tr,
      containerId: id("region000001"),
      contentLayout: "unsupported",
      blockDefinitions: testBlockRegistry,
      layoutDefinitions: builtInLayoutRegistry,
    });

    expect(result).toEqual({
      ok: false,
      issue: {
        code: "invalid_settings_value",
        value: "unsupported",
      },
    });
    expectAtomicFailure(result, editor, tr, original, "invalid_settings_value");
  });

  it("rejects a missing container identity atomically", () => {
    const editor = makeEditor([nestedRegion()]);
    const original = editor.state.doc;
    const tr = editor.state.tr;

    const result = setContainerContentLayoutChecked({
      tr,
      containerId: id("missing00001"),
      contentLayout: SEQUENCE,
      blockDefinitions: testBlockRegistry,
      layoutDefinitions: builtInLayoutRegistry,
    });

    expect(result).toEqual({
      ok: false,
      issue: {
        code: "missing_node",
        containerId: "missing00001",
      },
    });
    expectAtomicFailure(result, editor, tr, original, "missing_node");
  });

  it("rejects a duplicate container identity atomically", () => {
    const editor = makeEditor([
      region("region000001", [paragraph("para00000001")]),
      region("region000001", [paragraph("para00000002")]),
    ]);
    const original = editor.state.doc;
    const tr = editor.state.tr;

    const result = setContainerContentLayoutChecked({
      tr,
      containerId: id("region000001"),
      contentLayout: SEQUENCE,
      blockDefinitions: testBlockRegistry,
      layoutDefinitions: builtInLayoutRegistry,
    });

    expect(result).toEqual({
      ok: false,
      issue: {
        code: "duplicate_node_id",
        containerId: "region000001",
      },
    });
    expectAtomicFailure(result, editor, tr, original, "duplicate_node_id");
  });

  it("rejects an identity owned by a non-container node atomically", () => {
    const editor = makeEditor([region("region000001", [paragraph("para00000001")])]);
    const original = editor.state.doc;
    const tr = editor.state.tr;

    const result = setContainerContentLayoutChecked({
      tr,
      containerId: id("para00000001"),
      contentLayout: SEQUENCE,
      blockDefinitions: testBlockRegistry,
      layoutDefinitions: builtInLayoutRegistry,
    });

    expect(result).toEqual({
      ok: false,
      issue: {
        code: "wrong_node_type",
        containerId: "para00000001",
        actualNodeType: "paragraph",
      },
    });
    expectAtomicFailure(result, editor, tr, original, "wrong_node_type");
  });

  it.each([
    ["zero fill occupants", [paragraph("para00000001")]],
    ["one fill occupant", [paragraph("para00000001"), registeredFill("fill00000001")]],
  ])("allows Sequence-to-Flow with %s", (_description, children) => {
    const editor = makeEditor([region("region000001", children, SEQUENCE)]);
    const before = requireNode(editor.state.doc, "region000001", "region");
    const beforeChildIds = directChildIds(before.node);
    const tr = editor.state.tr;

    const result = setContainerContentLayoutChecked({
      tr,
      containerId: id("region000001"),
      contentLayout: FLOW,
      blockDefinitions: testBlockRegistry,
      layoutDefinitions: builtInLayoutRegistry,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tr.steps).toHaveLength(1);
    const after = requireNode(result.tr.doc, "region000001", "region");
    expect(after.node.attrs).toMatchObject({
      [CONTENT_LAYOUT_ATTR]: FLOW,
    });
    expect(directChildIds(after.node)).toEqual(beforeChildIds);
    expect(after.node.content.eq(before.node.content)).toBe(true);
  });

  it("reports every direct registered fill blocker for an incompatible Flow conversion", () => {
    const editor = makeEditor([
      region("region000001", [
        registeredFill("fill00000001"),
        paragraph("para00000001"),
        registeredFill("fill00000002"),
      ], SEQUENCE),
    ]);
    const original = editor.state.doc;
    const tr = editor.state.tr;

    const result = setContainerContentLayoutChecked({
      tr,
      containerId: id("region000001"),
      contentLayout: FLOW,
      blockDefinitions: testBlockRegistry,
      layoutDefinitions: builtInLayoutRegistry,
    });

    expect(result).toMatchObject({
      ok: false,
      issue: {
        code: "incompatible_flow_placement",
        containerId: "region000001",
        blockingChildIds: ["fill00000001", "fill00000002"],
      },
    });
    if (!result.ok && result.issue.code === "incompatible_flow_placement") {
      expectTypeOf(result.issue.containerId).toEqualTypeOf<EmbeddedNodeId>();
      expectTypeOf(result.issue.blockingChildIds).toEqualTypeOf<
        readonly EmbeddedNodeId[]
      >();
    }
    expectAtomicFailure(result, editor, tr, original, "incompatible_flow_placement");
  });

  it("dispatches one history entry and undo restores attrs, children, IDs, and order", () => {
    const editor = makeEditor([
      region(
        "region000001",
        [paragraph("para00000001"), registeredFill("fill00000001")],
        FLOW,
        { role: "complementary", verticalPosition: "bottom" },
      ),
    ]);
    const original = editor.state.doc;
    const before = requireNode(editor.state.doc, "region000001", "region");
    const beforeChildIds = directChildIds(before.node);
    const result = setContainerContentLayoutChecked({
      tr: editor.state.tr,
      containerId: id("region000001"),
      contentLayout: SEQUENCE,
      blockDefinitions: testBlockRegistry,
      layoutDefinitions: builtInLayoutRegistry,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    editor.view.dispatch(result.tr);

    const after = requireNode(editor.state.doc, "region000001", "region");
    expect(after.node.attrs).toEqual({
      ...before.node.attrs,
      [CONTENT_LAYOUT_ATTR]: SEQUENCE,
    });
    expect(directChildIds(after.node)).toEqual(beforeChildIds);
    expect(after.node.content.eq(before.node.content)).toBe(true);

    expect(editor.commands.undo()).toBe(true);
    expect(editor.state.doc.eq(original)).toBe(true);
    const undone = requireNode(editor.state.doc, "region000001", "region");
    expect(undone.node.attrs).toEqual(before.node.attrs);
    expect(directChildIds(undone.node)).toEqual(beforeChildIds);
  });
});

function makeEditor(regions: JSONContent[], withHistory = true): Editor {
  const editor = new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: withHistory ? {} : false,
      }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      createGridNode(),
      createCellNode(),
      createLayoutNode(),
      createSectionNode(),
      TestRegisteredFillNode,
      createTestNodeIdentityExtension(),
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [{ type: "surface", content: regions }],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function nestedRegion(): JSONContent {
  return region("region000001", [
    {
      type: "grid",
      attrs: { id: "grid00000001" },
      content: [
        {
          type: "cell",
          attrs: { id: "cell00000001" },
          content: [
            {
              type: "layout",
              attrs: { id: "layout000001", variant: "tabs" },
              content: [
                {
                  type: "section",
                  attrs: { id: "section00001" },
                  content: [paragraph("para00000001")],
                },
              ],
            },
          ],
        },
      ],
    },
  ]);
}

function region(
  regionId: string,
  content: JSONContent[],
  contentLayout: typeof FLOW | typeof SEQUENCE = FLOW,
  attrs: Record<string, unknown> = {},
): JSONContent {
  return {
    type: "region",
    attrs: {
      id: regionId,
      [CONTENT_LAYOUT_ATTR]: contentLayout,
      ...attrs,
    },
    content,
  };
}

function paragraph(paragraphId: string): JSONContent {
  return {
    type: "paragraph",
    attrs: { id: paragraphId },
    content: [{ type: "text", text: paragraphId }],
  };
}

function registeredFill(fillId: string): JSONContent {
  return {
    type: "registered_fill_block",
    attrs: { id: fillId },
  };
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}

function requireNode(editorDoc: Editor["state"]["doc"], nodeId: string, nodeType: string) {
  const result = resolveStableNode(editorDoc, { id: nodeId, nodeType });
  if (result.status !== "ready") throw new Error(`Expected ${nodeType} ${nodeId}`);
  return result;
}

function directChildIds(node: Editor["state"]["doc"]): unknown[] {
  const ids: unknown[] = [];
  node.forEach((child) => ids.push(child.attrs["id"]));
  return ids;
}

function expectAtomicFailure(
  result: SetContainerContentLayoutResult,
  editor: Editor,
  tr: Transaction,
  original: Editor["state"]["doc"],
  code: string,
) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.issue.code).toBe(code);
  expect(tr.steps).toHaveLength(0);
  expect(tr.doc.eq(original)).toBe(true);
  expect(editor.state.doc.eq(original)).toBe(true);
}
