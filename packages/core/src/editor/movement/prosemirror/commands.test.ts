// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import { defineBlock } from "@/editor/blocks/block-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { pageDefaultSurfaceDefinition } from "@/editor/surfaces/model/templates/page-default";
import type { SurfaceVariantDefinition } from "@/editor/surfaces/model/surface-variant-definition";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import { RegionAuthoringNode } from "@/editor/surfaces/authoring/nodes/region-authoring-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

import {
  applyKeyboardContainedMovementIntent,
  applyKeyboardMovementIntent as applyKeyboardMovementIntentWithLookup,
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
  defineBlock({ nodeType: "test_block" }),
  defineBlock({ nodeType: FILL_TEST_BLOCK, boundedPlacement: "fill" }),
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

const applyKeyboardMovementIntent = (
  editor: Parameters<typeof applyKeyboardMovementIntentWithLookup>[0],
  sourcePos: Parameters<typeof applyKeyboardMovementIntentWithLookup>[1],
  direction: Parameters<typeof applyKeyboardMovementIntentWithLookup>[2],
) =>
  applyKeyboardMovementIntentWithLookup(
    editor,
    sourcePos,
    direction,
    testBlockRegistry,
    testSurfaceVariants,
  );

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

const TestContainedChoiceNode = Node.create({
  name: "selectable_choice",
  content: "paragraph+",
  defining: true,
  isolating: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-choice-id"),
        renderHTML: (attrs: { id?: unknown }) =>
          typeof attrs.id === "string" ? { "data-choice-id": attrs.id } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-test-contained-choice]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-test-contained-choice": "" }, 0];
  },
});

const TestContainedChoicesGroupNode = Node.create({
  name: "assessment_choices_group",
  group: "block",
  content: "selectable_choice+",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-test-contained-choices]" }];
  },

  renderHTML() {
    return ["div", { "data-test-contained-choices": "" }, 0];
  },
});

function block(id: string, attrs: Record<string, unknown> = {}): JSONContent {
  return { type: "test_block", attrs: { id, ...attrs } };
}

function fillBlock(id: string): JSONContent {
  return { type: FILL_TEST_BLOCK, attrs: { id } };
}

function containedChoice(id: string): JSONContent {
  return {
    type: "selectable_choice",
    attrs: { id },
    content: [paragraph()],
  };
}

function containedChoices(ids: string[]): JSONContent {
  return {
    type: "assessment_choices_group",
    content: ids.map(containedChoice),
  };
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

function section(content: JSONContent[]): JSONContent {
  return { type: "section", content: content.length ? content : [paragraph()] };
}

function layout(content: JSONContent[] = [section([block("nested")])]): JSONContent {
  return { type: "layout", content: [section(content)] };
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
    content: content.length ? content : [paragraph()],
  };
}

function cell(content: JSONContent[]): JSONContent {
  return { type: "cell", content: content.length ? content : [paragraph()] };
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
            attrs: { id: "surface-1", variant: surfaceVariant },
            content,
          },
        ],
      },
    ],
  };
}

function makeEditor(content: JSONContent[], surfaceVariant = "page-default") {
  return new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      CourseDocumentNode,
      SurfaceNode,
      RegionAuthoringNode,
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      TestBlockNode,
      FillTestBlockNode,
      TestContainedChoicesGroupNode,
      TestContainedChoiceNode,
    ],
    content: courseDocument(content, surfaceVariant),
  });
}

function nodePos(editor: Editor, type: string, id?: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== type) return true;
    if (id !== undefined && node.attrs["id"] !== id) return true;
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
      ids.push(node.attrs["id"]);
    }
    return true;
  });

  return ids;
}

function containedChoiceIds(editor: Editor): string[] {
  const ids: string[] = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name === "selectable_choice" && typeof node.attrs["id"] === "string") {
      ids.push(node.attrs["id"]);
    }
    return true;
  });

  return ids;
}

function blockAttrs(editor: Editor, id: string): Record<string, unknown> {
  let attrs: Record<string, unknown> | null = null;

  editor.state.doc.descendants((node) => {
    if (attrs) return false;
    if (node.type.name !== "test_block" || node.attrs["id"] !== id) return true;
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
  return (
    surfaceChildren(editor).find((child) => child.type === "region" && child.attrs?.["id"] === id)
      ?.content ?? []
  );
}

function gridCells(editor: Editor): JSONContent[] {
  const gridNode = surfaceChildren(editor).find((child) => child.type === "grid");
  return gridNode?.content ?? [];
}

function cellBlockIds(cellNode: JSONContent): string[] {
  return (cellNode.content ?? [])
    .filter((child) => child.type === "test_block")
    .map((child) => child.attrs?.["id"])
    .filter((id): id is string => typeof id === "string");
}

function fillBlockIds(cellNode: JSONContent): string[] {
  return (cellNode.content ?? [])
    .filter((child) => child.type === FILL_TEST_BLOCK)
    .map((child) => child.attrs?.["id"])
    .filter((id): id is string => typeof id === "string");
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
  it("moves a block between adjacent siblings through the keyboard command", () => {
    const editor = makeEditor([block("a"), block("b"), block("c")]);

    expect(
      applyKeyboardMovementIntent(editor, nodePos(editor, "test_block", "b"), "backward"),
    ).toEqual({
      moved: true,
      status: "Moved block up.",
    });
    expect(idsInDocument(editor)).toEqual(["b", "a", "c"]);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.from).toBe(nodePos(editor, "test_block", "b"));

    expect(
      applyKeyboardMovementIntent(editor, nodePos(editor, "test_block", "b"), "forward"),
    ).toEqual({
      moved: true,
      status: "Moved block down.",
    });
    expect(idsInDocument(editor)).toEqual(["a", "b", "c"]);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.from).toBe(nodePos(editor, "test_block", "b"));

    editor.destroy();
  });

  it("reports keyboard movement boundaries without mutating the document", () => {
    const editor = makeEditor([block("a"), block("b")]);

    expect(
      applyKeyboardMovementIntent(editor, nodePos(editor, "test_block", "a"), "backward"),
    ).toEqual({
      moved: false,
      status: "Block is already first.",
    });
    expect(idsInDocument(editor)).toEqual(["a", "b"]);

    expect(
      applyKeyboardMovementIntent(editor, nodePos(editor, "test_block", "b"), "forward"),
    ).toEqual({
      moved: false,
      status: "Block is already last.",
    });
    expect(idsInDocument(editor)).toEqual(["a", "b"]);

    editor.destroy();
  });

  it("moves a contained choice between adjacent siblings through the keyboard command", () => {
    const editor = makeEditor([containedChoices(["a", "b", "c"])]);

    expect(
      applyKeyboardContainedMovementIntent(
        editor,
        nodePos(editor, "selectable_choice", "b"),
        "backward",
      ),
    ).toEqual({
      moved: true,
      status: "Moved choice up.",
    });
    expect(containedChoiceIds(editor)).toEqual(["b", "a", "c"]);

    expect(
      applyKeyboardContainedMovementIntent(
        editor,
        nodePos(editor, "selectable_choice", "b"),
        "forward",
      ),
    ).toEqual({
      moved: true,
      status: "Moved choice down.",
    });
    expect(containedChoiceIds(editor)).toEqual(["a", "b", "c"]);

    editor.destroy();
  });

  it("reports contained keyboard movement boundaries without mutating the group", () => {
    const editor = makeEditor([containedChoices(["a", "b"])]);

    expect(
      applyKeyboardContainedMovementIntent(
        editor,
        nodePos(editor, "selectable_choice", "a"),
        "backward",
      ),
    ).toEqual({
      moved: false,
      status: "Choice is already first.",
    });
    expect(containedChoiceIds(editor)).toEqual(["a", "b"]);

    expect(
      applyKeyboardContainedMovementIntent(
        editor,
        nodePos(editor, "selectable_choice", "b"),
        "forward",
      ),
    ).toEqual({
      moved: false,
      status: "Choice is already last.",
    });
    expect(containedChoiceIds(editor)).toEqual(["a", "b"]);

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

  it("moves a fill block into a page-flow cell that already contains a fill block", () => {
    const editor = makeEditor([fillBlock("a"), grid([cell([fillBlock("b")]), cell([block("c")])])]);
    const sourcePos = nodePos(editor, FILL_TEST_BLOCK, "a");
    const intent = new InsertInsideTarget(movementTarget(editor, "cell"));

    expect(canApplyMovementIntent(editor, sourcePos, intent)).toBe(true);
    expect(applyMovementIntent(editor, sourcePos, intent)).toBe(true);

    expect(fillBlockIds(gridCells(editor)[0]!)).toEqual(["b", "a"]);
    editor.destroy();
  });

  it("moves a fill block below a fill tabs layout in a page-flow cell", () => {
    const editor = makeEditor([fillBlock("a"), grid([cell([tabsLayout()])])]);
    const sourcePos = nodePos(editor, FILL_TEST_BLOCK, "a");
    const intent = new InsertAfterTarget(movementTarget(editor, "layout"));

    expect(canApplyMovementIntent(editor, sourcePos, intent)).toBe(true);
    expect(applyMovementIntent(editor, sourcePos, intent)).toBe(true);

    expect(gridCells(editor)[0]?.content?.map((child) => child.type)).toEqual([
      "layout",
      FILL_TEST_BLOCK,
    ]);
    editor.destroy();
  });

  it("rejects moving a fill block below a fill tabs layout in an active bounded cell", () => {
    const editor = makeEditor([
      fillBlock("a"),
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [grid([cell([tabsLayout()])])],
      },
    ]);
    const sourcePos = nodePos(editor, FILL_TEST_BLOCK, "a");
    const intent = new InsertAfterTarget(movementTarget(editor, "layout"));

    expect(canApplyMovementIntent(editor, sourcePos, intent)).toBe(false);
    expect(applyMovementIntent(editor, sourcePos, intent)).toBe(false);
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

    expect(gridCells(editor)[0]?.content?.map((child) => child.type)).toEqual(["test_block"]);
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
      regionChildren(editor, "tabs-region")[0]?.content?.[0]?.content?.map((child) => child.type),
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

    expect(gridCells(editor)[0]?.content?.map((child) => child.type)).toEqual(["test_block"]);
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
    const editor = makeEditor([
      layout([block("a")]),
      grid([cell([block("b")]), cell([block("c")])]),
    ]);

    expect(
      applyMovementIntent(
        editor,
        nodePos(editor, "layout"),
        new InsertInsideTarget(movementTarget(editor, "cell")),
      ),
    ).toBe(true);

    expect(gridCells(editor)[0]?.content?.map((child) => child.type)).toEqual([
      "test_block",
      "layout",
    ]);
    expect(idsInDocument(editor)).toEqual(["b", "a", "c"]);
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
