// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";

import {
  InteractionActivationIntentKind,
  InteractionChromeSlotReason,
  InteractionOwnerSource,
  InteractionSelectionMode,
  InteractionTargetKind,
  createInteractionActivationIntent,
  sameInteractionTarget,
  type InteractionEngineInput,
  type InteractionTargetRef,
} from "../../model/interaction-owner-state";
import { resolveInteractionOwnerSnapshot } from "../../engine/interaction-owner-engine";
import {
  projectInteractionEngineInput as projectInteractionEngineInputWithLookup,
  type ProjectInteractionEngineInputOptions,
} from "./interaction-engine-input-projection";

const BLOCK = "v2_engine_input_block";
const RESIZABLE_BLOCK = "v2_engine_input_resizable_block";
const DELEGATE_PARENT = "v2_engine_input_delegate_parent";
const EMBEDDED_CHILD = "v2_engine_input_embedded_child";
const FIELD = "v2_engine_input_field";

const blockDefinition = defineBlock({
  nodeType: BLOCK,
});

const resizableBlockDefinition = defineBlock({
  nodeType: RESIZABLE_BLOCK,
  frame: { resizable: true, resizeMode: "responsive" },
});

const delegateParentDefinition = defineBlock({
  nodeType: DELEGATE_PARENT,
  interaction: {
    embeddedChildSelection: "delegate-to-parent",
  },
});

const embeddedChildDefinition = defineBlock({
  nodeType: EMBEDDED_CHILD,
});

const testBlockRegistry = createBlockRegistry([
  blockDefinition,
  resizableBlockDefinition,
  delegateParentDefinition,
  embeddedChildDefinition,
]);

function projectInteractionEngineInput(
  state: Parameters<typeof projectInteractionEngineInputWithLookup>[0],
  options: Omit<ProjectInteractionEngineInputOptions, "blockDefinitions"> = {},
) {
  return projectInteractionEngineInputWithLookup(state, {
    ...options,
    blockDefinitions: testBlockRegistry,
  });
}

const TestFieldNode = Node.create({
  name: FIELD,
  content: "paragraph+",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-v2-engine-input-field]" }];
  },

  renderHTML() {
    return ["div", { "data-v2-engine-input-field": "" }, 0];
  },
});

const TestBlockNode = courseBlockNode(BLOCK, "data-v2-engine-input-block");
const TestResizableBlockNode = courseBlockNode(
  RESIZABLE_BLOCK,
  "data-v2-engine-input-resizable-block",
);
const TestDelegateParentNode = courseBlockNode(
  DELEGATE_PARENT,
  "data-v2-engine-input-delegate-parent",
  EMBEDDED_CHILD,
);
const TestEmbeddedChildNode = courseBlockNode(
  EMBEDDED_CHILD,
  "data-v2-engine-input-embedded-child",
);

const TestGridNode = structuralNode("grid", "cell+");
const TestCellNode = structuralNode("cell", "block+");
const TestLayoutNode = structuralNode("layout", "section+");
const TestSectionNode = structuralNode("section", "block+");

function courseBlockNode(name: string, marker: string, content = FIELD) {
  return Node.create({
    name,
    content,
    defining: true,
    group: "block",
    isolating: true,
    selectable: true,

    addAttributes() {
      return {
        id: {
          default: null,
        },
      };
    },

    parseHTML() {
      return [{ tag: `section[${marker}]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["section", { ...HTMLAttributes, [marker]: "" }, 0];
    },
  });
}

function structuralNode(name: string, content: string) {
  return Node.create({
    name,
    content,
    defining: true,
    group: "block",

    addAttributes() {
      return {
        id: {
          default: null,
        },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-v2-engine-input-${name}]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [`div`, { ...HTMLAttributes, [`data-v2-engine-input-${name}`]: "" }, 0];
    },
  });
}

function makeEditor(content?: JSONContent) {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestFieldNode,
      TestBlockNode,
      TestResizableBlockNode,
      TestDelegateParentNode,
      TestEmbeddedChildNode,
      TestGridNode,
      TestCellNode,
      TestLayoutNode,
      TestSectionNode,
    ],
    content: content ?? {
      type: "doc",
      content: [
        grid("grid-a", [
          cell("cell-a", [
            block("block-a", "Caret text"),
            resizableBlock("resizable-a", "Resizable text"),
          ]),
        ]),
        delegateParent("parent-a", embeddedChild("child-a", "Child text")),
      ],
    },
  });
}

function block(id: string, text: string): JSONContent {
  return {
    type: BLOCK,
    attrs: { id },
    content: [field(text)],
  };
}

function resizableBlock(id: string, text: string): JSONContent {
  return {
    type: RESIZABLE_BLOCK,
    attrs: { id },
    content: [field(text)],
  };
}

function delegateParent(id: string, child: JSONContent): JSONContent {
  return {
    type: DELEGATE_PARENT,
    attrs: { id },
    content: [child],
  };
}

function embeddedChild(id: string, text: string): JSONContent {
  return {
    type: EMBEDDED_CHILD,
    attrs: { id },
    content: [field(text)],
  };
}

function field(text: string): JSONContent {
  return {
    type: FIELD,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

function grid(id: string, cells: JSONContent[]): JSONContent {
  return {
    type: "grid",
    attrs: { id },
    content: cells,
  };
}

function cell(id: string, content: JSONContent[]): JSONContent {
  return {
    type: "cell",
    attrs: { id },
    content,
  };
}

function layout(id: string, sections: JSONContent[]): JSONContent {
  return {
    type: "layout",
    attrs: { id },
    content: sections,
  };
}

function section(id: string, content: JSONContent[]): JSONContent {
  return {
    type: "section",
    attrs: { id },
    content,
  };
}

function nodePos(editor: Editor, type: string, id: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === type && node.attrs["id"] === id) {
      found = pos;
      return false;
    }
    return true;
  });

  if (found === null) throw new Error(`Node not found: ${type}:${id}`);
  return found;
}

function textPos(editor: Editor, text: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (!node.isText) return true;

    const index = node.text?.indexOf(text) ?? -1;
    if (index === -1) return true;

    found = pos + index;
    return false;
  });

  if (found === null) throw new Error(`Text not found: ${text}`);
  return found;
}

function ref(kind: InteractionTargetKind, id: string, pos: number): InteractionTargetRef {
  return { id, kind, pos };
}

function matchingPolicyCount(input: InteractionEngineInput, target: InteractionTargetRef): number {
  return input.targetPolicies.filter((policy) => sameInteractionTarget(policy.target, target))
    .length;
}

describe("projectInteractionEngineInput", () => {
  it("projects a caret inside a regular block into a live owner snapshot", () => {
    const editor = makeEditor();
    const blockRef = ref(InteractionTargetKind.Block, "block-a", nodePos(editor, BLOCK, "block-a"));

    editor.commands.setTextSelection(textPos(editor, "Caret") + 2);

    const input = projectInteractionEngineInput(editor.state);
    const snapshot = resolveInteractionOwnerSnapshot(input);

    expect(input.selection).toEqual({
      mode: InteractionSelectionMode.TextCaret,
      objectSelectedTarget: null,
      range: {
        empty: true,
        from: textPos(editor, "Caret") + 2,
        to: textPos(editor, "Caret") + 2,
      },
    });
    expect(snapshot.owners.selectionOwner).toEqual({
      source: InteractionOwnerSource.Selection,
      target: blockRef,
    });
    expect(snapshot.chromeSlots.blockBubble.visible).toBe(true);
    expect(matchingPolicyCount(input, blockRef)).toBe(1);

    editor.destroy();
  });

  it("projects inactive authoring sessions without showing caret-owned block chrome", () => {
    const editor = makeEditor();

    editor.commands.setTextSelection(textPos(editor, "Caret") + 2);

    const input = projectInteractionEngineInput(editor.state, {
      authoringChromeSessionActive: false,
    });
    const snapshot = resolveInteractionOwnerSnapshot(input);

    expect(snapshot.owners.selectionOwner.target).toMatchObject({
      id: "block-a",
      kind: InteractionTargetKind.Block,
    });
    expect(snapshot.chromeSlots.blockBubble).toMatchObject({
      reason: InteractionChromeSlotReason.InactiveAuthoringSession,
      visible: false,
    });

    editor.destroy();
  });

  it("lets a explicit structural owner suppress fallback block chrome", () => {
    const editor = makeEditor();
    const gridRef = ref(InteractionTargetKind.Grid, "grid-a", nodePos(editor, "grid", "grid-a"));

    editor.commands.setTextSelection(textPos(editor, "Caret") + 2);

    const input = projectInteractionEngineInput(editor.state, {
      explicitOwner: gridRef,
    });
    const snapshot = resolveInteractionOwnerSnapshot(input);

    expect(snapshot.owners.effectiveOwner).toEqual({
      source: InteractionOwnerSource.Explicit,
      target: gridRef,
    });
    expect(snapshot.chromeSlots.blockBubble).toMatchObject({
      reason: InteractionChromeSlotReason.SuppressedByExplicitOwner,
      visible: false,
    });
  });

  it("keeps managed child object selection raw while projecting parent owner", () => {
    const editor = makeEditor();
    const childRef = ref(
      InteractionTargetKind.Block,
      "child-a",
      nodePos(editor, EMBEDDED_CHILD, "child-a"),
    );
    const parentRef = ref(
      InteractionTargetKind.Block,
      "parent-a",
      nodePos(editor, DELEGATE_PARENT, "parent-a"),
    );

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, childRef.pos!)),
    );

    const input = projectInteractionEngineInput(editor.state);
    const snapshot = resolveInteractionOwnerSnapshot(input);

    expect(snapshot.selection).toMatchObject({
      mode: InteractionSelectionMode.NodeSelection,
      objectSelectedTarget: childRef,
    });
    expect(snapshot.owners.selectionOwner).toEqual({
      source: InteractionOwnerSource.Selection,
      target: parentRef,
    });
    expect(matchingPolicyCount(input, childRef)).toBe(1);
    expect(matchingPolicyCount(input, parentRef)).toBe(1);
  });

  it("dedupes policies and drops unstable explicit owner options", () => {
    const editor = makeEditor();
    const blockRef = ref(InteractionTargetKind.Block, "block-a", nodePos(editor, BLOCK, "block-a"));

    editor.commands.setTextSelection(textPos(editor, "Caret") + 2);

    const input = projectInteractionEngineInput(editor.state, {
      explicitOwner: blockRef,
      menuOwner: { kind: InteractionTargetKind.Grid },
      settingsOwner: { kind: InteractionTargetKind.Layout },
    });

    expect(input.explicitOwner).toEqual(blockRef);
    expect(input.menuOwner).toBeNull();
    expect(input.settingsOwner).toBeNull();
    expect(matchingPolicyCount(input, blockRef)).toBe(1);
  });

  it("projects a live context owner that beats stale selection for chrome", () => {
    const editor = makeEditor();
    const parentRef = ref(
      InteractionTargetKind.Block,
      "parent-a",
      nodePos(editor, DELEGATE_PARENT, "parent-a"),
    );
    const staleBlockRef = ref(
      InteractionTargetKind.Block,
      "block-a",
      nodePos(editor, BLOCK, "block-a"),
    );

    editor.commands.setTextSelection(textPos(editor, "Caret") + 2);

    const input = projectInteractionEngineInput(editor.state, {
      contextOwner: parentRef,
    });
    const snapshot = resolveInteractionOwnerSnapshot(input);

    expect(input.contextOwner).toEqual(parentRef);
    expect(matchingPolicyCount(input, parentRef)).toBe(1);
    expect(snapshot.owners.contextOwner).toEqual({
      source: InteractionOwnerSource.Context,
      target: parentRef,
    });
    expect(snapshot.owners.effectiveOwner).toEqual({
      source: InteractionOwnerSource.Context,
      target: parentRef,
    });
    expect(snapshot.owners.selectionOwner.target).toEqual(staleBlockRef);
    expect(snapshot.chromeSlots.blockBubble).toMatchObject({
      target: parentRef,
      visible: true,
    });

    editor.destroy();
  });

  it("projects context owners from the live context owner before stale selection", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        layout("layout-a", [
          section("tab-a", [block("block-a", "Stale tab text")]),
          section("tab-b", [block("block-b", "Live tab text")]),
        ]),
      ],
    });
    const liveRef = ref(InteractionTargetKind.Block, "block-b", nodePos(editor, BLOCK, "block-b"));

    editor.commands.setTextSelection(textPos(editor, "Stale tab text") + 2);

    const input = projectInteractionEngineInput(editor.state, {
      contextOwner: liveRef,
    });
    const snapshot = resolveInteractionOwnerSnapshot(input);

    expect(snapshot.owners.contextOwner.target).toEqual(liveRef);
    expect(snapshot.owners.contextOwners.layout).toMatchObject({
      id: "layout-a",
      kind: InteractionTargetKind.Layout,
    });
    expect(snapshot.owners.contextOwners.section).toMatchObject({
      id: "tab-b",
      kind: InteractionTargetKind.Section,
    });
    expect(snapshot.owners.contextOwners.section?.id).not.toBe("tab-a");

    editor.destroy();
  });

  it("projects registry resize policy for a live block context owner", () => {
    const editor = makeEditor();
    const resizableRef = ref(
      InteractionTargetKind.Block,
      "resizable-a",
      nodePos(editor, RESIZABLE_BLOCK, "resizable-a"),
    );

    editor.commands.setTextSelection(textPos(editor, "Caret") + 2);

    const input = projectInteractionEngineInput(editor.state, {
      contextOwner: resizableRef,
    });
    const snapshot = resolveInteractionOwnerSnapshot(input);

    expect(matchingPolicyCount(input, resizableRef)).toBe(1);
    expect(snapshot.chromeSlots.resizeHandles).toMatchObject({
      target: resizableRef,
      visible: true,
    });

    editor.destroy();
  });

  it("drops unstable context owner options", () => {
    const editor = makeEditor();

    editor.commands.setTextSelection(textPos(editor, "Caret") + 2);

    const input = projectInteractionEngineInput(editor.state, {
      contextOwner: { kind: InteractionTargetKind.Block },
    });

    expect(input.contextOwner).toBeNull();

    editor.destroy();
  });

  it("drops context owner options that do not resolve in the live document", () => {
    const editor = makeEditor();

    editor.commands.setTextSelection(textPos(editor, "Caret") + 2);

    const missingBlock = projectInteractionEngineInput(editor.state, {
      contextOwner: { id: "missing-block", kind: InteractionTargetKind.Block },
    });
    const missingGrid = projectInteractionEngineInput(editor.state, {
      contextOwner: { id: "missing-grid", kind: InteractionTargetKind.Grid },
    });

    expect(missingBlock.contextOwner).toBeNull();
    expect(missingGrid.contextOwner).toBeNull();
    expect(missingBlock.targetPolicies.some((policy) => policy.target.id === "missing-block")).toBe(
      false,
    );
    expect(missingGrid.targetPolicies.some((policy) => policy.target.id === "missing-grid")).toBe(
      false,
    );

    editor.destroy();
  });

  it("passes activation intent through without changing projected owners", () => {
    const editor = makeEditor();
    const gridRef = ref(InteractionTargetKind.Grid, "grid-a", nodePos(editor, "grid", "grid-a"));
    const activationIntent = createInteractionActivationIntent({
      kind: InteractionActivationIntentKind.ExplicitChrome,
      target: gridRef,
    });

    editor.commands.setTextSelection(textPos(editor, "Caret") + 2);

    const input = projectInteractionEngineInput(editor.state, {
      activationIntent,
    });

    expect(input.activationIntent).toEqual(activationIntent);
    expect(input.explicitOwner).toBeNull();
  });

  it("keeps activation intent targets valid through lifecycle and invariants", () => {
    const editor = makeEditor();
    const gridRef = ref(InteractionTargetKind.Grid, "grid-a", nodePos(editor, "grid", "grid-a"));
    const activationIntent = createInteractionActivationIntent({
      kind: InteractionActivationIntentKind.BlankStructuralSpace,
      target: gridRef,
    });

    editor.commands.setTextSelection(textPos(editor, "Caret") + 2);

    const input = projectInteractionEngineInput(editor.state, {
      activationIntent,
    });
    const snapshot = resolveInteractionOwnerSnapshot(input);

    expect(snapshot.owners.effectiveOwner).toEqual({
      source: InteractionOwnerSource.Explicit,
      target: gridRef,
    });
    expect(snapshot.owners.explicitOwner).toEqual({
      source: InteractionOwnerSource.Explicit,
      target: gridRef,
    });
    expect(matchingPolicyCount(input, gridRef)).toBe(1);
  });
});
