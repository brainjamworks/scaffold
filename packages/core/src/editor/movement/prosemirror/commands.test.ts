// @vitest-environment happy-dom

import { Editor, Extension, Node, type JSONContent } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import {
  AccordionSectionPanelNode,
  AccordionSectionTitleNode,
} from "@/editor/arrangements/layout/accordion/accordion-section-nodes";
import { defineBlock } from "@/editor/blocks/block-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { CourseDocumentNode, DocumentNode, createCourseSectionNode } from "@/document/model/nodes";
import { pageDefaultSurfaceDefinition } from "@/editor/surfaces/model/templates/page-default";
import type { SurfaceVariantDefinition } from "@/editor/surfaces/model/surface-variant-definition";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import { RegionAuthoringNode } from "@/editor/surfaces/authoring/nodes/region-authoring-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { createTestNodeIdentityExtension } from "@/editor/testing/node-identity";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { createDocumentTreeDefinitionLookup } from "@/composition/model/document-tree-definition-lookup";
import { createDocumentAuthoringExtension } from "@/document/authoring/document-authoring-extension";
import { createLayerEditingBoundaryExtension } from "@/document/authoring/layers/layer-editing-boundaries";
import { LayerNode } from "@/document/model/layers/layer-node";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";

import {
  applyMovementIntent as applyMovementIntentWithLookup,
  canApplyMovementIntent as canApplyMovementIntentWithLookup,
} from "./commands";
import {
  AddCellAfterTarget,
  AddCellAtGridEnd,
  CreateGridAfterBlock,
  CreateGridBeforeBlock,
  InsertAfterTarget,
  InsertBeforeTarget,
  InsertInsideTarget,
} from "../model/movement-intents";
import { resolveMovementNodeContext } from "../model/movement-policy";
import {
  BlockMovementTarget,
  CellMovementTarget,
  GridMovementTarget,
  createMovementTarget,
  type AnyMovementTarget,
  type MovementTargetRect,
} from "../model/movement-target";

const FILL_TEST_BLOCK = "drag_commands_fill_test_block";

const testBlockRegistry = createBlockRegistry([
  ...builtInBlockRegistry.definitions,
  defineBlock({ nodeType: "test_block", title: "Test block" }),
  defineBlock({
    nodeType: FILL_TEST_BLOCK,
    title: "Fill test block",
    boundedPlacement: "fill",
  }),
]);

const canApplyMovementIntent = (
  editor: Parameters<typeof canApplyMovementIntentWithLookup>[0],
  sourcePos: Parameters<typeof canApplyMovementIntentWithLookup>[1],
  intent: Parameters<typeof canApplyMovementIntentWithLookup>[2],
) =>
  canApplyMovementIntentWithLookup(
    editor,
    sourcePos,
    intent,
    testBlockRegistry,
    testSurfaceVariants,
  );

const applyMovementIntent = (
  editor: Parameters<typeof applyMovementIntentWithLookup>[0],
  sourcePos: Parameters<typeof applyMovementIntentWithLookup>[1],
  intent: Parameters<typeof applyMovementIntentWithLookup>[2],
) =>
  applyMovementIntentWithLookup(editor, sourcePos, intent, testBlockRegistry, testSurfaceVariants);

const ROOT_INSERTION_DISABLED_VARIANT = "drag-root-insertion-disabled-test-surface";

const rootInsertionDisabledSurfaceDefinition = {
  id: ROOT_INSERTION_DISABLED_VARIANT,
  modes: ["page"],
  title: "Movement root insertion disabled test surface",
  description: "Test surface that rejects direct root insertion.",
  structurePolicy: {
    allowRootInsertion: false,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: { id: surfaceId, variant: ROOT_INSERTION_DISABLED_VARIANT },
    content: [{ type: "paragraph" }],
  }),
} satisfies SurfaceVariantDefinition;

const fixedSurfaceDefinition = {
  id: "drag-fixed-test-surface",
  modes: ["page"],
  title: "Movement fixed test surface",
  description: "Test surface with an exact fixed block signature.",
  structurePolicy: {
    fixedChildren: [{ type: "test_block" }, { type: "test_block" }],
    allowRootInsertion: false,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: { id: surfaceId, variant: "drag-fixed-test-surface" },
    content: [
      { type: "test_block", attrs: { id: "fixture-primary" } },
      { type: "test_block", attrs: { id: "fixture-secondary" } },
    ],
  }),
} satisfies SurfaceVariantDefinition;

const testSurfaceVariants = createSurfaceVariantRegistry([
  pageDefaultSurfaceDefinition,
  rootInsertionDisabledSurfaceDefinition,
  fixedSurfaceDefinition,
]);
const testCapabilities = Object.freeze({
  blocks: Object.freeze({
    registry: testBlockRegistry,
  }),
  layouts: Object.freeze({ registry: builtInLayoutRegistry }),
  surfaces: Object.freeze({ registry: testSurfaceVariants }),
  contentIdentity: Object.freeze({
    rewrites: Object.freeze({ getByNodeType: () => undefined, hasNodeType: () => false }),
  }),
  documentTree: createDocumentTreeDefinitionLookup({
    blocks: testBlockRegistry,
    layouts: builtInLayoutRegistry,
    surfaces: testSurfaceVariants,
  }),
});

const TestBlockNode = Node.create({
  name: "test_block",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      frame: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute("data-frame");
          return raw ? JSON.parse(raw) : null;
        },
        renderHTML: (attrs: { frame?: unknown }) =>
          attrs.frame ? { "data-frame": JSON.stringify(attrs.frame) } : {},
      },
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
        renderHTML: (attrs: { id?: unknown }) =>
          typeof attrs.id === "string" ? { "data-id": attrs.id } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-test-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-test-block": "" }];
  },
});

// Production compositions always register surface question nodes, so the
// `assessment_question` group referenced by SurfaceNode is never empty there.
// This minimal stub keeps the hand-built fixture schema honest (RIZ-303).
const MovementTestAssessmentQuestionNode = Node.create({
  name: "movement_test_assessment_question",
  group: "assessment_question",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-movement-test-assessment-question]" }];
  },

  renderHTML() {
    return ["div", { "data-movement-test-assessment-question": "" }];
  },
});

const FillTestBlockNode = Node.create({
  name: FILL_TEST_BLOCK,
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
        renderHTML: (attrs: { id?: unknown }) =>
          typeof attrs.id === "string" ? { "data-id": attrs.id } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-${FILL_TEST_BLOCK}]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, [`data-${FILL_TEST_BLOCK}`]: "" }];
  },
});

function block(id: string, attrs: Record<string, unknown> = {}): JSONContent {
  return { type: "test_block", attrs: { id, ...attrs } };
}

function fillBlock(id: string): JSONContent {
  return { type: FILL_TEST_BLOCK, attrs: { id } };
}

function resizedBlock(id: string): JSONContent {
  return block(id, {
    frame: {
      align: "end",
      aspectRatio: 1.6,
      widthMode: "percent",
      widthPercent: 42.5,
    },
  });
}

function paragraph(): JSONContent {
  return { type: "paragraph" };
}

function layer(content: JSONContent[]): JSONContent {
  return { type: "layer", content: content.length ? content : [paragraph()] };
}

function section(content: JSONContent[]): JSONContent {
  return { type: "section", content: [layer(content)] };
}

function layout(content: JSONContent[] = [section([block("nested")])]): JSONContent {
  return { type: "layout", attrs: { variant: "tabs" }, content: [section(content)] };
}

function tabsLayout(content: JSONContent[] = [paragraph()]): JSONContent {
  return {
    type: "layout",
    attrs: { variant: "tabs" },
    content: [section(content)],
  };
}

function region(id: string, content: JSONContent[]): JSONContent {
  return {
    type: "region",
    attrs: { id },
    content: [layer(content)],
  };
}

function cell(content: JSONContent[]): JSONContent {
  return { type: "cell", content: [layer(content)] };
}

function grid(cells: JSONContent[]): JSONContent {
  return { type: "grid", content: cells };
}

function courseDocument(content: JSONContent[], surfaceVariant = "page-default"): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        content: [
          {
            type: "surface",
            attrs: { id: "surface00001", variant: surfaceVariant },
            content,
          },
        ],
      },
    ],
  };
}

function makeEditor(
  content: JSONContent[],
  surfaceVariant = "page-default",
  options: { includeCapabilities?: boolean; layoutRegistry?: LayoutRegistry } = {},
) {
  const capabilities = options.layoutRegistry
    ? Object.freeze({
        ...testCapabilities,
        layouts: Object.freeze({ registry: options.layoutRegistry }),
      })
    : testCapabilities;

  const document = courseDocument(content, surfaceVariant);
  establishFixtureIds(document);
  return new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: false,
      }),
      createTestNodeIdentityExtension(),
      ...(options.includeCapabilities === false
        ? []
        : [createScaffoldCapabilitiesStorageExtension(capabilities)]),
      createDocumentAuthoringExtension(capabilities.documentTree),
      createLayerEditingBoundaryExtension(testBlockRegistry, capabilities.layouts.registry),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionAuthoringNode,
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      AccordionSectionTitleNode,
      AccordionSectionPanelNode,
      LayerNode,
      TestBlockNode,
      FillTestBlockNode,
      MovementTestAssessmentQuestionNode,
    ],
    content: document,
  });
}

function makeLayerMovementEditor(
  options: {
    readonly content?: JSONContent[];
    readonly includeLifecycle?: boolean;
    readonly rejectDocumentChanges?: boolean;
  } = {},
): Editor {
  return new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: false,
      }),
      createTestNodeIdentityExtension(),
      createScaffoldCapabilitiesStorageExtension(testCapabilities),
      ...(options.includeLifecycle === false
        ? []
        : [createDocumentAuthoringExtension(testCapabilities.documentTree)]),
      createLayerEditingBoundaryExtension(testBlockRegistry, builtInLayoutRegistry),
      ...(options.rejectDocumentChanges
        ? [
            Extension.create({
              name: "rejectMovementTestTransactions",
              addProseMirrorPlugins: () => [
                new Plugin({ filterTransaction: (transaction) => !transaction.docChanged }),
              ],
            }),
          ]
        : []),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionAuthoringNode.extend({ content: "layer+" }),
      GridAuthoringNode,
      CellAuthoringNode.extend({ content: "layer+" }),
      LayoutAuthoringNode,
      SectionAuthoringNode.extend({ content: "layer+" }),
      LayerNode,
      TestBlockNode,
      FillTestBlockNode,
      MovementTestAssessmentQuestionNode,
    ],
    content: courseDocument(
      options.content ?? [
        layeredRegion("region000001", [
          {
            type: "layer",
            attrs: { id: "layer0000001" },
            content: [block("block0000001")],
          },
        ]),
        layeredRegion("region000002", [
          {
            type: "layer",
            attrs: { id: "layer0000002" },
            content: [{ type: "paragraph", attrs: { id: "paragraph001" } }],
          },
          {
            type: "layer",
            attrs: { id: "layer0000003" },
            content: [block("block0000002")],
          },
        ]),
      ],
    ),
  });
}

function layeredRegion(id: string, layers: JSONContent[]): JSONContent {
  return { type: "region", attrs: { id }, content: layers };
}

function layerChildren(editor: Editor, layerId: string): JSONContent[] {
  const layer = editor.state.doc.nodeAt(nodePos(editor, "layer", layerId));
  if (!layer) throw new Error(`Missing Layer "${layerId}".`);
  return (layer.toJSON().content ?? []) as JSONContent[];
}

function nodePos(editor: Editor, type: string, id?: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== type) return true;
    if (id !== undefined && node.attrs["id"] !== fixtureEmbeddedId(id)) return true;
    found = pos;
    return false;
  });

  if (found === null) {
    throw new Error(`Could not find ${type}${id ? `:${id}` : ""}`);
  }

  return found;
}

const TEST_TARGET_RECT: MovementTargetRect = {
  bottom: 120,
  height: 100,
  left: 20,
  right: 220,
  top: 20,
  width: 200,
};

function movementTarget(editor: Editor, type: string, id?: string): AnyMovementTarget {
  return movementTargetAtPos(editor, nodePos(editor, type, id));
}

function movementTargetAtPos(editor: Editor, pos: number): AnyMovementTarget {
  const context = resolveMovementNodeContext(editor.state.doc, pos);
  if (!context) throw new Error(`Could not resolve movement context at ${pos}`);
  return createMovementTarget(context, TEST_TARGET_RECT);
}

function blockTarget(editor: Editor, id: string): BlockMovementTarget {
  const target = movementTarget(editor, "test_block", id);
  if (!(target instanceof BlockMovementTarget)) {
    throw new Error(`Expected block target for ${id}`);
  }
  return target;
}

function cellTarget(editor: Editor): CellMovementTarget {
  const target = movementTarget(editor, "cell");
  if (!(target instanceof CellMovementTarget)) {
    throw new Error("Expected cell target");
  }
  return target;
}

function gridTarget(editor: Editor): GridMovementTarget {
  const target = movementTarget(editor, "grid");
  if (!(target instanceof GridMovementTarget)) {
    throw new Error("Expected grid target");
  }
  return target;
}

function nodePositions(editor: Editor, type: string): number[] {
  const positions: number[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === type) positions.push(pos);
    return true;
  });

  return positions;
}

function idsInDocument(editor: Editor): string[] {
  const ids: string[] = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name === "test_block" && typeof node.attrs["id"] === "string") {
      ids.push(fixtureIdAliases.get(node.attrs["id"]) ?? node.attrs["id"]);
    }
    return true;
  });

  return ids;
}

function blockAttrs(editor: Editor, id: string): Record<string, unknown> {
  let attrs: Record<string, unknown> | null = null;

  editor.state.doc.descendants((node) => {
    if (attrs) return false;
    if (node.type.name !== "test_block" || node.attrs["id"] !== fixtureEmbeddedId(id)) return true;
    attrs = node.attrs;
    return false;
  });

  if (!attrs) throw new Error(`Could not find test_block:${id}`);
  return attrs;
}

function surfaceChildren(editor: Editor): JSONContent[] {
  const course = editor.getJSON().content?.[0] as JSONContent | undefined;
  const surface = course?.content?.[0] as JSONContent | undefined;
  return surface?.content ?? [];
}

function regionChildren(editor: Editor, id: string): JSONContent[] {
  const region = surfaceChildren(editor).find(
    (child) => child.type === "region" && child.attrs?.["id"] === fixtureEmbeddedId(id),
  );
  return compositionChildren(region);
}

function gridCells(editor: Editor): JSONContent[] {
  const gridNode = surfaceChildren(editor).find((child) => child.type === "grid");
  return gridNode?.content ?? [];
}

function cellBlockIds(cellNode: JSONContent): string[] {
  return compositionChildren(cellNode)
    .filter((child) => child.type === "test_block")
    .map((child) => child.attrs?.["id"])
    .filter((id): id is string => typeof id === "string")
    .map((id) => fixtureIdAliases.get(id) ?? id);
}

function fillBlockIds(cellNode: JSONContent): string[] {
  return compositionChildren(cellNode)
    .filter((child) => child.type === FILL_TEST_BLOCK)
    .map((child) => child.attrs?.["id"])
    .filter((id): id is string => typeof id === "string")
    .map((id) => fixtureIdAliases.get(id) ?? id);
}

function compositionChildren(owner: JSONContent | undefined): JSONContent[] {
  const layer = owner?.content?.find((child) => child.type === "layer");
  return layer?.content ?? [];
}

const fixtureIdAliases = new Map<string, string>();

function fixtureEmbeddedId(id: string): string {
  if (EmbeddedNodeIdSchema.safeParse(id).success) return id;
  const stableId = `fixture${id.replace(/[^0-9A-Z_a-z-]/g, "")}000000000000`.slice(0, 12);
  fixtureIdAliases.set(stableId, id);
  return stableId;
}

function establishFixtureIds(root: JSONContent): void {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type !== "doc" && node.type !== "text") {
      const id = node.attrs?.["id"];
      node.attrs = {
        ...node.attrs,
        id:
          typeof id === "string" && id.length > 0 ? fixtureEmbeddedId(id) : createEmbeddedNodeId(),
      };
    }
    stack.push(...(node.content ?? []));
  }
}

function nodeTypesInJson(content: JSONContent): string[] {
  const types: string[] = [];
  const visit = (node: JSONContent) => {
    if (node.type) types.push(node.type);
    node.content?.forEach(visit);
  };
  visit(content);
  return types;
}

describe("drag movement commands", () => {
  it("moves ordinary siblings without requiring bounded capability storage", () => {
    const editor = makeEditor([block("a"), block("b")], "page-default", {
      includeCapabilities: false,
    });

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "a"),
        new InsertAfterTarget(blockTarget(editor, "b")),
      ),
    ).toBe(true);
    expect(idsInDocument(editor)).toEqual(["b", "a"]);
    editor.destroy();
  });

  it("moves a block after a sibling in the same parent", () => {
    const editor = makeEditor([block("a"), block("b"), block("c")]);

    expect(
      canApplyMovementIntent(
        editor,
        nodePos(editor, "test_block", "a"),
        new InsertAfterTarget(blockTarget(editor, "c")),
      ),
    ).toBe(true);
    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "a"),
        new InsertAfterTarget(blockTarget(editor, "c")),
      ),
    ).toBe(true);

    expect(idsInDocument(editor)).toEqual(["b", "c", "a"]);
    editor.destroy();
  });

  it("does not move blocks directly into a surface variant with root insertion disabled", () => {
    const definition = testSurfaceVariants.get(ROOT_INSERTION_DISABLED_VARIANT);
    expect(definition).toBeDefined();
    expect(definition?.structurePolicy?.allowRootInsertion).toBe(false);

    const editor = makeEditor(
      [block("root"), grid([cell([block("nested")])])],
      ROOT_INSERTION_DISABLED_VARIANT,
    );

    expect(
      canApplyMovementIntent(
        editor,
        nodePos(editor, "test_block", "nested"),
        new InsertAfterTarget(blockTarget(editor, "root")),
      ),
    ).toBe(false);
    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "nested"),
        new InsertAfterTarget(blockTarget(editor, "root")),
      ),
    ).toBe(false);
    expect(idsInDocument(editor)).toEqual(["root", "nested"]);

    expect(
      canApplyMovementIntent(
        editor,
        nodePos(editor, "test_block", "nested"),
        new InsertInsideTarget(movementTarget(editor, "surface")),
      ),
    ).toBe(false);
    expect(idsInDocument(editor)).toEqual(["root", "nested"]);

    editor.destroy();
  });

  it("does not move a direct child belonging to a fixed surface signature", () => {
    const editor = makeEditor([block("fixed"), block("target")], "drag-fixed-test-surface");

    expect(
      canApplyMovementIntent(
        editor,
        nodePos(editor, "test_block", "fixed"),
        new InsertAfterTarget(blockTarget(editor, "target")),
      ),
    ).toBe(false);
    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "fixed"),
        new InsertAfterTarget(blockTarget(editor, "target")),
      ),
    ).toBe(false);
    expect(idsInDocument(editor)).toEqual(["fixed", "target"]);

    editor.destroy();
  });

  it("moves a block before a sibling in the same parent", () => {
    const editor = makeEditor([block("a"), block("b"), block("c")]);

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "c"),
        new InsertBeforeTarget(blockTarget(editor, "a")),
      ),
    ).toBe(true);

    expect(idsInDocument(editor)).toEqual(["c", "a", "b"]);
    editor.destroy();
  });

  it("preserves frame attrs when moving a resized block after a sibling", () => {
    const editor = makeEditor([resizedBlock("a"), block("b"), block("c")]);
    const frame = blockAttrs(editor, "a")["frame"];

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "a"),
        new InsertAfterTarget(blockTarget(editor, "c")),
      ),
    ).toBe(true);

    expect(idsInDocument(editor)).toEqual(["b", "c", "a"]);
    expect(blockAttrs(editor, "a")["frame"]).toEqual(frame);
    editor.destroy();
  });

  it("moves a block into a cell", () => {
    const editor = makeEditor([block("a"), grid([cell([block("b")]), cell([block("c")])])]);

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "a"),
        new InsertInsideTarget(movementTarget(editor, "cell")),
      ),
    ).toBe(true);

    expect(cellBlockIds(gridCells(editor)[0]!)).toEqual(["b", "a"]);
    expect(idsInDocument(editor)).toEqual(["b", "a", "c"]);
    editor.destroy();
  });

  it("rejects a fill block moved into a Layer that already has a fill occupant", () => {
    const editor = makeEditor([fillBlock("a"), grid([cell([fillBlock("b")]), cell([block("c")])])]);
    const sourcePos = nodePos(editor, FILL_TEST_BLOCK, "a");
    const intent = new InsertInsideTarget(movementTarget(editor, "cell"));
    const before = editor.getJSON();

    expect(canApplyMovementIntent(editor, sourcePos, intent)).toBe(false);
    expect(applyMovementIntent(editor, sourcePos, intent)).toBe(false);

    expect(editor.getJSON()).toEqual(before);
    expect(fillBlockIds(gridCells(editor)[0]!)).toEqual(["b"]);
    editor.destroy();
  });

  it("rejects a fill block moved beside a fill Layout in the same Layer", () => {
    const editor = makeEditor([fillBlock("a"), grid([cell([tabsLayout()])])]);
    const sourcePos = nodePos(editor, FILL_TEST_BLOCK, "a");
    const intent = new InsertAfterTarget(movementTarget(editor, "layout"));
    const before = editor.getJSON();

    expect(canApplyMovementIntent(editor, sourcePos, intent)).toBe(false);
    expect(applyMovementIntent(editor, sourcePos, intent)).toBe(false);

    expect(editor.getJSON()).toEqual(before);
    expect(compositionChildren(gridCells(editor)[0]).map((child) => child.type)).toEqual([
      "layout",
    ]);
    editor.destroy();
  });

  it("rejects moving a fill block below a fill tabs layout in an active bounded cell", () => {
    const editor = makeEditor([
      fillBlock("a"),
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [layer([grid([cell([tabsLayout()])])])],
      },
    ]);
    const sourcePos = nodePos(editor, FILL_TEST_BLOCK, "a");
    const intent = new InsertAfterTarget(movementTarget(editor, "layout"));

    expect(canApplyMovementIntent(editor, sourcePos, intent)).toBe(false);
    expect(applyMovementIntent(editor, sourcePos, intent)).toBe(false);
    editor.destroy();
  });

  it("keeps a bounded-layout registry defect observable", () => {
    const defect = new Error("movement layout registry programming defect");
    const layoutRegistry = {
      ...builtInLayoutRegistry,
      getForNode() {
        throw defect;
      },
    };
    const editor = makeEditor(
      [fillBlock("a"), region("target-region", [tabsLayout(), paragraph()])],
      "page-default",
      { layoutRegistry },
    );
    const sourcePos = nodePos(editor, FILL_TEST_BLOCK, "a");
    const intent = new InsertInsideTarget(movementTarget(editor, "region", "target-region"));
    let observed: unknown;

    try {
      canApplyMovementIntent(editor, sourcePos, intent);
    } catch (error) {
      observed = error;
    }

    expect(observed).toBe(defect);
    editor.destroy();
  });

  it("replaces an empty cell paragraph when moving a block into that cell", () => {
    const editor = makeEditor([block("a"), grid([cell([]), cell([block("b")])])]);

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "a"),
        new InsertInsideTarget(movementTarget(editor, "cell")),
      ),
    ).toBe(true);

    expect(compositionChildren(gridCells(editor)[0]).map((child) => child.type)).toEqual([
      "test_block",
    ]);
    expect(cellBlockIds(gridCells(editor)[0]!)).toEqual(["a"]);
    expect(idsInDocument(editor)).toEqual(["a", "b"]);
    editor.destroy();
  });

  it("moves a sole region child into an empty sibling region by swapping placeholders", () => {
    const editor = makeEditor([region("source-region", [block("a")]), region("target-region", [])]);
    const sourcePos = nodePos(editor, "test_block", "a");
    const intent = new InsertInsideTarget(movementTarget(editor, "region", "target-region"));

    expect(canApplyMovementIntent(editor, sourcePos, intent)).toBe(true);
    expect(applyMovementIntent(editor, sourcePos, intent)).toBe(true);

    expect(regionChildren(editor, "source-region").map((child) => child.type)).toEqual([
      "paragraph",
    ]);
    expect(regionChildren(editor, "target-region").map((child) => child.type)).toEqual([
      "test_block",
    ]);
    expect(idsInDocument(editor)).toEqual(["a"]);
    editor.destroy();
  });

  it("moves content into the destination owner's open Layer and preserves hidden siblings", () => {
    const editor = makeLayerMovementEditor();
    const sourcePos = nodePos(editor, "test_block", "block0000001");

    expect(
      applyMovementIntent(
        editor,
        sourcePos,
        new InsertInsideTarget(movementTarget(editor, "region", "region000002")),
      ),
    ).toBe(true);

    expect(nodePos(editor, "test_block", "block0000001")).toBeGreaterThan(sourcePos);
    expect(layerChildren(editor, "layer0000001").map((node) => node.type)).toEqual(["paragraph"]);
    expect(layerChildren(editor, "layer0000002").map((node) => node.attrs?.["id"])).toEqual([
      "block0000001",
    ]);
    expect(layerChildren(editor, "layer0000003").map((node) => node.attrs?.["id"])).toEqual([
      "block0000002",
    ]);
    editor.destroy();
  });

  it("refuses movement from an inactive Layer without dispatching a transaction", () => {
    const editor = makeLayerMovementEditor();
    const before = editor.getJSON();
    let transactions = 0;
    editor.on("transaction", () => {
      transactions += 1;
    });

    expect(
      canApplyMovementIntent(
        editor,
        nodePos(editor, "test_block", "block0000001"),
        new CreateGridBeforeBlock(blockTarget(editor, "block0000002")),
      ),
    ).toBe(false);
    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "block0000002"),
        new InsertInsideTarget(movementTarget(editor, "region", "region000001")),
      ),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    expect(transactions).toBe(0);
    editor.destroy();
  });

  it("applies a side move through the Layer guard and preserves the hidden alternative", () => {
    const editor = makeLayerMovementEditor({
      content: [
        layeredRegion("region000001", [
          {
            type: "layer",
            attrs: { id: "layer0000001" },
            content: [block("block0000001"), block("block0000002")],
          },
          {
            type: "layer",
            attrs: { id: "layer0000002" },
            content: [block("block0000003")],
          },
        ]),
      ],
    });
    let transactions = 0;
    editor.on("transaction", () => {
      transactions += 1;
    });

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "block0000001"),
        new CreateGridBeforeBlock(blockTarget(editor, "block0000002")),
      ),
    ).toBe(true);
    expect(transactions).toBe(1);
    expect(layerChildren(editor, "layer0000001").map((node) => node.type)).toEqual(["grid"]);
    expect(layerChildren(editor, "layer0000002").map((node) => node.attrs?.["id"])).toEqual([
      "block0000003",
    ]);
    expect(idsInDocument(editor)).toEqual(["block0000001", "block0000002", "block0000003"]);
    editor.destroy();
  });

  it("refuses a side move into an inactive Layer before dispatch", () => {
    const editor = makeLayerMovementEditor({
      content: [
        layeredRegion("region000001", [
          {
            type: "layer",
            attrs: { id: "layer0000001" },
            content: [block("block0000001")],
          },
          {
            type: "layer",
            attrs: { id: "layer0000002" },
            content: [block("block0000002")],
          },
        ]),
      ],
    });
    const before = editor.getJSON();
    let transactions = 0;
    editor.on("transaction", () => {
      transactions += 1;
    });

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "block0000001"),
        new CreateGridBeforeBlock(blockTarget(editor, "block0000002")),
      ),
    ).toBe(false);
    expect(transactions).toBe(0);
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("refuses a stale side destination without dispatching the move", () => {
    const editor = makeLayerMovementEditor({
      content: [
        layeredRegion("region000001", [
          {
            type: "layer",
            attrs: { id: "layer0000001" },
            content: [block("block0000001"), block("block0000002")],
          },
        ]),
      ],
    });
    const staleTarget = blockTarget(editor, "block0000002");
    const targetPos = nodePos(editor, "test_block", "block0000002");
    const target = editor.state.doc.nodeAt(targetPos);
    if (!target) throw new Error("Missing movement target.");
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(targetPos, undefined, { ...target.attrs, changed: true }),
    );
    const before = editor.getJSON();
    let transactions = 0;
    editor.on("transaction", () => {
      transactions += 1;
    });

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "block0000001"),
        new CreateGridBeforeBlock(staleTarget),
      ),
    ).toBe(false);
    expect(transactions).toBe(0);
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("keeps missing Layer authoring authority observable during destination validation", () => {
    const editor = makeLayerMovementEditor({
      includeLifecycle: false,
      content: [
        block("block0000001"),
        layeredRegion("region000001", [
          {
            type: "layer",
            attrs: { id: "layer0000001" },
            content: [block("block0000002")],
          },
        ]),
      ],
    });

    expect(() =>
      canApplyMovementIntent(
        editor,
        nodePos(editor, "test_block", "block0000001"),
        new CreateGridBeforeBlock(blockTarget(editor, "block0000002")),
      ),
    ).toThrow("Layer-aware movement requires the document authoring lifecycle.");
    editor.destroy();
  });

  it("reports false when a later transaction filter refuses an otherwise valid move", () => {
    const editor = makeLayerMovementEditor({ rejectDocumentChanges: true });
    const before = editor.getJSON();
    const intent = new InsertInsideTarget(movementTarget(editor, "region", "region000002"));

    expect(
      canApplyMovementIntent(editor, nodePos(editor, "test_block", "block0000001"), intent),
    ).toBe(true);
    expect(applyMovementIntent(editor, nodePos(editor, "test_block", "block0000001"), intent)).toBe(
      false,
    );
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("moves a sole region child into the active section of a tabs-shaped layout", () => {
    const editor = makeEditor([
      region("source-region", [block("a")]),
      region("tabs-region", [tabsLayout()]),
    ]);
    const sourcePos = nodePos(editor, "test_block", "a");
    const intent = new InsertInsideTarget(movementTarget(editor, "section"));

    expect(canApplyMovementIntent(editor, sourcePos, intent)).toBe(true);
    expect(applyMovementIntent(editor, sourcePos, intent)).toBe(true);

    expect(regionChildren(editor, "source-region").map((child) => child.type)).toEqual([
      "paragraph",
    ]);
    expect(
      compositionChildren(regionChildren(editor, "tabs-region")[0]?.content?.[0]).map(
        (child) => child.type,
      ),
    ).toEqual(["test_block"]);
    expect(idsInDocument(editor)).toEqual(["a"]);
    editor.destroy();
  });

  it("preserves frame attrs when moving a resized block into an empty cell", () => {
    const editor = makeEditor([resizedBlock("a"), grid([cell([]), cell([block("b")])])]);
    const frame = blockAttrs(editor, "a")["frame"];

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "a"),
        new InsertInsideTarget(movementTarget(editor, "cell")),
      ),
    ).toBe(true);

    expect(compositionChildren(gridCells(editor)[0]).map((child) => child.type)).toEqual([
      "test_block",
    ]);
    expect(blockAttrs(editor, "a")["frame"]).toEqual(frame);
    editor.destroy();
  });

  it("moves a block out of a grid cell into the surface as a new row", () => {
    const editor = makeEditor([grid([cell([block("a")]), cell([])]), block("b")]);

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "a"),
        new InsertInsideTarget(movementTarget(editor, "surface")),
      ),
    ).toBe(true);

    expect(surfaceChildren(editor).map((child) => child.type)).toEqual([
      "grid",
      "test_block",
      "test_block",
    ]);
    expect(gridCells(editor).map(cellBlockIds)).toEqual([[], []]);
    expect(idsInDocument(editor)).toEqual(["b", "a"]);
    editor.destroy();
  });

  it("moves a block before a grid as a new row", () => {
    const editor = makeEditor([block("a"), grid([cell([block("b")]), cell([])])]);

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "b"),
        new InsertBeforeTarget(movementTarget(editor, "grid")),
      ),
    ).toBe(true);

    expect(surfaceChildren(editor).map((child) => child.type)).toEqual([
      "test_block",
      "test_block",
      "grid",
    ]);
    expect(gridCells(editor).map(cellBlockIds)).toEqual([[], []]);
    expect(idsInDocument(editor)).toEqual(["a", "b"]);
    editor.destroy();
  });

  it("moves a block into a section", () => {
    const editor = makeEditor([block("a"), layout([block("b")])]);

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "a"),
        new InsertInsideTarget(movementTarget(editor, "section")),
      ),
    ).toBe(true);

    expect(idsInDocument(editor)).toEqual(["b", "a"]);
    editor.destroy();
  });

  it("moves a layout into a cell", () => {
    const editor = makeEditor([layout([block("a")]), grid([cell([]), cell([block("c")])])]);

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "layout"),
        new InsertInsideTarget(movementTarget(editor, "cell")),
      ),
    ).toBe(true);

    expect(compositionChildren(gridCells(editor)[0]).map((child) => child.type)).toEqual([
      "layout",
    ]);
    expect(idsInDocument(editor)).toEqual(["a", "c"]);
    editor.destroy();
  });

  it("rejects a grid moved into a cell", () => {
    const editor = makeEditor([grid([cell([block("a")])]), grid([cell([block("b")])])]);
    const before = editor.getJSON();

    expect(
      canApplyMovementIntent(
        editor,
        nodePos(editor, "grid"),
        new InsertInsideTarget(movementTarget(editor, "cell")),
      ),
    ).toBe(false);
    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "grid"),
        new InsertInsideTarget(movementTarget(editor, "cell")),
      ),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("rejects grid and cell as active drag movement sources", () => {
    const editor = makeEditor([
      block("a"),
      grid([cell([block("b")]), cell([block("c")])]),
      block("d"),
    ]);
    const before = editor.getJSON();

    expect(
      canApplyMovementIntent(
        editor,
        nodePos(editor, "grid"),
        new InsertAfterTarget(blockTarget(editor, "d")),
      ),
    ).toBe(false);
    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "cell"),
        new InsertBeforeTarget(blockTarget(editor, "a")),
      ),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("rejects arrangements moved into sections", () => {
    const editor = makeEditor([grid([cell([block("a")])]), layout([block("b")])]);
    const before = editor.getJSON();

    expect(
      canApplyMovementIntent(
        editor,
        nodePos(editor, "grid"),
        new InsertInsideTarget(movementTarget(editor, "section")),
      ),
    ).toBe(false);
    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "layout"),
        new InsertInsideTarget(movementTarget(editor, "section")),
      ),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("allows section reorder only within the owning layout", () => {
    const editor = makeEditor([layout([block("a"), block("b")]), layout([block("c")])]);
    const [sourceSectionPos, targetSectionPos] = nodePositions(editor, "section");
    if (sourceSectionPos === undefined || targetSectionPos === undefined) {
      throw new Error("Expected two sections");
    }

    expect(
      canApplyMovementIntent(
        editor,
        sourceSectionPos,
        new InsertAfterTarget(movementTargetAtPos(editor, targetSectionPos)),
      ),
    ).toBe(false);
    expect(
      applyMovementIntent(
        editor,
        sourceSectionPos,
        new InsertAfterTarget(movementTargetAtPos(editor, targetSectionPos)),
      ),
    ).toBe(false);

    expect(idsInDocument(editor)).toEqual(["a", "b", "c"]);
    editor.destroy();
  });

  it("creates a grid when dragging a block beside a sibling block", () => {
    const editor = makeEditor([block("a"), block("b"), block("c")]);

    expect(surfaceChildren(editor).map((child) => child.type)).toEqual([
      "test_block",
      "test_block",
      "test_block",
    ]);

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "a"),
        new CreateGridBeforeBlock(blockTarget(editor, "b")),
      ),
    ).toBe(true);

    expect(surfaceChildren(editor).map((child) => child.type)).toEqual(["grid", "test_block"]);
    expect(surfaceChildren(editor)[0]?.attrs).toMatchObject({
      columnWidths: [1, 1],
    });
    expect(gridCells(editor).map((cellNode) => cellNode.attrs?.["id"])).toEqual([
      expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/),
      expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/),
    ]);
    expect(gridCells(editor).map(cellBlockIds)).toEqual([["a"], ["b"]]);
    expect(idsInDocument(editor)).toEqual(["a", "b", "c"]);
    expect(nodeTypesInJson(editor.getJSON())).not.toContain("row");
    editor.destroy();
  });

  it("inserts a new cell when dragging beside a block inside an existing grid", () => {
    const editor = makeEditor([
      block("a"),
      {
        type: "grid",
        attrs: { columnWidths: [1, 1] },
        content: [cell([block("b")]), cell([block("c")])],
      },
    ]);

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "a"),
        new CreateGridAfterBlock(blockTarget(editor, "b")),
      ),
    ).toBe(true);

    expect(gridCells(editor).map(cellBlockIds)).toEqual([["b"], ["a"], ["c"]]);
    expect(surfaceChildren(editor)[0]?.attrs).toMatchObject({
      columnWidths: [1, 1, 1],
    });
    expect(idsInDocument(editor)).toEqual(["b", "a", "c"]);
    editor.destroy();
  });

  it("inserts a new cell when dragging beside an existing cell edge", () => {
    const editor = makeEditor([
      block("a"),
      {
        type: "grid",
        attrs: { columnWidths: [1, 1] },
        content: [cell([]), cell([block("b")])],
      },
    ]);

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "a"),
        new AddCellAfterTarget(cellTarget(editor)),
      ),
    ).toBe(true);

    expect(surfaceChildren(editor).filter((child) => child.type === "grid")).toHaveLength(1);
    expect(gridCells(editor).map(cellBlockIds)).toEqual([[], ["a"], ["b"]]);
    expect(surfaceChildren(editor)[0]?.attrs).toMatchObject({
      columnWidths: [1, 1, 1],
    });
    expect(idsInDocument(editor)).toEqual(["a", "b"]);
    editor.destroy();
  });

  it("inserts a new cell when dragging into the grid end gutter", () => {
    const editor = makeEditor([
      block("a"),
      {
        type: "grid",
        attrs: { columnWidths: [1, 1] },
        content: [cell([block("b")]), cell([])],
      },
    ]);

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "test_block", "a"),
        new AddCellAtGridEnd(gridTarget(editor)),
      ),
    ).toBe(true);

    expect(surfaceChildren(editor).filter((child) => child.type === "grid")).toHaveLength(1);
    expect(gridCells(editor).map(cellBlockIds)).toEqual([["b"], [], ["a"]]);
    expect(surfaceChildren(editor)[0]?.attrs).toMatchObject({
      columnWidths: [1, 1, 1],
    });
    expect(idsInDocument(editor)).toEqual(["b", "a"]);
    editor.destroy();
  });
});
