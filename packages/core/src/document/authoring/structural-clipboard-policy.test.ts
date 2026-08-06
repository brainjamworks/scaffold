// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { createStructuralClipboardPolicy } from "./structural-clipboard-policy";

const CoreBlockNode = clipboardNode("core_block", "div[data-core-block]");
const ContributedBlockNode = clipboardNode("contributed_block", "div[data-contributed-block]");
const LayoutNode = structuralVariantNode("layout", "section[data-layout]");
const SurfaceNode = structuralVariantNode("surface", "article[data-surface]");

const blockDefinitions = createBlockRegistry([
  defineBlock({ nodeType: "core_block" }),
  defineBlock({ nodeType: "contributed_block" }),
]);
const layoutDefinitions = {
  getById: (id: string) =>
    id === "core-layout" || id === "contributed-layout" ? { id } : undefined,
};
const surfaceVariants = {
  get: (id: string) => (id === "core-surface" || id === "contributed-surface" ? { id } : undefined),
};

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("structural clipboard policy", () => {
  it("allows a real rich-text paste and leaves pasted node identity to UniqueID", () => {
    const editor = makeEditor();
    const beforeIds = allNodeIds(editor);
    setCursorAtEnd(editor, "paste-target");

    dispatchClipboard(editor, "paste", {
      "text/html":
        '<p data-pm-slice="0 0 []" data-id="foreignPara1"><strong>Rich</strong></p><p data-id="foreignPara2">paste</p>',
      "text/plain": "Rich\npaste",
    });

    const richText = findTextJson(editor.getJSON(), "Rich");
    const afterIds = allNodeIds(editor);
    expect(editor.state.doc.textContent).toContain("TargetRichpaste");
    expect(richText?.marks).toEqual([{ type: "bold" }]);
    expect(afterIds).not.toContain("foreignPara1");
    expect(afterIds.filter((id) => !beforeIds.includes(id))).toHaveLength(2);
  });

  it("allows a real partial-text paste when the slice carries open Block wrappers", () => {
    const editor = makeEditor();
    const firstText = textRange(editor, "Alpha text", 2, 10);
    const secondText = textRange(editor, "Bravo text", 0, 5);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, firstText.from, secondText.to),
      ),
    );
    const selectedSlice = editor.state.selection.content();

    expect(selectedSlice.openStart).toBeGreaterThan(0);
    expect(selectedSlice.openEnd).toBeGreaterThan(0);
    expect(selectedSlice.content.firstChild?.type.name).toBe("core_block");
    expect(selectedSlice.content.lastChild?.type.name).toBe("core_block");

    const copied = dispatchClipboard(editor, "copy").written;
    const before = editor.state.doc.textContent;
    setCursorAtEnd(editor, "paste-target");
    dispatchClipboard(editor, "paste", copied);

    expect(copied["text/plain"]).toContain("pha text");
    expect(editor.state.doc.textContent).not.toBe(before);
    expect(editor.state.doc.textContent).toContain("pha text");
    expect(editor.state.doc.textContent).toContain("Bravo");
  });

  it.each([
    [
      "Core Block",
      '<div data-pm-slice="0 0 []" data-core-block data-id="pasteCore001"><p data-id="pastePara001">Blocked</p></div>',
    ],
    [
      "contributed Block",
      '<div data-pm-slice="0 0 []" data-contributed-block data-id="pasteHost001"><p data-id="pastePara002">Blocked</p></div>',
    ],
    [
      "Core Layout",
      '<section data-pm-slice="0 0 []" data-layout data-variant="core-layout" data-id="pasteLayout1"><p data-id="pastePara003">Blocked</p></section>',
    ],
    [
      "contributed Layout",
      '<section data-pm-slice="0 0 []" data-layout data-variant="contributed-layout" data-id="pasteLayout2"><p data-id="pastePara004">Blocked</p></section>',
    ],
    [
      "Core Surface",
      '<article data-pm-slice="0 0 []" data-surface data-variant="core-surface" data-id="pasteSurfac1"><p data-id="pastePara005">Blocked</p></article>',
    ],
    [
      "contributed Surface",
      '<article data-pm-slice="0 0 []" data-surface data-variant="contributed-surface" data-id="pasteSurfac2"><p data-id="pastePara006">Blocked</p></article>',
    ],
  ])("refuses a complete mounted %s from a real paste before insertion", (_label, html) => {
    const editor = makeEditor();
    const before = editor.getJSON();
    setCursorAtEnd(editor, "paste-target");

    dispatchClipboard(editor, "paste", { "text/html": html, "text/plain": "Blocked" });

    expect(editor.getJSON()).toEqual(before);
  });

  it("refuses a structurally selected Block cut before deletion", () => {
    const editor = makeEditor();
    const blockPos = nodePositionById(editor, "core-block-a");
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, blockPos)),
    );
    const before = editor.getJSON();

    const { event, written } = dispatchClipboard(editor, "cut");

    expect(event.defaultPrevented).toBe(true);
    expect(written).toEqual({});
    expect(editor.getJSON()).toEqual(before);
  });

  it("allows an ordinary text cut through the real clipboard lifecycle", () => {
    const editor = makeEditor();
    const range = textRange(editor, "Alpha text", 0, 5);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, range.from, range.to)),
    );

    const { written } = dispatchClipboard(editor, "cut");

    expect(written["text/plain"]).toBe("Alpha");
    expect(editor.state.doc.textContent).not.toContain("Alpha text");
  });
});

function makeEditor(): Editor {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      CoreBlockNode,
      ContributedBlockNode,
      LayoutNode,
      SurfaceNode,
      UniqueID.configure({
        attributeName: "id",
        types: "all",
        generateID: () => createEmbeddedNodeId(),
      }),
      createStructuralClipboardPolicy({
        blockDefinitions,
        layoutDefinitions,
        surfaceVariants,
      }),
    ],
    content: {
      type: "doc",
      content: [
        block("core_block", "core-block-a", "para-alpha-a", "Alpha text"),
        block("core_block", "core-block-b", "para-bravo-b", "Bravo text"),
        {
          type: "paragraph",
          attrs: { id: "paste-target" },
          content: [{ type: "text", text: "Target" }],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function clipboardNode(name: string, tag: string) {
  return Node.create({
    name,
    group: "block",
    content: "paragraph+",
    parseHTML: () => [{ tag }],
    renderHTML: ({ HTMLAttributes }) => [tag.slice(0, tag.indexOf("[")), HTMLAttributes, 0],
  });
}

function structuralVariantNode(name: "layout" | "surface", tag: string) {
  return Node.create({
    name,
    group: "block",
    content: "paragraph+",
    addAttributes: () => ({
      variant: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-variant"),
        renderHTML: ({ variant }) => (variant ? { "data-variant": variant } : {}),
      },
    }),
    parseHTML: () => [{ tag }],
    renderHTML: ({ HTMLAttributes }) => [tag.slice(0, tag.indexOf("[")), HTMLAttributes, 0],
  });
}

function block(type: string, id: string, paragraphId: string, text: string): JSONContent {
  return {
    type,
    attrs: { id },
    content: [
      {
        type: "paragraph",
        attrs: { id: paragraphId },
        content: [{ type: "text", text }],
      },
    ],
  };
}

function dispatchClipboard(
  editor: Editor,
  type: "copy" | "cut" | "paste",
  initial: Record<string, string> = {},
): { event: Event; written: Record<string, string> } {
  const written = { ...initial };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      clearData: () => {
        for (const key of Object.keys(written)) delete written[key];
      },
      getData: (format: string) => written[format] ?? "",
      setData: (format: string, value: string) => {
        written[format] = value;
      },
    },
  });
  editor.view.dom.dispatchEvent(event);
  return { event, written };
}

function nodePositionById(editor: Editor, id: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });
  if (found === null) throw new Error(`Missing node ${id}`);
  return found;
}

function textRange(
  editor: Editor,
  text: string,
  fromOffset: number,
  toOffset: number,
): { from: number; to: number } {
  let start: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || node.text !== text) return true;
    start = pos;
    return false;
  });
  if (start === null) throw new Error(`Missing text ${text}`);
  return { from: start + fromOffset, to: start + toOffset };
}

function setCursorAtEnd(editor: Editor, paragraphId: string): void {
  const paragraphPos = nodePositionById(editor, paragraphId);
  const paragraph = editor.state.doc.nodeAt(paragraphPos);
  if (!paragraph) throw new Error(`Missing paragraph ${paragraphId}`);
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, paragraphPos + paragraph.nodeSize - 1),
    ),
  );
}

function allNodeIds(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (typeof node.attrs["id"] === "string") ids.push(node.attrs["id"]);
    return true;
  });
  return ids;
}

function findTextJson(content: JSONContent, text: string): JSONContent | undefined {
  if (content.text === text) return content;
  return content.content?.map((child) => findTextJson(child, text)).find(Boolean);
}
