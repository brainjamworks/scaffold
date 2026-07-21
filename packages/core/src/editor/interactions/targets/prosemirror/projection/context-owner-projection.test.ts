// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import { AllSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_INTERACTION_CONTEXT_OWNERS,
  InteractionTargetKind,
} from "../../model/interaction-owner-state";
import {
  projectInteractionContextOwnerPolicies,
  projectInteractionContextOwners,
} from "./context-owner-projection";

const TestSurfaceNode = structuralNode("surface", "region+");
const TestRegionNode = structuralNode("region", "(layout | grid | paragraph)+");
const TestLayoutNode = structuralNode("layout", "section+");
const TestSectionNode = structuralNode("section", "(grid | paragraph)+");
const TestGridNode = structuralNode("grid", "cell+");
const TestCellNode = structuralNode("cell", "paragraph+");

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
        variant: {
          default: null,
        },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-v2-context-owner-${name}]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [`div`, { ...HTMLAttributes, [`data-v2-context-owner-${name}`]: "" }, 0];
    },
  });
}

function makeEditor(content: JSONContent) {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestSurfaceNode,
      TestRegionNode,
      TestLayoutNode,
      TestSectionNode,
      TestGridNode,
      TestCellNode,
    ],
    content,
  });
}

function gridContent() {
  return {
    type: "doc",
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
                type: "paragraph",
                content: [{ type: "text", text: "Cell A text" }],
              },
            ],
          },
          {
            type: "cell",
            attrs: { id: "cell-b" },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Cell B text" }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function layoutContent() {
  return {
    type: "doc",
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
                type: "paragraph",
                content: [{ type: "text", text: "Section text" }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function tabsLayoutContent() {
  return {
    type: "doc",
    content: [
      {
        type: "layout",
        attrs: { id: "layout-tabs", variant: "tabs" },
        content: [
          {
            type: "section",
            attrs: { id: "section-tabs" },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Tab section text" }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function surfaceContent() {
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
                type: "paragraph",
                content: [{ type: "text", text: "Region text" }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function nodePos(editor: Editor, type: string, occurrence = 0): number {
  let seen = 0;
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== type) return true;
    if (seen !== occurrence) {
      seen += 1;
      return true;
    }
    found = pos;
    return false;
  });

  if (found === null) throw new Error(`Node not found: ${type}`);
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

describe("projectInteractionContextOwners", () => {
  it("projects shared cell and grid owners for text inside a cell", () => {
    const editor = makeEditor(gridContent());

    editor.commands.setTextSelection(textPos(editor, "Cell A") + 2);

    expect(projectInteractionContextOwners(editor.state.selection)).toEqual({
      ...EMPTY_INTERACTION_CONTEXT_OWNERS,
      cell: {
        id: "cell-a",
        kind: InteractionTargetKind.Cell,
        pos: nodePos(editor, "cell"),
      },
      grid: {
        id: "grid-a",
        kind: InteractionTargetKind.Grid,
        pos: nodePos(editor, "grid"),
      },
    });

    editor.destroy();
  });

  it("projects shared section and layout owners for text inside a section", () => {
    const editor = makeEditor(layoutContent());

    editor.commands.setTextSelection(textPos(editor, "Section") + 2);

    expect(projectInteractionContextOwners(editor.state.selection)).toEqual({
      ...EMPTY_INTERACTION_CONTEXT_OWNERS,
      layout: {
        id: "layout-a",
        kind: InteractionTargetKind.Layout,
        pos: nodePos(editor, "layout"),
      },
      section: {
        id: "section-a",
        kind: InteractionTargetKind.Section,
        pos: nodePos(editor, "section"),
      },
    });

    editor.destroy();
  });

  it("projects section settings policy from the parent layout definition without section outline chrome", () => {
    const editor = makeEditor(tabsLayoutContent());

    editor.commands.setTextSelection(textPos(editor, "Tab section") + 2);

    const sectionPolicy = projectInteractionContextOwnerPolicies(editor.state.selection).find(
      (policy) => policy.target.kind === InteractionTargetKind.Section,
    );

    expect(sectionPolicy).toMatchObject({
      supportsArrangementMenu: true,
      supportsMovement: true,
      supportsOutline: false,
      supportsResize: false,
      supportsSettings: true,
      target: {
        id: "section-tabs",
        kind: InteractionTargetKind.Section,
        pos: nodePos(editor, "section"),
      },
    });

    editor.destroy();
  });

  it("projects shared region and surface owners for text inside a region", () => {
    const editor = makeEditor(surfaceContent());

    editor.commands.setTextSelection(textPos(editor, "Region") + 2);

    expect(projectInteractionContextOwners(editor.state.selection)).toEqual({
      ...EMPTY_INTERACTION_CONTEXT_OWNERS,
      region: {
        id: "region-a",
        kind: InteractionTargetKind.Region,
        pos: nodePos(editor, "region"),
      },
      surface: {
        id: "surface-a",
        kind: InteractionTargetKind.Surface,
        pos: nodePos(editor, "surface"),
      },
    });

    editor.destroy();
  });

  it("does not publish non-shared narrower owners for cross-cell selections", () => {
    const editor = makeEditor(gridContent());

    editor.commands.setTextSelection({
      from: textPos(editor, "Cell A") + 2,
      to: textPos(editor, "Cell B") + 2,
    });

    expect(projectInteractionContextOwners(editor.state.selection)).toEqual({
      ...EMPTY_INTERACTION_CONTEXT_OWNERS,
      grid: {
        id: "grid-a",
        kind: InteractionTargetKind.Grid,
        pos: nodePos(editor, "grid"),
      },
    });

    editor.destroy();
  });

  it("returns an empty fresh context owner object for whole-document selection", () => {
    const editor = makeEditor(gridContent());

    editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)));

    const owners = projectInteractionContextOwners(editor.state.selection);

    expect(owners).toEqual(EMPTY_INTERACTION_CONTEXT_OWNERS);
    expect(owners).not.toBe(EMPTY_INTERACTION_CONTEXT_OWNERS);

    editor.destroy();
  });
});
