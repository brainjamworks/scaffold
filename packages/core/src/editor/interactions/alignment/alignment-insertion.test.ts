// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { createScaffoldTextAlignExtension } from "@/editor/rich-text/model/text-alignment";

import {
  materializeCatalogNodeHorizontalAlignment as materializeCatalogNodeHorizontalAlignmentWithLookup,
  resolveInsertionHorizontalAlignment as resolveInsertionHorizontalAlignmentWithLookup,
} from "./alignment-insertion";

const RESIZABLE = "alignment_insertion_resizable";
const FIXED = "alignment_insertion_fixed";
const editors: Editor[] = [];

const testBlockRegistry = createBlockRegistry([
  defineBlock({ nodeType: RESIZABLE, frame: { resizable: true } }),
  defineBlock({ nodeType: FIXED }),
]);

const resolveInsertionHorizontalAlignment = (
  input: Omit<
    Parameters<typeof resolveInsertionHorizontalAlignmentWithLookup>[0],
    "blockDefinitions"
  >,
) =>
  resolveInsertionHorizontalAlignmentWithLookup({
    ...input,
    blockDefinitions: testBlockRegistry,
  });

const materializeCatalogNodeHorizontalAlignment = (
  input: Omit<
    Parameters<typeof materializeCatalogNodeHorizontalAlignmentWithLookup>[0],
    "blockDefinitions"
  >,
) =>
  materializeCatalogNodeHorizontalAlignmentWithLookup({
    ...input,
    blockDefinitions: testBlockRegistry,
  });

function ownerNode(name: string) {
  return Node.create({
    name,
    group: "block",
    content: "block+",
    isolating: true,
    renderHTML() {
      return ["div", { [`data-alignment-owner-${name}`]: "" }, 0];
    },
  });
}

function catalogNode(name: string) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    addAttributes() {
      return { id: { default: null }, frame: { default: null }, data: { default: {} } };
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", { ...HTMLAttributes, [`data-alignment-catalog-${name}`]: "" }];
    },
  });
}

function makeEditor(content: JSONContent) {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      createScaffoldTextAlignExtension(["paragraph", "heading"]),
      ownerNode("surface"),
      ownerNode("region"),
      ownerNode("grid"),
      ownerNode("cell"),
      ownerNode("layout"),
      ownerNode("section"),
      ownerNode("quiz_scope"),
      catalogNode(RESIZABLE),
      catalogNode(FIXED),
    ],
    content,
  });
  editors.push(editor);
  return editor;
}

function doc(content: JSONContent[]): JSONContent {
  return { type: "doc", content };
}

function owner(type: string, content: JSONContent[]): JSONContent {
  return { type, content };
}

function paragraph(text: string, textAlign: string): JSONContent {
  return {
    type: "paragraph",
    attrs: { textAlign },
    ...(text ? { content: [{ type: "text", text }] } : {}),
  };
}

function textRange(editor: Editor, text: string) {
  let from = -1;
  editor.state.doc.descendants((node, pos) => {
    if (from >= 0) return false;
    if (!node.isText) return true;
    const offset = node.text?.indexOf(text) ?? -1;
    if (offset >= 0) from = pos + offset;
    return from < 0;
  });
  if (from < 0) throw new Error(`missing text ${text}`);
  return { from, to: from + text.length };
}

function nodePos(editor: Editor, predicate: (node: import("@tiptap/pm/model").Node) => boolean) {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (predicate(node)) found = pos;
    return found < 0;
  });
  if (found < 0) throw new Error("missing node");
  return found;
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("resolveInsertionHorizontalAlignment", () => {
  it("uses the representable alignment of the replaced textblock", () => {
    const editor = makeEditor(doc([owner("surface", [paragraph("/block", "right")])]));

    expect(
      resolveInsertionHorizontalAlignment({
        doc: editor.state.doc,
        ...textRange(editor, "/block"),
      }),
    ).toBe("right");
  });

  it("uses a preceding resizable block before a following textblock", () => {
    const editor = makeEditor(
      doc([
        owner("surface", [
          {
            type: RESIZABLE,
            attrs: { id: "previous", frame: { align: "center", widthMode: "fill" } },
          },
          { type: "horizontalRule" },
          paragraph("following", "right"),
        ]),
      ]),
    );
    const from = nodePos(editor, (node) => node.type.name === "horizontalRule");

    expect(resolveInsertionHorizontalAlignment({ doc: editor.state.doc, from, to: from })).toBe(
      "center",
    );
  });

  it("uses a following participant when none precedes the insertion", () => {
    const editor = makeEditor(
      doc([owner("surface", [{ type: "horizontalRule" }, paragraph("following", "right")])]),
    );
    const from = nodePos(editor, (node) => node.type.name === "horizontalRule");

    expect(resolveInsertionHorizontalAlignment({ doc: editor.state.doc, from, to: from })).toBe(
      "right",
    );
  });

  it("skips Justify and falls through to a representable neighbor", () => {
    const editor = makeEditor(
      doc([
        owner("surface", [
          paragraph("justify", "justify"),
          { type: "horizontalRule" },
          paragraph("following", "right"),
        ]),
      ]),
    );
    const from = nodePos(editor, (node) => node.type.name === "horizontalRule");

    expect(resolveInsertionHorizontalAlignment({ doc: editor.state.doc, from, to: from })).toBe(
      "right",
    );
  });

  it("falls back to Left when the destination has no representable participant", () => {
    const editor = makeEditor(
      doc([owner("surface", [paragraph("justify", "justify"), { type: "horizontalRule" }])]),
    );
    const from = nodePos(editor, (node) => node.type.name === "horizontalRule");

    expect(resolveInsertionHorizontalAlignment({ doc: editor.state.doc, from, to: from })).toBe(
      "left",
    );
  });

  it("does not cross a nested ownership boundary", () => {
    const editor = makeEditor(
      doc([
        owner("surface", [
          paragraph("outer", "right"),
          owner("region", [{ type: "horizontalRule" }]),
        ]),
      ]),
    );
    const from = nodePos(editor, (node) => node.type.name === "horizontalRule");

    expect(resolveInsertionHorizontalAlignment({ doc: editor.state.doc, from, to: from })).toBe(
      "left",
    );
  });

  it("honors an explicit destination owner without owner-specific semantics", () => {
    const editor = makeEditor(
      doc([
        owner("surface", [
          paragraph("outer", "right"),
          owner("quiz_scope", [{ type: "horizontalRule" }]),
        ]),
      ]),
    );
    const from = nodePos(editor, (node) => node.type.name === "horizontalRule");
    const ownerPos = nodePos(editor, (node) => node.type.name === "quiz_scope");
    const explicitOwner = editor.state.doc.nodeAt(ownerPos);
    if (!explicitOwner) throw new Error("missing explicit owner node");

    expect(
      resolveInsertionHorizontalAlignment({
        doc: editor.state.doc,
        from,
        owner: { contentStart: ownerPos + 1, node: explicitOwner },
        to: from,
      }),
    ).toBe("left");
  });
});

describe("materializeCatalogNodeHorizontalAlignment", () => {
  it("materializes within an explicit destination owner", () => {
    const editor = makeEditor(
      doc([
        owner("surface", [
          paragraph("outer", "right"),
          owner("quiz_scope", [{ type: "horizontalRule" }]),
        ]),
      ]),
    );
    const from = nodePos(editor, (candidate) => candidate.type.name === "horizontalRule");
    const ownerPos = nodePos(editor, (candidate) => candidate.type.name === "quiz_scope");
    const explicitOwner = editor.state.doc.nodeAt(ownerPos);
    if (!explicitOwner) throw new Error("missing explicit owner node");
    const node = editor.schema.node(RESIZABLE, { id: "inserted" });

    const result = materializeCatalogNodeHorizontalAlignment({
      doc: editor.state.doc,
      from,
      node,
      owner: { contentStart: ownerPos + 1, node: explicitOwner },
      to: from,
    });

    expect(result.attrs["frame"]).toMatchObject({ align: "start" });
  });

  it("clones a resizable catalog node with destination alignment and preserves fill attrs", () => {
    const editor = makeEditor(doc([owner("surface", [paragraph("/block", "right")])]));
    const node = editor.schema.node(RESIZABLE, {
      id: "inserted",
      frame: { align: "start", widthMode: "fill", widthPercent: 100 },
      data: { retained: true },
    });

    const result = materializeCatalogNodeHorizontalAlignment({
      doc: editor.state.doc,
      ...textRange(editor, "/block"),
      node,
    });

    expect(result).not.toBe(node);
    expect(result.attrs["frame"]).toMatchObject({
      align: "end",
      widthMode: "fill",
      widthPercent: 100,
    });
    expect(result.attrs["data"]).toEqual({ retained: true });
  });

  it("leaves non-resizable catalog nodes untouched", () => {
    const editor = makeEditor(doc([owner("surface", [paragraph("/block", "right")])]));
    const node = editor.schema.node(FIXED, { id: "fixed", data: { retained: true } });

    expect(
      materializeCatalogNodeHorizontalAlignment({
        doc: editor.state.doc,
        ...textRange(editor, "/block"),
        node,
      }),
    ).toBe(node);
  });
});
