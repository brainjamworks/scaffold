// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import type { Icon } from "@phosphor-icons/react";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createLayerWithContent } from "@/document/model/layers/layer-construction";
import {
  resolveLayerEditingTarget,
  validateLayerContentPlacement,
  type LayerEditingContext,
} from "@/document/authoring/layers/layer-editing-boundaries";
import { gridInsertAction } from "@/editor/arrangements/grid/model/grid-insert-action";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { createLayoutInsertAction } from "@/editor/arrangements/layout/model/layout-definition";
import { tabsLayoutDefinition } from "@/editor/arrangements/layout/tabs/tabs-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import {
  allowsBoundedContainerRootInsertionAtPosition,
  isActiveBoundedContainerAtPosition,
} from "@/editor/bounded-containers/model/bounded-container-placement";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";

import type { InsertAction } from "./insert-action";
import { resolveInsertActionPlacement } from "./insertion-placement";

const editors: Editor[] = [];
const coreAuthoringComposition = createCoreScaffoldAuthoringComposition();
const TestIcon = (() => null) as unknown as Icon;
const ordinaryInsertAction: InsertAction = Object.freeze({
  id: "test-paragraph",
  nodeType: "paragraph",
  title: "Paragraph",
  description: "Test paragraph",
  icon: TestIcon,
  category: "content",
  content: () => ({ type: "paragraph" }),
});
const cellFillInsertAction = createLayoutInsertAction(tabsLayoutDefinition);

type BoundedContainerType = "region" | "cell" | "section";

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("resolveInsertActionPlacement", () => {
  it("uses the open Layer only and ignores a hidden fill sibling", () => {
    const doc = layerSchema.node("doc", null, [
      layerSurface([
        layerNode("layer0000001", [layerParagraph("paragraph001")]),
        layerNode("layer0000002", [layerGrid("grid00000001")]),
      ]),
    ]);
    const editor = editorFacade(doc, "paragraph001");
    const context = layerContext([["region000001", "layer0000001"]]);
    const before = doc.toJSON();

    expect(
      resolveInsertActionPlacement({
        blockDefinitions: builtInBlockRegistry,
        editor,
        item: ordinaryInsertAction,
        layerEditingContext: context,
        layoutDefinitions: builtInLayoutRegistry,
        surfaceVariants: builtInSurfaceVariantRegistry,
      }),
    ).toEqual({
      ok: true,
      range: { from: editor.state.selection.from, to: editor.state.selection.to },
    });
    expect(doc.toJSON()).toEqual(before);
  });

  it("refuses an implicit inactive target and direct Grid-in-Cell with typed facts", () => {
    const regionDoc = layerSchema.node("doc", null, [
      layerSurface([
        layerNode("layer0000001", [layerParagraph("paragraph001")]),
        layerNode("layer0000002", [layerParagraph("paragraph002")]),
      ]),
    ]);
    const hiddenEditor = editorFacade(regionDoc, "paragraph002");
    const regionContext = layerContext([["region000001", "layer0000001"]]);

    expect(
      resolveInsertActionPlacement({
        blockDefinitions: builtInBlockRegistry,
        editor: hiddenEditor,
        item: ordinaryInsertAction,
        layerEditingContext: regionContext,
        layoutDefinitions: builtInLayoutRegistry,
        surfaceVariants: builtInSurfaceVariantRegistry,
      }),
    ).toEqual({
      ok: false,
      error: {
        reason: "inactive-layer-target",
        ownerId: "region000001",
        targetLayerId: "layer0000002",
        currentOpenLayerId: "layer0000001",
      },
    });

    const cellDoc = layeredCellDocument();
    const cellEditor = editorFacade(cellDoc, "paragraph003");
    const cellContext = layerContext([
      ["region000001", "layer0000001"],
      ["cell00000001", "celllayer001"],
    ]);
    const before = cellDoc.toJSON();
    expect(
      resolveInsertActionPlacement({
        blockDefinitions: builtInBlockRegistry,
        editor: cellEditor,
        item: gridInsertAction,
        layerEditingContext: cellContext,
        layoutDefinitions: builtInLayoutRegistry,
        surfaceVariants: builtInSurfaceVariantRegistry,
      }),
    ).toEqual({
      ok: false,
      error: {
        reason: "content-incompatible",
        ownerId: "cell00000001",
        layerId: "celllayer001",
        contentType: "grid",
        rule: "grid-not-allowed-in-cell",
      },
    });
    expect(cellDoc.toJSON()).toEqual(before);
  });

  it("allows a whole Layout to replace the empty paragraph in an open Cell Layer", () => {
    const doc = layeredCellDocument();
    const editor = editorFacade(doc, "paragraph003");
    const context = layerContext([
      ["region000001", "layer0000001"],
      ["cell00000001", "celllayer001"],
    ]);
    const target = resolveLayerEditingTarget({
      ...context,
      doc,
      ownerId: EmbeddedNodeIdSchema.parse("cell00000001"),
    });
    if (target.status === "error") throw new Error(target.error.reason);
    const paragraphRange = nodeRangeById(doc, "paragraph003");
    expect({ from: target.value.contentFrom, to: target.value.contentTo }).toEqual(paragraphRange);
    expect(
      allowsBoundedContainerRootInsertionAtPosition({
        blockDefinitions: builtInBlockRegistry,
        doc,
        layoutDefinitions: builtInLayoutRegistry,
        pos: target.value.pos,
      }),
    ).toBe(true);
    expect(
      isActiveBoundedContainerAtPosition({
        blockDefinitions: builtInBlockRegistry,
        containerType: "cell",
        doc,
        layoutDefinitions: builtInLayoutRegistry,
        pos: target.value.pos,
      }),
    ).toBe(true);
    expect(
      validateLayerContentPlacement({
        target: target.value,
        contentType: "layout",
        contentIsFillOccupant: true,
        existingChildIsFillOccupant: () => false,
        ...paragraphRange,
      }),
    ).toMatchObject({ status: "ready" });

    expect(
      resolveInsertActionPlacement({
        blockDefinitions: builtInBlockRegistry,
        editor,
        item: cellFillInsertAction,
        layerEditingContext: context,
        layoutDefinitions: builtInLayoutRegistry,
        surfaceVariants: builtInSurfaceVariantRegistry,
      }),
    ).toEqual({
      ok: true,
      range: paragraphRange,
    });
  });

  it.each(["region", "cell", "section"] as const)(
    "refuses an ordinary action after an existing fill occupant in a bounded %s",
    (containerType) => {
      const editor = makeEditor(activeContainerDocument(containerType, true));
      const range = rangeAtEndOfLayerOwnedBy(editor, containerType);

      expect(
        resolveInsertActionPlacement({
          blockDefinitions: builtInBlockRegistry,
          editor,
          item: ordinaryInsertAction,
          layoutDefinitions: builtInLayoutRegistry,
          range,
          surfaceVariants: builtInSurfaceVariantRegistry,
        }),
      ).toMatchObject({
        ok: false,
        error: {
          reason: "content-incompatible",
          contentType: "paragraph",
          rule: "fill-occupant-must-be-exclusive",
        },
      });
    },
  );

  it.each(["region", "cell", "section"] as const)(
    "refuses a second fill occupant in an active bounded %s",
    (containerType) => {
      const editor = makeEditor(activeContainerDocument(containerType, true));
      const range = rangeAtEndOfLayerOwnedBy(editor, containerType);

      expect(
        resolveInsertActionPlacement({
          blockDefinitions: builtInBlockRegistry,
          editor,
          item: fillActionFor(containerType),
          layoutDefinitions: builtInLayoutRegistry,
          range,
          surfaceVariants: builtInSurfaceVariantRegistry,
        }),
      ).toMatchObject({
        ok: false,
        error: {
          reason: "content-incompatible",
          contentType: fillActionFor(containerType).nodeType,
          rule: "fill-occupant-must-be-exclusive",
        },
      });
    },
  );

  it("rejects an authored-text fill action without materializing or mutating placement state", () => {
    const editor = makeEditor(activeContainerDocument("region", false, true));
    const range = rangeInsideTextParagraphOwnedBy(editor, "region");
    const beforeDocument = editor.state.doc.toJSON();
    const beforeSelection = editor.state.selection.toJSON();
    const dispatch = vi.spyOn(editor.view, "dispatch");
    const content = vi.fn(() => ({ type: "grid" }));

    const result = resolveInsertActionPlacement({
      blockDefinitions: builtInBlockRegistry,
      editor,
      item: { ...gridInsertAction, content },
      layoutDefinitions: builtInLayoutRegistry,
      range,
      surfaceVariants: builtInSurfaceVariantRegistry,
    });

    expect(result).toEqual({ ok: false });
    expect(content).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(editor.state.doc.toJSON()).toEqual(beforeDocument);
    expect(editor.state.selection.toJSON()).toEqual(beforeSelection);
  });

  it.each(["region", "cell", "section"] as const)(
    "replaces the sole empty paragraph for an otherwise empty bounded %s",
    (containerType) => {
      const editor = makeEditor(activeContainerDocument(containerType, false));
      const range = rangeInsideParagraphOwnedBy(editor, containerType);
      const paragraphRange = nodeRangeForParagraphOwnedBy(editor, containerType);

      expect(
        resolveInsertActionPlacement({
          blockDefinitions: builtInBlockRegistry,
          editor,
          item: fillActionFor(containerType),
          layoutDefinitions: builtInLayoutRegistry,
          range,
          surfaceVariants: builtInSurfaceVariantRegistry,
        }),
      ).toEqual({ ok: true, range: paragraphRange });
    },
  );

  it("keeps a bounded-layout registry defect observable", () => {
    const editor = makeEditor(activeRegionWithLayoutDocument());
    const range = rangeAtEndOfLayerOwnedBy(editor, "region");
    const defect = new Error("layout registry programming defect");
    const layoutDefinitions = {
      ...builtInLayoutRegistry,
      getForNode() {
        throw defect;
      },
    };
    let observed: unknown;

    try {
      resolveInsertActionPlacement({
        blockDefinitions: builtInBlockRegistry,
        editor,
        item: ordinaryInsertAction,
        layoutDefinitions,
        range,
        surfaceVariants: builtInSurfaceVariantRegistry,
      });
    } catch (error) {
      observed = error;
    }

    expect(observed).toBe(defect);
  });
});

function makeEditor(content: JSONContent): Editor {
  const editor = new Editor({
    extensions: createCourseDocumentAuthoringExtensions({
      composition: coreAuthoringComposition,
      editable: true,
    }),
    content,
  });
  editors.push(editor);
  return editor;
}

function fillActionFor(containerType: BoundedContainerType): InsertAction {
  return containerType === "cell" ? cellFillInsertAction : gridInsertAction;
}

function activeContainerDocument(
  containerType: BoundedContainerType,
  withFill: boolean,
  authoredText = false,
): JSONContent {
  const surface = slideContentSurfaceDefinition.createSurface({
    surfaceId: createEmbeddedNodeId(),
  });
  const region = surface.content?.find((node) => node.type === "region");
  if (!region) throw new Error("expected slide content surface region");
  const regionLayer = requireDirectLayer(region);
  region.attrs = {
    ...region.attrs,
    id: createEmbeddedNodeId(),
    role: "main",
  };

  if (containerType === "region") {
    regionLayer.content = withFill ? [grid()] : [paragraph(authoredText ? "Authored content" : "")];
  } else if (containerType === "cell") {
    regionLayer.content = [
      {
        type: "grid",
        attrs: { id: createEmbeddedNodeId() },
        content: [
          {
            type: "cell",
            attrs: { id: createEmbeddedNodeId() },
            content: [
              createLayerWithContent(
                withFill ? [tabsLayout()] : [paragraph(authoredText ? "Authored content" : "")],
              ),
            ],
          },
        ],
      },
    ];
  } else {
    regionLayer.content = [
      layoutWithSection(withFill ? [grid()] : [paragraph(authoredText ? "Authored content" : "")]),
    ];
  }

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "page" },
        content: [surface],
      },
    ],
  };
}

function activeRegionWithLayoutDocument(): JSONContent {
  const document = activeContainerDocument("region", false);
  const region = document.content?.[0]?.content?.[0]?.content?.find(
    (node) => node.type === "region",
  );
  if (!region) throw new Error("expected slide content surface region");
  requireDirectLayer(region).content = [tabsLayout()];
  return document;
}

function grid(): JSONContent {
  return {
    type: "grid",
    attrs: { id: createEmbeddedNodeId() },
    content: [
      {
        type: "cell",
        attrs: { id: createEmbeddedNodeId() },
        content: [createLayerWithContent([{ type: "paragraph" }])],
      },
    ],
  };
}

function tabsLayout(): JSONContent {
  return layoutWithSection([{ type: "paragraph" }]);
}

function layoutWithSection(sectionContent: JSONContent[]): JSONContent {
  return {
    type: "layout",
    attrs: { id: createEmbeddedNodeId(), variant: "tabs" },
    content: [
      {
        type: "section",
        attrs: { id: createEmbeddedNodeId(), role: "tab-panel" },
        content: [createLayerWithContent(sectionContent)],
      },
    ],
  };
}

function paragraph(text = ""): JSONContent {
  return text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
}

function rangeInsideParagraphOwnedBy(editor: Editor, parentType: BoundedContainerType) {
  let range: { from: number; to: number } | undefined;
  editor.state.doc.descendants((node, pos) => {
    if (
      nearestBoundedOwnerAt(editor.state.doc, pos) === parentType &&
      node.type.name === "paragraph" &&
      node.content.size === 0
    ) {
      range = { from: pos + 1, to: pos + 1 };
      return false;
    }
    return true;
  });
  if (!range) throw new Error(`expected an empty paragraph owned by ${parentType}`);
  return range;
}

function rangeInsideTextParagraphOwnedBy(editor: Editor, parentType: BoundedContainerType) {
  let range: { from: number; to: number } | undefined;
  editor.state.doc.descendants((node, pos) => {
    if (
      nearestBoundedOwnerAt(editor.state.doc, pos) === parentType &&
      node.type.name === "paragraph" &&
      node.textContent
    ) {
      range = { from: pos + 1, to: pos + 1 };
      return false;
    }
    return true;
  });
  if (!range) throw new Error(`expected authored text in a paragraph owned by ${parentType}`);
  return range;
}

function nodeRangeForParagraphOwnedBy(editor: Editor, parentType: BoundedContainerType) {
  let range: { from: number; to: number } | undefined;
  editor.state.doc.descendants((node, pos) => {
    if (
      nearestBoundedOwnerAt(editor.state.doc, pos) === parentType &&
      node.type.name === "paragraph" &&
      node.content.size === 0
    ) {
      range = { from: pos, to: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  if (!range) throw new Error(`expected a paragraph owned by ${parentType}`);
  return range;
}

function rangeAtEndOfLayerOwnedBy(editor: Editor, ownerType: BoundedContainerType) {
  let range: { from: number; to: number } | undefined;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "layer" || nearestBoundedOwnerAt(editor.state.doc, pos) !== ownerType) {
      return true;
    }
    const end = pos + node.nodeSize - 1;
    range = { from: end, to: end };
    return false;
  });
  if (!range) throw new Error(`expected a Layer owned by ${ownerType}`);
  return range;
}

function nearestBoundedOwnerAt(
  document: ProseMirrorNode,
  pos: number,
): BoundedContainerType | undefined {
  const resolved = document.resolve(pos);
  for (let depth = resolved.depth; depth >= 0; depth -= 1) {
    const type = resolved.node(depth).type.name;
    if (type === "region" || type === "cell" || type === "section") return type;
  }
  return undefined;
}

function requireDirectLayer(owner: JSONContent): JSONContent {
  const layer = owner.content?.find((node) => node.type === "layer");
  if (!layer) throw new Error(`expected ${owner.type} Layer`);
  return layer;
}

function editorFacade(doc: ProseMirrorNode, paragraphId: string): Editor {
  const paragraph = nodeRangeById(doc, paragraphId);
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, paragraph.from + 1),
  });
  return { state, schema: layerSchema } as Editor;
}

function layerContext(entries: readonly (readonly [string, string])[]): LayerEditingContext {
  return {
    layoutDefinitions: builtInLayoutRegistry,
    openLayerByOwnerId: new Map(
      entries.map(([ownerId, layerId]) => [
        EmbeddedNodeIdSchema.parse(ownerId),
        EmbeddedNodeIdSchema.parse(layerId),
      ]),
    ),
  };
}

function layerSurface(layers: readonly ProseMirrorNode[]): ProseMirrorNode {
  return layerSchema.node("surface", { id: "surface00001", variant: "slide-content" }, [
    layerSchema.node("region", { id: "region000001" }, layers),
  ]);
}

function layeredCellDocument(): ProseMirrorNode {
  return layerSchema.node("doc", null, [
    layerSurface([
      layerNode("layer0000001", [
        layerSchema.node("grid", { id: "grid00000001" }, [
          layerSchema.node("cell", { id: "cell00000001" }, [
            layerNode("celllayer001", [layerParagraph("paragraph003")]),
          ]),
        ]),
      ]),
    ]),
  ]);
}

function layerNode(id: string, content: readonly ProseMirrorNode[]): ProseMirrorNode {
  return layerSchema.node("layer", { id }, content);
}

function layerParagraph(id: string): ProseMirrorNode {
  return layerSchema.node("paragraph", { id });
}

function layerGrid(id: string): ProseMirrorNode {
  return layerSchema.node("grid", { id }, [
    layerSchema.node("cell", { id: "cell00000002" }, [
      layerNode("celllayer002", [layerParagraph("paragraph004")]),
    ]),
  ]);
}

function nodeRangeById(doc: ProseMirrorNode, id: string): { from: number; to: number } {
  let range: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    range = { from: pos, to: pos + node.nodeSize };
    return false;
  });
  if (!range) throw new Error(`Missing fixture node "${id}".`);
  return range;
}

const layerSchema = new Schema({
  nodes: {
    doc: { content: "surface+" },
    text: { group: "inline" },
    surface: {
      content: "region+",
      attrs: { id: { default: null }, variant: { default: null } },
    },
    region: { content: "layer+", attrs: { id: { default: null } } },
    layer: { content: "(paragraph | grid | layout)+", attrs: { id: { default: null } } },
    paragraph: { content: "inline*", attrs: { id: { default: null } } },
    grid: { content: "cell+", attrs: { id: { default: null } } },
    cell: { content: "layer+", attrs: { id: { default: null } } },
    layout: {
      content: "section+",
      attrs: { id: { default: null }, variant: { default: "tabs" } },
    },
    section: { content: "layer+", attrs: { id: { default: null } } },
  },
});
