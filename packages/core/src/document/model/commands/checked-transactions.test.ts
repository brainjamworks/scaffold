// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { EmbeddedNodeId } from "@scaffold/contracts";
import {
  NON_LAYER_DOCUMENT_MUTATION_ACCESS,
  type LayerEditingContext,
  type LayerMutationAccess,
} from "@/document/model/layers/layer-editing-policy";
import { createLayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import {
  APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES,
  DOCUMENT_TREE_LIFECYCLE_APPLICATION,
  DOCUMENT_TREE_LIFECYCLE_LAYER_ID,
  DOCUMENT_TREE_LIFECYCLE_REGION_ID,
  projectDocumentTreeLifecycleDocument,
  requireDocumentTreeLifecycleNodeById,
} from "@/composition/application/testing/document-tree-lifecycle-fixtures";

import {
  deleteNodeChecked,
  duplicateNodeChecked,
  insertNodeChecked,
  replaceNodeContentChecked,
  replaceRangeWithNodeChecked,
  type CheckedMutationIssue,
} from "./checked-transactions";

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

function makeEditor() {
  const editor = new Editor({
    extensions: [StarterKit.configure({ undoRedo: false })],
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "First" }],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

describe("checked transaction primitives", () => {
  it("refuses generic Layer wrapper mutations with identities and no transform change", () => {
    const doc = layeredDocument();
    const layer = findLayeredNode(doc, "layer0000001");
    const region = findLayeredNode(doc, "region000001");
    const tr = new Transform(doc);
    const layerAccess = implicitLayerAccess();

    expect(deleteNodeChecked({ tr, pos: layer.pos, layerAccess })).toEqual({
      ok: false,
      issue: {
        kind: "layer",
        code: "layer_delete_refused",
        message: `Cannot delete protected Layer "layer0000001" through a generic mutation.`,
        layerId: "layer0000001",
      },
    });
    expect(duplicateNodeChecked({ tr, pos: layer.pos, layerAccess })).toMatchObject({
      ok: false,
      issue: { code: "layer_duplicate_refused", layerId: "layer0000001" },
    });
    expect(
      insertNodeChecked({
        tr,
        pos: region.pos + region.node.nodeSize - 1,
        node: layeredSchema.node("layer", { id: "layer0000003" }, [
          layeredParagraph("paragraph003"),
        ]),
        layerAccess,
      }),
    ).toMatchObject({
      ok: false,
      issue: { code: "layer_insert_refused", layerId: "layer0000003" },
    });
    expect(
      replaceNodeContentChecked({
        tr,
        pos: region.pos,
        content: [layeredParagraph("paragraph004")],
        layerAccess,
      }),
    ).toMatchObject({
      ok: false,
      issue: { code: "layer_owner_content_replace_refused", ownerId: "region000001" },
    });
    expect(tr.steps).toHaveLength(0);
    expect(tr.doc).toBe(doc);
  });

  it("returns inactive Layer facts before a checked programmatic insert", () => {
    const doc = layeredDocument();
    const hidden = findLayeredNode(doc, "layer0000002");
    const tr = new Transform(doc);
    const context = {
      blockDefinitions: createBlockRegistry([]),
      layoutDefinitions: createLayoutRegistry([]),
      openLayerByOwnerId: new Map([
        ["region000001" as EmbeddedNodeId, "layer0000001" as EmbeddedNodeId],
      ]),
    } satisfies LayerEditingContext & { blockDefinitions: ReturnType<typeof createBlockRegistry> };

    expect(
      insertNodeChecked({
        tr,
        pos: hidden.pos + hidden.node.nodeSize - 1,
        node: layeredParagraph("paragraph003"),
        layerAccess: { kind: "implicit-authoring", context },
      }),
    ).toEqual({
      ok: false,
      issue: {
        kind: "layer",
        code: "layer_editing_refused",
        message: "Layer editing refused: inactive-layer-target.",
        error: {
          reason: "inactive-layer-target",
          ownerId: "region000001",
          targetLayerId: "layer0000002",
          currentOpenLayerId: "layer0000001",
        },
      },
    });
    expect(tr.steps).toHaveLength(0);
    expect(tr.doc).toBe(doc);
  });

  it("allows an explicitly addressed hidden Layer after owner and slot validation", () => {
    const doc = layeredDocument();
    const hidden = findLayeredNode(doc, "layer0000002");
    const tr = new Transform(doc);
    const result = insertNodeChecked({
      tr,
      pos: hidden.pos + hidden.node.nodeSize - 1,
      node: layeredParagraph("paragraph005"),
      layerAccess: {
        kind: "explicit-layer",
        layoutDefinitions: createLayoutRegistry([]),
        blockDefinitions: createBlockRegistry([]),
        destination: {
          ownerId: EmbeddedNodeIdSchema.parse("region000001"),
          layerId: EmbeddedNodeIdSchema.parse("layer0000002"),
          capturedSlotId: EmbeddedNodeIdSchema.parse("region000001"),
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(findLayeredNode(result.tr.doc, "layer0000002").node.childCount).toBe(2);
    expect(findLayeredNode(doc, "layer0000002").node.childCount).toBe(1);
  });

  it("does not let a non-Layer access declaration bypass a Layer document", () => {
    const doc = layeredDocument();
    const target = findLayeredNode(doc, "layer0000001");
    const tr = new Transform(doc);

    expect(() =>
      insertNodeChecked({
        tr,
        pos: target.pos + 1,
        node: layeredParagraph("paragraph005"),
        layerAccess: NON_LAYER_DOCUMENT_MUTATION_ACCESS,
      }),
    ).toThrow("Layer-aware checked mutation requires explicit Layer access.");
    expect(tr.steps).toHaveLength(0);
    expect(tr.doc).toBe(doc);
  });

  it("keeps Layer issues exclusively discriminated at type level", () => {
    const issue: CheckedMutationIssue = {
      kind: "layer",
      code: "layer_delete_refused",
      message: "Protected",
      layerId: EmbeddedNodeIdSchema.parse("layer0000001"),
    };
    if (issue.kind === "layer") {
      expectTypeOf(issue).toMatchTypeOf<{ kind: "layer" }>();
    }

    // @ts-expect-error Layer boundary facts are required for this discriminated variant.
    const missingFacts: CheckedMutationIssue = {
      kind: "layer",
      code: "layer_editing_refused",
      message: "Missing error",
    };
    expect(missingFacts).toBeDefined();
  });

  it("refuses a direct Grid in a Cell Layer before changing the transform", () => {
    const doc = layeredCellDocument();
    const target = findLayeredNode(doc, "celllayer001");
    const tr = new Transform(doc);
    const context = {
      blockDefinitions: createBlockRegistry([]),
      layoutDefinitions: createLayoutRegistry([]),
      openLayerByOwnerId: new Map([
        ["region000001" as EmbeddedNodeId, "layer0000001" as EmbeddedNodeId],
        ["cell00000001" as EmbeddedNodeId, "celllayer001" as EmbeddedNodeId],
      ]),
    } satisfies LayerEditingContext & { blockDefinitions: ReturnType<typeof createBlockRegistry> };
    const grid = layeredSchema.node("grid", { id: "grid00000002" }, [
      layeredSchema.node("cell", { id: "cell00000002" }, [
        layeredSchema.node("layer", { id: "celllayer002" }, [layeredParagraph("paragraph004")]),
      ]),
    ]);

    expect(
      replaceRangeWithNodeChecked({
        tr,
        from: target.pos + 1,
        to: target.pos + target.node.nodeSize - 1,
        node: grid,
        layerAccess: { kind: "implicit-authoring", context },
      }),
    ).toEqual({
      ok: false,
      issue: {
        kind: "layer",
        code: "layer_editing_refused",
        message: "Layer editing refused: content-incompatible.",
        error: {
          reason: "content-incompatible",
          ownerId: "cell00000001",
          layerId: "celllayer001",
          contentType: "grid",
          rule: "grid-not-allowed-in-cell",
        },
      },
    });
    expect(tr.steps).toHaveLength(0);
    expect(tr.doc).toBe(doc);
  });

  it("matches explicit edits to their actual innermost Layer before applying placement policy", () => {
    const doc = layeredCellDocument();
    const target = findLayeredNode(doc, "celllayer001");
    const from = target.pos + 1;
    const to = target.pos + target.node.nodeSize - 1;
    const grid = layeredSchema.node("grid", { id: "grid00000002" }, [
      layeredSchema.node("cell", { id: "cell00000002" }, [
        layeredSchema.node("layer", { id: "celllayer002" }, [layeredParagraph("paragraph004")]),
      ]),
    ]);

    const wrongDestination = new Transform(doc);
    expect(
      replaceRangeWithNodeChecked({
        tr: wrongDestination,
        from,
        to,
        node: grid,
        layerAccess: explicitLayerAccess("region000001", "layer0000001"),
      }),
    ).toEqual({
      ok: false,
      issue: {
        kind: "layer",
        code: "layer_editing_refused",
        message: "Layer editing refused: explicit-layer-destination-mismatch.",
        error: {
          reason: "explicit-layer-destination-mismatch",
          declaredOwnerId: "region000001",
          declaredLayerId: "layer0000001",
          actualOwnerId: "cell00000001",
          actualLayerId: "celllayer001",
          range: { from, to },
        },
      },
    });
    expect(wrongDestination.steps).toHaveLength(0);

    const correctDestination = new Transform(doc);
    expect(
      replaceRangeWithNodeChecked({
        tr: correctDestination,
        from,
        to,
        node: grid,
        layerAccess: explicitLayerAccess("cell00000001", "celllayer001"),
      }),
    ).toMatchObject({
      ok: false,
      issue: {
        code: "layer_editing_refused",
        error: {
          reason: "content-incompatible",
          ownerId: "cell00000001",
          layerId: "celllayer001",
          rule: "grid-not-allowed-in-cell",
        },
      },
    });
    expect(correctDestination.steps).toHaveLength(0);

    const validEdit = new Transform(doc);
    const result = replaceRangeWithNodeChecked({
      tr: validEdit,
      from,
      to,
      node: layeredParagraph("paragraph005"),
      layerAccess: explicitLayerAccess("cell00000001", "celllayer001"),
    });
    expect(result.ok).toBe(true);
    expect(validEdit.steps).toHaveLength(1);
    expect(findLayeredNode(validEdit.doc, "celllayer001").node.firstChild?.attrs["id"]).toBe(
      "paragraph005",
    );
  });

  it("keeps a missing Layer identity observable as an invariant defect", () => {
    const doc = layeredDocument(null);
    const layer = findLayeredNodeByType(doc, "layer");
    const tr = new Transform(doc);

    expect(() =>
      deleteNodeChecked({ tr, pos: layer.pos, layerAccess: implicitLayerAccess() }),
    ).toThrow('Structural node "layer" has no stable identity.');
    expect(tr.steps).toHaveLength(0);
  });

  it("inserts a valid node into a transform without dispatching", () => {
    const editor = makeEditor();
    const node = editor.schema.nodes.paragraph!.createChecked(null, editor.schema.text("Second"));

    const result = insertNodeChecked({
      tr: editor.state.tr,
      pos: editor.state.doc.content.size,
      node,
      layerAccess: NON_LAYER_DOCUMENT_MUTATION_ACCESS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tr.doc.toJSON()).toMatchObject({
      content: [{ type: "paragraph" }, { type: "paragraph", content: [{ text: "Second" }] }],
    });
    expect(editor.getJSON().content).toHaveLength(1);
  });

  it("rejects an invalid insert position before mutating the transform", () => {
    const editor = makeEditor();
    const node = editor.schema.nodes.paragraph!.createChecked();
    const tr = editor.state.tr;

    const result = insertNodeChecked({
      tr,
      pos: editor.state.doc.content.size + 10,
      node,
      layerAccess: NON_LAYER_DOCUMENT_MUTATION_ACCESS,
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_insert_position" }),
    });
    expect(tr.doc.eq(editor.state.doc)).toBe(true);
  });

  it("rejects nodes that cannot be inserted at the target position", () => {
    const editor = makeEditor();
    const node = editor.schema.nodes.paragraph!.createChecked();
    const tr = editor.state.tr;

    const result = insertNodeChecked({
      tr,
      pos: 2,
      node,
      layerAccess: NON_LAYER_DOCUMENT_MUTATION_ACCESS,
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_insert_target" }),
    });
    expect(tr.doc.eq(editor.state.doc)).toBe(true);
  });

  it("replaces a text range with a valid node without dispatching", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Before /callout" }],
        },
      ],
    });
    const node = editor.schema.nodes.paragraph!.createChecked(null, editor.schema.text("Inserted"));
    const slashPos = findTextPosition(editor, "/callout");

    const result = replaceRangeWithNodeChecked({
      tr: editor.state.tr,
      from: slashPos,
      to: slashPos + "/callout".length,
      node,
      layerAccess: NON_LAYER_DOCUMENT_MUTATION_ACCESS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tr.doc.textContent).toContain("Inserted");
    expect(editor.state.doc.textContent).toBe("Before /callout");
  });

  it("rejects invalid replace ranges before mutating the transform", () => {
    const editor = makeEditor();
    const node = editor.schema.nodes.paragraph!.createChecked();
    const tr = editor.state.tr;

    const result = replaceRangeWithNodeChecked({
      tr,
      from: 10,
      to: 2,
      node,
      layerAccess: NON_LAYER_DOCUMENT_MUTATION_ACCESS,
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_replace_range" }),
    });
    expect(tr.doc.eq(editor.state.doc)).toBe(true);
  });

  it("replaces node content without replacing the node itself", () => {
    const editor = makeEditor();

    const result = replaceNodeContentChecked({
      tr: editor.state.tr,
      pos: 0,
      nodeType: "paragraph",
      content: [editor.schema.text("Changed")],
      layerAccess: NON_LAYER_DOCUMENT_MUTATION_ACCESS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tr.doc.toJSON()).toMatchObject({
      content: [{ type: "paragraph", content: [{ text: "Changed" }] }],
    });
    expect(editor.state.doc.textContent).toBe("First");
  });

  it("rejects replacement content that does not fit the target node", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;

    const result = replaceNodeContentChecked({
      tr,
      pos: 0,
      nodeType: "paragraph",
      content: [editor.schema.nodes.paragraph!.createChecked()],
      layerAccess: NON_LAYER_DOCUMENT_MUTATION_ACCESS,
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_replacement_content" }),
    });
    expect(tr.doc.eq(editor.state.doc)).toBe(true);
  });

  it("deletes a valid node without dispatching", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "First" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Second" }],
        },
      ],
    });
    const secondPos = findTopLevelTextNodePosition(editor, "Second");

    const result = deleteNodeChecked({
      tr: editor.state.tr,
      pos: secondPos,
      layerAccess: NON_LAYER_DOCUMENT_MUTATION_ACCESS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tr.doc.textContent).toBe("First");
    expect(editor.state.doc.textContent).toBe("FirstSecond");
  });

  it("rejects invalid delete positions before mutating the transform", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;

    const result = deleteNodeChecked({
      tr,
      pos: editor.state.doc.content.size + 1,
      layerAccess: NON_LAYER_DOCUMENT_MUTATION_ACCESS,
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_delete_position" }),
    });
    expect(tr.doc.eq(editor.state.doc)).toBe(true);
  });

  it("duplicates a valid node without dispatching", () => {
    const editor = makeEditor();

    const result = duplicateNodeChecked({
      tr: editor.state.tr,
      pos: 0,
      layerAccess: NON_LAYER_DOCUMENT_MUTATION_ACCESS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.node.textContent).toBe("First");
    expect(result.tr.doc.toJSON()).toMatchObject({
      content: [
        { type: "paragraph", content: [{ text: "First" }] },
        { type: "paragraph", content: [{ text: "First" }] },
      ],
    });
    expect(editor.getJSON().content).toHaveLength(1);
  });

  it("requires the content identity lookup when regenerating duplicate identities", () => {
    const editor = makeEditor();
    const duplication = vi.fn(({ content }) => content);
    const identityRewrites = Object.freeze({
      getByNodeType: (nodeType: string) => (nodeType === "paragraph" ? duplication : undefined),
      hasNodeType: (nodeType: string) => nodeType === "paragraph",
    });

    const result = duplicateNodeChecked({
      tr: editor.state.tr,
      pos: 0,
      regenerateNodeIds: true,
      identityRewrites,
      layerAccess: NON_LAYER_DOCUMENT_MUTATION_ACCESS,
    });

    expect(result.ok).toBe(true);
    expect(duplication).toHaveBeenCalledOnce();
  });

  it("rejects a mounted duplication contract fault before checked insertion", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;
    const before = tr.doc.toJSON();
    const identityRewrites = Object.freeze({
      getByNodeType: (nodeType: string) =>
        nodeType === "paragraph"
          ? ({ content }: { content: JSONContent }) => ({ ...content, type: "heading" })
          : undefined,
      hasNodeType: (nodeType: string) => nodeType === "paragraph",
    });

    expect(() =>
      duplicateNodeChecked({
        tr,
        pos: 0,
        regenerateNodeIds: true,
        identityRewrites,
        layerAccess: NON_LAYER_DOCUMENT_MUTATION_ACCESS,
      }),
    ).toThrow(/Content identity rewrite for "paragraph" changed a node type/);
    expect(tr.doc.toJSON()).toEqual(before);
    expect(tr.steps).toHaveLength(0);
  });

  it.each(APPROVED_DOCUMENT_TREE_MEMBER_FAMILY_CASES)(
    "$label checked duplicate regenerates owner and public-descendant identity",
    (family) => {
      const doc = family.createDocument();
      const source = requireDocumentTreeLifecycleNodeById(doc, family.ownerId);
      const sourceBefore = source.node.toJSON();
      const originalDocument = doc.toJSON();
      const tr = new Transform(doc);

      const result = duplicateNodeChecked({
        tr,
        pos: source.pos,
        regenerateNodeIds: true,
        identityRewrites: DOCUMENT_TREE_LIFECYCLE_APPLICATION.capabilities.contentIdentity.rewrites,
        layerAccess: {
          kind: "explicit-layer",
          blockDefinitions: DOCUMENT_TREE_LIFECYCLE_APPLICATION.capabilities.blocks.registry,
          layoutDefinitions: DOCUMENT_TREE_LIFECYCLE_APPLICATION.capabilities.layouts.registry,
          destination: {
            ownerId: DOCUMENT_TREE_LIFECYCLE_REGION_ID,
            layerId: DOCUMENT_TREE_LIFECYCLE_LAYER_ID,
          },
        },
      });

      const definition =
        DOCUMENT_TREE_LIFECYCLE_APPLICATION.capabilities.blocks.registry.getByNodeType(
          family.ownerNodeType,
        );
      if (definition?.boundedPlacement === "fill") {
        expect(result).toMatchObject({
          ok: false,
          issue: {
            kind: "layer",
            code: "layer_editing_refused",
            error: {
              reason: "content-incompatible",
              rule: "fill-occupant-must-be-exclusive",
            },
          },
        });
        expect(doc.toJSON()).toEqual(originalDocument);
        return;
      }

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const duplicateOwnerId = EmbeddedNodeIdSchema.parse(result.node.attrs["id"]);
      const snapshot = projectDocumentTreeLifecycleDocument(result.tr.doc, 41);
      const sourceChildren = snapshot.itemById.get(family.ownerId)?.children ?? [];
      const duplicateChildren = snapshot.itemById.get(duplicateOwnerId)?.children ?? [];
      const sourceIdentities = new Set([family.ownerId, ...sourceChildren.map(({ id }) => id)]);
      const duplicateIdentities = new Set([
        duplicateOwnerId,
        ...duplicateChildren.map(({ id }) => id),
      ]);

      expect(duplicateOwnerId).not.toBe(family.ownerId);
      expect(sourceChildren.map(({ id }) => id)).toEqual([
        family.memberIds.first,
        family.memberIds.second,
      ]);
      expect(duplicateChildren.map(({ nodeType }) => nodeType)).toEqual([
        family.memberNodeType,
        family.memberNodeType,
      ]);
      expect([...sourceIdentities].filter((id) => duplicateIdentities.has(id))).toEqual([]);
      for (const child of duplicateChildren) {
        expect(EmbeddedNodeIdSchema.safeParse(child.id).success).toBe(true);
        expect(snapshot.parentById.get(child.id)).toBe(duplicateOwnerId);
      }
      expect(result.tr.doc.nodeAt(source.pos)?.toJSON()).toEqual(sourceBefore);
      expect(doc.toJSON()).toEqual(originalDocument);
      expect(snapshot.itemById.has(family.unrelatedSiblingId)).toBe(true);
      expect(snapshot.diagnostics).toEqual([]);
    },
  );

  it("rejects invalid duplicate positions before mutating the transform", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;

    const result = duplicateNodeChecked({
      tr,
      pos: editor.state.doc.content.size + 1,
      layerAccess: NON_LAYER_DOCUMENT_MUTATION_ACCESS,
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_duplicate_position" }),
    });
    expect(tr.doc.eq(editor.state.doc)).toBe(true);
  });
});

function implicitLayerAccess(): Extract<LayerMutationAccess, { kind: "implicit-authoring" }> {
  return {
    kind: "implicit-authoring",
    context: {
      blockDefinitions: createBlockRegistry([]),
      layoutDefinitions: createLayoutRegistry([]),
      openLayerByOwnerId: new Map([
        ["region000001" as EmbeddedNodeId, "layer0000001" as EmbeddedNodeId],
        ["cell00000001" as EmbeddedNodeId, "celllayer001" as EmbeddedNodeId],
      ]),
    },
  };
}

function explicitLayerAccess(
  ownerId: string,
  layerId: string,
): Extract<LayerMutationAccess, { kind: "explicit-layer" }> {
  return {
    kind: "explicit-layer",
    blockDefinitions: createBlockRegistry([]),
    layoutDefinitions: createLayoutRegistry([]),
    destination: {
      ownerId: EmbeddedNodeIdSchema.parse(ownerId),
      layerId: EmbeddedNodeIdSchema.parse(layerId),
      capturedSlotId: EmbeddedNodeIdSchema.parse(ownerId),
    },
  };
}

const layeredSchema = new Schema({
  nodes: {
    doc: { content: "region+" },
    text: { group: "inline" },
    region: { content: "layer+", attrs: { id: { default: null } } },
    layer: { content: "(paragraph | grid)+", attrs: { id: { default: null } } },
    paragraph: { content: "inline*", attrs: { id: { default: null } } },
    grid: { content: "cell+", attrs: { id: { default: null } } },
    cell: { content: "layer+", attrs: { id: { default: null } } },
  },
});

function layeredDocument(firstLayerId: string | null = "layer0000001"): ProseMirrorNode {
  return layeredSchema.node("doc", null, [
    layeredSchema.node("region", { id: "region000001" }, [
      layeredSchema.node("layer", { id: firstLayerId }, [layeredParagraph("paragraph001")]),
      layeredSchema.node("layer", { id: "layer0000002" }, [layeredParagraph("paragraph002")]),
    ]),
  ]);
}

function layeredCellDocument(): ProseMirrorNode {
  return layeredSchema.node("doc", null, [
    layeredSchema.node("region", { id: "region000001" }, [
      layeredSchema.node("layer", { id: "layer0000001" }, [
        layeredSchema.node("grid", { id: "grid00000001" }, [
          layeredSchema.node("cell", { id: "cell00000001" }, [
            layeredSchema.node("layer", { id: "celllayer001" }, [layeredParagraph("paragraph001")]),
          ]),
        ]),
      ]),
    ]),
  ]);
}

function layeredParagraph(id: string): ProseMirrorNode {
  return layeredSchema.node("paragraph", { id });
}

function findLayeredNode(
  doc: ProseMirrorNode,
  id: string,
): { readonly node: ProseMirrorNode; readonly pos: number } {
  let match: { readonly node: ProseMirrorNode; readonly pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    match = { node, pos };
    return false;
  });
  if (!match) throw new Error(`Missing layered fixture node "${id}".`);
  return match;
}

function findLayeredNodeByType(
  doc: ProseMirrorNode,
  nodeType: string,
): { readonly node: ProseMirrorNode; readonly pos: number } {
  let match: { readonly node: ProseMirrorNode; readonly pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (match) return false;
    if (node.type.name !== nodeType) return true;
    match = { node, pos };
    return false;
  });
  if (!match) throw new Error(`Missing layered fixture node type "${nodeType}".`);
  return match;
}

function findTextPosition(editor: Editor, text: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (!node.isText) return true;
    const index = node.text?.indexOf(text) ?? -1;
    if (index === -1) return true;
    found = pos + index;
    return false;
  });

  if (found === null) throw new Error(`Could not find text: ${text}`);
  return found;
}

function findTopLevelTextNodePosition(editor: Editor, text: string): number {
  let found: number | null = null;

  editor.state.doc.forEach((node, offset) => {
    if (found !== null) return;
    if (node.textContent === text) {
      found = offset;
    }
  });

  if (found === null) throw new Error(`Could not find top-level node: ${text}`);
  return found;
}
