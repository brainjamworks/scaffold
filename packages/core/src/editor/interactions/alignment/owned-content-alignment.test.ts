// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { createScaffoldTextAlignExtension } from "@/editor/rich-text/model/text-alignment";

import {
  aggregateHorizontalParticipants,
  collectOwnedHorizontalParticipants as collectOwnedHorizontalParticipantsWithLookup,
  setOwnedHorizontalAlignmentInTransaction as setOwnedHorizontalAlignmentInTransactionWithLookup,
} from "./owned-content-alignment";

const RESIZABLE = "owned_alignment_resizable";
const FIXED = "owned_alignment_fixed";

const testBlockRegistry = createBlockRegistry([
  defineBlock({ nodeType: RESIZABLE, frame: { resizable: true } }),
  defineBlock({ nodeType: FIXED }),
]);

const collectOwnedHorizontalParticipants = (
  doc: Parameters<typeof collectOwnedHorizontalParticipantsWithLookup>[0],
  scopePos: Parameters<typeof collectOwnedHorizontalParticipantsWithLookup>[1],
) => collectOwnedHorizontalParticipantsWithLookup(doc, scopePos, testBlockRegistry);

const setOwnedHorizontalAlignmentInTransaction = (
  tr: Parameters<typeof setOwnedHorizontalAlignmentInTransactionWithLookup>[0],
  participants: Parameters<typeof setOwnedHorizontalAlignmentInTransactionWithLookup>[1],
  value: Parameters<typeof setOwnedHorizontalAlignmentInTransactionWithLookup>[2],
) => setOwnedHorizontalAlignmentInTransactionWithLookup(tr, participants, value, testBlockRegistry);

function structuralNode(name: string, content = "block+") {
  return Node.create({
    name,
    content,
    group: "block",
    addAttributes() {
      return { id: { default: null } };
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", HTMLAttributes, 0];
    },
  });
}

function courseBlockNode(name: string) {
  return Node.create({
    name,
    content: "paragraph+",
    group: "block",
    addAttributes() {
      return { frame: { default: null }, id: { default: null } };
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", HTMLAttributes, 0];
    },
  });
}

function makeEditor(content: JSONContent) {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      createScaffoldTextAlignExtension(["paragraph", "heading"]),
      structuralNode("region"),
      structuralNode("cell"),
      structuralNode("section"),
      structuralNode("surface"),
      structuralNode("grid", "cell+"),
      structuralNode("layout", "section+"),
      courseBlockNode(RESIZABLE),
      courseBlockNode(FIXED),
    ],
    content,
  });
}

describe("owned horizontal content", () => {
  it("collects configured textblocks through transparent wrappers in document order", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "region",
          attrs: { id: "region-a" },
          content: [
            { type: "paragraph", attrs: { textAlign: "left" } },
            {
              type: "blockquote",
              content: [{ type: "paragraph", attrs: { textAlign: "center" } }],
            },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [{ type: "paragraph", attrs: { textAlign: "right" } }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(collectOwnedHorizontalParticipants(editor.state.doc, 0)).toEqual([
      { kind: "textblock", pos: 1, value: "left" },
      { kind: "textblock", pos: 4, value: "center" },
      { kind: "textblock", pos: 9, value: "right" },
    ]);

    editor.destroy();
  });

  it("derives unavailable, uniform, outside-command-set, and mixed aggregates", () => {
    expect(aggregateHorizontalParticipants([])).toEqual({ kind: "unavailable" });
    expect(
      aggregateHorizontalParticipants([
        { kind: "textblock", pos: 1, value: "center" },
        { kind: "frame", pos: 4, value: "center" },
      ]),
    ).toEqual({ kind: "value", value: "center" });
    expect(
      aggregateHorizontalParticipants([
        { kind: "textblock", pos: 1, value: "justify" },
        { kind: "textblock", pos: 4, value: "justify" },
      ]),
    ).toEqual({ kind: "indeterminate", reason: "outside-command-set" });
    expect(
      aggregateHorizontalParticipants([
        { kind: "textblock", pos: 1, value: "justify" },
        { kind: "frame", pos: 4, value: "left" },
      ]),
    ).toEqual({ kind: "indeterminate", reason: "mixed" });
  });

  it("records a resizable CourseBlock once and stops at every ownership boundary", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "region",
          content: [
            { type: "paragraph", attrs: { textAlign: "left" } },
            {
              type: RESIZABLE,
              attrs: {
                id: "block-a",
                frame: { align: "end", widthMode: "fill", widthPercent: 100 },
              },
              content: [{ type: "paragraph", attrs: { textAlign: "center" } }],
            },
            {
              type: FIXED,
              content: [{ type: "paragraph", attrs: { textAlign: "right" } }],
            },
            {
              type: "grid",
              content: [
                {
                  type: "cell",
                  content: [{ type: "paragraph", attrs: { textAlign: "right" } }],
                },
              ],
            },
            {
              type: "layout",
              content: [
                {
                  type: "section",
                  content: [{ type: "paragraph", attrs: { textAlign: "center" } }],
                },
              ],
            },
            {
              type: "region",
              content: [{ type: "paragraph", attrs: { textAlign: "right" } }],
            },
          ],
        },
      ],
    });

    expect(collectOwnedHorizontalParticipants(editor.state.doc, 0)).toEqual([
      { kind: "textblock", pos: 1, value: "left" },
      { kind: "frame", pos: 3, value: "right" },
    ]);

    editor.destroy();
  });

  it("returns no participants for invalid, unavailable, and sibling scopes", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        { type: "region", content: [{ type: "paragraph", attrs: { textAlign: "left" } }] },
        { type: "region", content: [{ type: "paragraph", attrs: { textAlign: "right" } }] },
      ],
    });
    const secondRegionPos = editor.state.doc.child(0).nodeSize;

    expect(collectOwnedHorizontalParticipants(editor.state.doc, -1)).toEqual([]);
    expect(collectOwnedHorizontalParticipants(editor.state.doc, 1)).toEqual([]);
    expect(collectOwnedHorizontalParticipants(editor.state.doc, secondRegionPos)).toEqual([
      { kind: "textblock", pos: secondRegionPos + 1, value: "right" },
    ]);

    editor.destroy();
  });

  it("composes text and frame changes into one checked transaction and skips no-ops", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "cell",
          content: [
            { type: "paragraph", attrs: { textAlign: "left" } },
            {
              type: RESIZABLE,
              attrs: { frame: { align: "end", widthMode: "fill", widthPercent: 100 } },
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
    });
    const participants = collectOwnedHorizontalParticipants(editor.state.doc, 0);
    const tr = setOwnedHorizontalAlignmentInTransaction(editor.state.tr, participants, "center");

    expect(tr?.doc.nodeAt(1)?.attrs["textAlign"]).toBe("center");
    expect(tr?.doc.nodeAt(3)?.attrs["frame"]).toMatchObject({
      align: "center",
      widthMode: "fill",
      widthPercent: 100,
    });
    expect(
      setOwnedHorizontalAlignmentInTransaction(editor.state.tr, participants, "left"),
    ).not.toBeNull();

    const leftTr = setOwnedHorizontalAlignmentInTransaction(editor.state.tr, participants, "left");
    if (!leftTr) throw new Error("expected a left-alignment transaction");
    editor.view.dispatch(leftTr);
    const allLeft = collectOwnedHorizontalParticipants(editor.state.doc, 0);
    expect(setOwnedHorizontalAlignmentInTransaction(editor.state.tr, allLeft, "left")).toBeNull();

    editor.destroy();
  });

  it("aborts a transaction when any participant is stale", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "section",
          content: [
            { type: "paragraph", attrs: { textAlign: "left" } },
            { type: "paragraph", attrs: { textAlign: "right" } },
          ],
        },
      ],
    });
    const participants = collectOwnedHorizontalParticipants(editor.state.doc, 0);
    const stale = participants.map((participant, index) =>
      index === 1 ? { ...participant, pos: participant.pos + 100 } : participant,
    );

    expect(setOwnedHorizontalAlignmentInTransaction(editor.state.tr, stale, "center")).toBeNull();

    editor.destroy();
  });
});
