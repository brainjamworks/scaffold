// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  AUTHORING_FRAME_ATTR,
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
import { InteractionTargetKind } from "../../model/interaction-owner-state";
import { interactionOwnerPluginKey } from "../state/interaction-owner-plugin-state";

const BLOCK = "v2_keyboard_workflow_block";

const testBlockRegistry = createBlockRegistry([defineBlock({ nodeType: BLOCK })]);

const publishInteractionOwnerSnapshot = (
  state: Parameters<typeof publishInteractionOwnerSnapshotWithLookup>[0],
  facade: Parameters<typeof publishInteractionOwnerSnapshotWithLookup>[1],
) =>
  publishInteractionOwnerSnapshotWithLookup(state, facade, {
    blockDefinitions: testBlockRegistry,
  });

/**
 * Duplicated from interaction-activation-workflow.test.ts with one deliberate
 * difference: structural containers are `isolating`, matching the production
 * surface/region/layout/section/grid/cell schema, because keyboard join
 * behavior at container boundaries is exactly what this file pins.
 */
function framedNode(name: string, content: string, frameKind: AuthoringFrameKind) {
  return Node.create({
    name,
    content,
    defining: true,
    isolating: frameKind !== "block",
    group: "block",

    addAttributes() {
      return {
        id: { default: null },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-v2-keyboard-workflow-${name}]` }];
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
          [`data-v2-keyboard-workflow-${name}`]: "",
        },
        0,
      ];
    },
  });
}

const TestSurfaceNode = framedNode("surface", "region+", "surface");
const TestRegionNode = framedNode("region", "layout+", "region");
const TestLayoutNode = framedNode("layout", "section+", "layout");
const TestSectionNode = framedNode("section", `(grid | ${BLOCK})+`, "section");
const TestGridNode = framedNode("grid", "cell+", "grid");
const TestCellNode = framedNode("cell", "paragraph+", "cell");
const TestBlockNode = framedNode(BLOCK, "paragraph+", "block");

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
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

const STRUCTURAL_IDS = [
  "surface-a",
  "region-a",
  "layout-a",
  "section-a",
  "grid-a",
  "cell-a",
] as const;

const STRUCTURAL_CASES = [
  { id: "surface-a", kind: InteractionTargetKind.Surface },
  { id: "region-a", kind: InteractionTargetKind.Region },
  { id: "layout-a", kind: InteractionTargetKind.Layout },
  { id: "section-a", kind: InteractionTargetKind.Section },
  { id: "grid-a", kind: InteractionTargetKind.Grid },
  { id: "cell-a", kind: InteractionTargetKind.Cell },
] as const;

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

/**
 * Dispatches a real DOM copy/cut event through the ProseMirror view with a
 * captured clipboardData stub, returning whatever the view serialized.
 */
function dispatchClipboard(editor: Editor, type: "copy" | "cut"): Record<string, string> {
  const written: Record<string, string> = {};
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      clearData: () => {},
      setData: (format: string, value: string) => {
        written[format] = value;
      },
      getData: (format: string) => written[format] ?? "",
    },
  });
  editor.view.dom.dispatchEvent(event);
  return written;
}

function nodeCountById(editor: Editor, id: string): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.attrs["id"] === id) count += 1;
    return true;
  });
  return count;
}

function expectStructureIntact(editor: Editor): void {
  for (const id of STRUCTURAL_IDS) {
    expect(nodeCountById(editor, id)).toBe(1);
  }
}

function docJson(editor: Editor): string {
  return JSON.stringify(editor.getJSON());
}

describe("v2 keyboard and clipboard object-safety workflows", () => {
  describe("regular block controls prove the harness", () => {
    it("object-selects a block shell and Backspace removes the block", () => {
      const editor = makeEditor();
      mouseDownOn(frameElement(editor, "block-a"));
      expect(selectionMode(editor)).toBe(CourseSelectionMode.NodeSelection);

      const removed = editor.commands.keyboardShortcut("Backspace");

      expect(removed).toBe(true);
      expect(nodeCountById(editor, "block-a")).toBe(0);
      editor.destroy();
    });

    it("object-selects a block shell and Delete removes the block", () => {
      const editor = makeEditor();
      mouseDownOn(frameElement(editor, "block-a"));
      expect(selectionMode(editor)).toBe(CourseSelectionMode.NodeSelection);

      const removed = editor.commands.keyboardShortcut("Delete");

      expect(removed).toBe(true);
      expect(nodeCountById(editor, "block-a")).toBe(0);
      editor.destroy();
    });

    it("cut removes an object-selected block through the clipboard event path", () => {
      const editor = makeEditor();
      mouseDownOn(frameElement(editor, "block-a"));
      expect(selectionMode(editor)).toBe(CourseSelectionMode.NodeSelection);

      const written = dispatchClipboard(editor, "cut");

      expect(written["text/html"] ?? "").toContain(`data-v2-keyboard-workflow-${BLOCK}`);
      expect(nodeCountById(editor, "block-a")).toBe(0);
      editor.destroy();
    });

    it("copy serializes an object-selected block without changing the document", () => {
      const editor = makeEditor();
      mouseDownOn(frameElement(editor, "block-a"));
      const before = docJson(editor);

      const written = dispatchClipboard(editor, "copy");

      expect(written["text/html"] ?? "").toContain(`data-v2-keyboard-workflow-${BLOCK}`);
      expect(docJson(editor)).toBe(before);
      editor.destroy();
    });
  });

  describe.each(STRUCTURAL_CASES)("structural activation on $id", ({ id, kind }) => {
    function activateStructural(editor: Editor): void {
      // Prime a selected child block first so every case also covers the
      // selected-child-cleared-by-structural-activation path.
      mouseDownOn(frameElement(editor, "block-a"));
      expect(selectionMode(editor)).toBe(CourseSelectionMode.NodeSelection);

      mouseDownOn(frameElement(editor, id));

      expect(pluginState(editor).explicitOwner).toMatchObject({ id, kind });
      expect(selectionMode(editor)).not.toBe(CourseSelectionMode.NodeSelection);
      const snapshot = publishInteractionOwnerSnapshot(editor.state, null);
      expect(snapshot.selection.objectSelectedTarget).toBeNull();
    }

    it("Backspace leaves the container and its content intact", () => {
      const editor = makeEditor();
      activateStructural(editor);
      const before = docJson(editor);

      editor.commands.keyboardShortcut("Backspace");

      expect(docJson(editor)).toBe(before);
      expectStructureIntact(editor);
      editor.destroy();
    });

    it("Delete leaves the container and its content intact", () => {
      const editor = makeEditor();
      activateStructural(editor);
      const before = docJson(editor);

      editor.commands.keyboardShortcut("Delete");

      expect(docJson(editor)).toBe(before);
      expectStructureIntact(editor);
      editor.destroy();
    });

    it("cut through the clipboard event path leaves the container intact", () => {
      const editor = makeEditor();
      activateStructural(editor);
      const before = docJson(editor);

      const written = dispatchClipboard(editor, "cut");

      expect(written["text/html"] ?? "").not.toContain(`data-id="${id}"`);
      expect(docJson(editor)).toBe(before);
      expectStructureIntact(editor);
      editor.destroy();
    });

    it("copy does not serialize the container as an object", () => {
      const editor = makeEditor();
      activateStructural(editor);
      const before = docJson(editor);

      const written = dispatchClipboard(editor, "copy");

      expect(written["text/html"] ?? "").not.toContain(`data-id="${id}"`);
      expect(docJson(editor)).toBe(before);
      editor.destroy();
    });
  });
});
