// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  AUTHORING_FRAME_ATTR,
  AUTHORING_FRAME_EDITABLE_ATTR,
  authoringFrameAttributes,
  courseBlockAuthoringFrameAttributes,
  type AuthoringFrameKind,
} from "@/editor/interactions/dom/authoring-frame";
import { resolveCourseSelectionProjection } from "@/editor/selection/course-selection-projection";
import { CourseSelectionMode } from "@/editor/selection/selection-facts";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";

import { createScaffoldInteractionOwnerExtension } from "../interaction-owner-extension";
import { publishInteractionOwnerSnapshot as publishInteractionOwnerSnapshotWithLookup } from "../facade/interaction-owner-snapshot-publisher";
import { InteractionOwnerSource, InteractionTargetKind } from "../../model/interaction-owner-state";
import {
  EMPTY_INTERACTION_OWNER_PLUGIN_STATE,
  interactionOwnerPluginKey,
} from "../state/interaction-owner-plugin-state";

const BLOCK = "v2_activation_workflow_block";
const DELEGATE_PARENT = "v2_activation_workflow_delegate_parent";
const EMBEDDED_CHILD = "v2_activation_workflow_embedded_child";

const blockDefinition = defineBlock({
  nodeType: BLOCK,
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
  delegateParentDefinition,
  embeddedChildDefinition,
]);

const publishInteractionOwnerSnapshot = (
  state: Parameters<typeof publishInteractionOwnerSnapshotWithLookup>[0],
  facade: Parameters<typeof publishInteractionOwnerSnapshotWithLookup>[1],
) =>
  publishInteractionOwnerSnapshotWithLookup(state, facade, {
    blockDefinitions: testBlockRegistry,
  });

function framedNode(name: string, content: string, frameKind: AuthoringFrameKind) {
  return Node.create({
    name,
    content,
    defining: true,
    group: "block",

    addAttributes() {
      return {
        id: { default: null },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-v2-activation-workflow-${name}]` }];
    },

    renderHTML({ node, HTMLAttributes }) {
      const frameAttributes =
        frameKind === "block"
          ? courseBlockAuthoringFrameAttributes({
              blockId: node.attrs["id"],
              nodeType: name,
            })
          : authoringFrameAttributes({
              frameKind,
              id: node.attrs["id"],
              nodeType: frameKind,
            });
      return [
        "div",
        {
          ...HTMLAttributes,
          ...frameAttributes,
          [`data-v2-activation-workflow-${name}`]: "",
        },
        0,
      ];
    },
  });
}

const TestSurfaceNode = framedNode("surface", "region+", "surface");
const TestRegionNode = framedNode("region", "layout+", "region");
const TestLayoutNode = framedNode("layout", "section+", "layout");
const TestSectionNode = framedNode("section", `(grid | ${BLOCK} | ${DELEGATE_PARENT})+`, "section");
const TestGridNode = framedNode("grid", "cell+", "grid");
const TestCellNode = framedNode("cell", "paragraph+", "cell");
const TestBlockNode = framedNode(BLOCK, "paragraph+", "block");
const TestDelegateParentNode = framedNode(DELEGATE_PARENT, `${EMBEDDED_CHILD}+`, "block");
const TestEmbeddedChildNode = framedNode(EMBEDDED_CHILD, "paragraph+", "block");

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function fullContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "surface",
        attrs: { id: "surface-a" },
        content: [
          {
            type: "region",
            attrs: { id: "region-a" },
            content: [
              {
                type: "layout",
                attrs: { id: "layout-a" },
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
                            content: [paragraph("cell text")],
                          },
                        ],
                      },
                      {
                        type: BLOCK,
                        attrs: { id: "block-a" },
                        content: [paragraph("block text")],
                      },
                      {
                        type: DELEGATE_PARENT,
                        attrs: { id: "parent-a" },
                        content: [
                          {
                            type: EMBEDDED_CHILD,
                            attrs: { id: "child-a" },
                            content: [paragraph("child text")],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      // Trailing paragraph: Tiptap's TrailingNode appends one on the first
      // dispatch when the doc ends with a non-paragraph node, which would
      // break the doc-unchanged assertions below.
      { type: "paragraph" },
    ],
  };
}

function makeEditor(): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestSurfaceNode,
      TestRegionNode,
      TestLayoutNode,
      TestSectionNode,
      TestGridNode,
      TestCellNode,
      TestBlockNode,
      TestDelegateParentNode,
      TestEmbeddedChildNode,
      createScaffoldInteractionOwnerExtension(testBlockRegistry),
    ],
    content: fullContent(),
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

function frameElement(editor: Editor, id: string): Element {
  const found = editor.view.dom.querySelector(`[${AUTHORING_FRAME_ATTR}][data-id="${id}"]`);
  if (!found) throw new Error(`missing frame element ${id}`);
  return found;
}

function mouseDownOn(target: Element): void {
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
}

function pluginState(editor: Editor) {
  const state = interactionOwnerPluginKey.getState(editor.state);
  if (!state) throw new Error("missing interaction owner plugin state");
  return state;
}

function selectionMode(editor: Editor): CourseSelectionMode {
  return resolveCourseSelectionProjection(editor.state.selection, testBlockRegistry).facts
    .selectionMode;
}

function textPos(editor: Editor, text: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (!node.isText) return true;
    const index = node.text?.indexOf(text) ?? -1;
    if (index === -1) return true;
    found = pos + index;
    return false;
  });
  if (found < 0) throw new Error(`missing text ${text}`);
  return found;
}

function clickableButtonInside(frame: Element): {
  button: HTMLButtonElement;
  clicks: string[];
} {
  const button = frame.ownerDocument.createElement("button");
  frame.appendChild(button);
  const clicks: string[] = [];
  button.addEventListener("click", () => clicks.push("click"));
  return { button, clicks };
}

function pressAndClick(button: Element): MouseEvent {
  const mousedown = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
  });
  button.dispatchEvent(mousedown);
  button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  return mousedown;
}

describe("v2 activation workflows", () => {
  it("moves from a selected child block to structural container whitespace", () => {
    const editor = makeEditor();
    mouseDownOn(frameElement(editor, "block-a"));
    expect(selectionMode(editor)).toBe(CourseSelectionMode.NodeSelection);

    mouseDownOn(frameElement(editor, "section-a"));

    expect(pluginState(editor).explicitOwner).toMatchObject({
      id: "section-a",
      kind: InteractionTargetKind.Section,
    });
    expect(selectionMode(editor)).not.toBe(CourseSelectionMode.NodeSelection);

    const snapshot = publishInteractionOwnerSnapshot(editor.state, null);
    expect(snapshot.owners.effectiveOwner.source).toBe(InteractionOwnerSource.Explicit);
    expect(snapshot.owners.effectiveOwner.target).toMatchObject({
      id: "section-a",
      kind: InteractionTargetKind.Section,
    });
    expect(snapshot.selection.objectSelectedTarget).toBeNull();
    editor.destroy();
  });

  it("keeps structural activation free of keyboard object semantics", () => {
    const editor = makeEditor();

    mouseDownOn(frameElement(editor, "cell-a"));

    expect(pluginState(editor).explicitOwner).toMatchObject({
      id: "cell-a",
      kind: InteractionTargetKind.Cell,
    });
    expect(selectionMode(editor)).not.toBe(CourseSelectionMode.NodeSelection);
    editor.destroy();
  });

  it("clears the structural explicit owner when authored editable text is clicked", () => {
    const editor = makeEditor();
    mouseDownOn(frameElement(editor, "cell-a"));
    expect(pluginState(editor).explicitOwner).not.toBeNull();

    const blockFrame = frameElement(editor, "block-a");
    const editable = document.createElement("div");
    editable.setAttribute(AUTHORING_FRAME_EDITABLE_ATTR, "");
    const text = document.createElement("span");
    editable.appendChild(text);
    blockFrame.appendChild(editable);
    mouseDownOn(text);

    expect(pluginState(editor).explicitOwner).toBeNull();

    const snapshot = publishInteractionOwnerSnapshot(editor.state, null);
    expect(snapshot.owners.explicitOwner.target).toBeNull();
    expect(snapshot.owners.effectiveOwner.source).not.toBe(InteractionOwnerSource.Explicit);
    editor.destroy();
  });

  it("deliberately object-selects a regular block shell", () => {
    const editor = makeEditor();

    mouseDownOn(frameElement(editor, "block-a"));

    expect(selectionMode(editor)).toBe(CourseSelectionMode.NodeSelection);

    const snapshot = publishInteractionOwnerSnapshot(editor.state, null);
    expect(snapshot.selection.objectSelectedTarget).toMatchObject({
      id: "block-a",
      kind: InteractionTargetKind.Block,
    });
    expect(snapshot.owners.selectionOwner.target).toMatchObject({
      id: "block-a",
      kind: InteractionTargetKind.Block,
    });
    editor.destroy();
  });

  it("keeps the raw child object target while delegating the owner to the managed parent", () => {
    const editor = makeEditor();

    mouseDownOn(frameElement(editor, "child-a"));

    expect(selectionMode(editor)).toBe(CourseSelectionMode.NodeSelection);

    const snapshot = publishInteractionOwnerSnapshot(editor.state, null);
    expect(snapshot.selection.objectSelectedTarget).toMatchObject({
      id: "child-a",
      kind: InteractionTargetKind.Block,
    });
    expect(snapshot.owners.selectionOwner.target).toMatchObject({
      id: "parent-a",
      kind: InteractionTargetKind.Block,
    });
    expect(snapshot.owners.effectiveOwner.target).toMatchObject({
      id: "parent-a",
      kind: InteractionTargetKind.Block,
    });
    editor.destroy();
  });

  it("primes context ownership without moving selection for ignored interactive descendants", () => {
    const editor = makeEditor();
    const blockFrame = frameElement(editor, "block-a");
    const button = document.createElement("button");
    blockFrame.appendChild(button);
    const modeBefore = selectionMode(editor);

    mouseDownOn(button);

    expect(pluginState(editor).contextOwner).toMatchObject({
      id: "block-a",
      kind: InteractionTargetKind.Block,
    });
    expect(pluginState(editor).explicitOwner).toBeNull();
    expect(pluginState(editor).menuOwner).toBeNull();
    expect(pluginState(editor).settingsOwner).toBeNull();
    expect(pluginState(editor).gestureOwner).toBeNull();
    expect(selectionMode(editor)).toBe(modeBefore);
    editor.destroy();
  });

  it("primes block context and chrome from an assessment-style action button while the click fires", () => {
    const editor = makeEditor();
    // Stale PM selection in another block: caret in the managed child's text
    // resolves parent-a as the selection owner before the action-row click.
    editor.commands.setTextSelection(textPos(editor, "child text") + 2);
    const caretBefore = editor.state.selection.from;

    const blockFrame = frameElement(editor, "block-a");
    const actionRow = document.createElement("div");
    actionRow.setAttribute("contenteditable", "false");
    blockFrame.appendChild(actionRow);
    const { button, clicks } = clickableButtonInside(actionRow);
    const docBefore = JSON.stringify(editor.getJSON());

    const mousedown = pressAndClick(button);

    expect(mousedown.defaultPrevented).toBe(false);
    expect(clicks).toEqual(["click"]);
    expect(editor.state.selection.from).toBe(caretBefore);
    expect(selectionMode(editor)).toBe(CourseSelectionMode.TextCaret);
    expect(JSON.stringify(editor.getJSON())).toBe(docBefore);

    const snapshot = publishInteractionOwnerSnapshot(editor.state, null);
    expect(snapshot.owners.contextOwner.target).toMatchObject({
      id: "block-a",
      kind: InteractionTargetKind.Block,
    });
    expect(snapshot.owners.selectionOwner.target).toMatchObject({
      id: "parent-a",
      kind: InteractionTargetKind.Block,
    });
    expect(snapshot.owners.effectiveOwner.target).toMatchObject({
      id: "block-a",
      kind: InteractionTargetKind.Block,
    });
    expect(snapshot.chromeSlots.blockBubble).toMatchObject({
      target: { id: "block-a", kind: InteractionTargetKind.Block },
      visible: true,
    });
    editor.destroy();
  });

  it("publishes the block context owner when authored editable text inside the block is clicked", () => {
    const editor = makeEditor();
    const blockFrame = frameElement(editor, "block-a");
    const editable = document.createElement("div");
    editable.setAttribute(AUTHORING_FRAME_EDITABLE_ATTR, "");
    const text = document.createElement("span");
    editable.appendChild(text);
    blockFrame.appendChild(editable);

    const mousedown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    text.dispatchEvent(mousedown);

    expect(mousedown.defaultPrevented).toBe(false);
    expect(pluginState(editor).contextOwner).toMatchObject({
      id: "block-a",
      kind: InteractionTargetKind.Block,
    });

    const snapshot = publishInteractionOwnerSnapshot(editor.state, null);
    expect(snapshot.owners.contextOwner.target).toMatchObject({
      id: "block-a",
      kind: InteractionTargetKind.Block,
    });
    expect(snapshot.chromeSlots.blockBubble).toMatchObject({
      target: { id: "block-a", kind: InteractionTargetKind.Block },
      visible: true,
    });
    editor.destroy();
  });

  it("primes layout context from an Add tab-style button while the button action runs", () => {
    const editor = makeEditor();
    const { button, clicks } = clickableButtonInside(frameElement(editor, "layout-a"));
    const docBefore = JSON.stringify(editor.getJSON());

    const mousedown = pressAndClick(button);

    expect(mousedown.defaultPrevented).toBe(false);
    expect(clicks).toEqual(["click"]);
    expect(JSON.stringify(editor.getJSON())).toBe(docBefore);
    expect(selectionMode(editor)).not.toBe(CourseSelectionMode.NodeSelection);

    const snapshot = publishInteractionOwnerSnapshot(editor.state, null);
    expect(snapshot.owners.contextOwner.target).toMatchObject({
      id: "layout-a",
      kind: InteractionTargetKind.Layout,
    });
    expect(snapshot.owners.effectiveOwner.target).toMatchObject({
      id: "layout-a",
      kind: InteractionTargetKind.Layout,
    });
    expect(snapshot.chromeSlots.outline).toMatchObject({
      target: { id: "layout-a", kind: InteractionTargetKind.Layout },
      visible: true,
    });
    expect(snapshot.chromeSlots.arrangementMenu.visible).toBe(false);
    editor.destroy();
  });

  it("maps section descendant context to the parent layout owner without section outline", () => {
    const editor = makeEditor();
    const { button, clicks } = clickableButtonInside(frameElement(editor, "section-a"));

    const mousedown = pressAndClick(button);

    expect(mousedown.defaultPrevented).toBe(false);
    expect(clicks).toEqual(["click"]);

    const snapshot = publishInteractionOwnerSnapshot(editor.state, null);
    expect(snapshot.owners.contextOwner.target).toMatchObject({
      id: "layout-a",
      kind: InteractionTargetKind.Layout,
    });
    expect(snapshot.chromeSlots.outline).toMatchObject({
      target: { id: "layout-a", kind: InteractionTargetKind.Layout },
      visible: true,
    });
    expect(snapshot.chromeSlots.arrangementMenu.visible).toBe(false);
    editor.destroy();
  });

  it("clears owners and object selection when clicking outside the editor", () => {
    const editor = makeEditor();
    mouseDownOn(frameElement(editor, "child-a"));
    expect(selectionMode(editor)).toBe(CourseSelectionMode.NodeSelection);

    const outside = document.createElement("div");
    document.body.appendChild(outside);
    mouseDownOn(outside);

    expect(pluginState(editor)).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);
    expect(selectionMode(editor)).not.toBe(CourseSelectionMode.NodeSelection);

    const snapshot = publishInteractionOwnerSnapshot(editor.state, null);
    expect(snapshot.selection.objectSelectedTarget).toBeNull();
    expect(snapshot.owners.effectiveOwner.target).toBeNull();
    editor.destroy();
  });
});
