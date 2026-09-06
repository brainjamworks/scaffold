// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { SemanticLabel } from "@/composition/model/semantic-label-extension";
import { resolveStableNode } from "@/document/model/identity/resolve-stable-node";
import { MAX_SEMANTIC_LABEL_LENGTH } from "@/document/model/document-tree/semantic-labels";
import { createAuthoringNodeTarget } from "@/editor/prosemirror/authoring-target";
import { createTestNodeIdentityExtension } from "@/editor/testing";

import { setSemanticLabelChecked } from "./semantic-label";

const editors: Editor[] = [];

afterEach(() => {
  while (editors.length > 0) editors.pop()!.destroy();
});

describe("setSemanticLabelChecked", () => {
  it("normalizes an authored label and preserves other node attributes", () => {
    const editor = makeEditor();
    const target = requireParagraph(editor, "paragraph-a");

    const result = setSemanticLabelChecked({
      tr: editor.state.tr,
      target,
      value: "  Author\n  overview\t ",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tr.doc.nodeAt(target.pos)?.attrs).toMatchObject({
      id: "paragraph-a",
      semanticLabel: "Author overview",
    });
    expect(editor.state.doc.nodeAt(target.pos)?.attrs["semanticLabel"]).toBeNull();
  });

  it("stores null when a blank draft clears the override", () => {
    const editor = makeEditor(paragraph("paragraph-a", "Learner content", "Old outline label"));
    const target = requireParagraph(editor, "paragraph-a");

    const result = setSemanticLabelChecked({ tr: editor.state.tr, target, value: "  \n " });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tr.doc.nodeAt(target.pos)?.attrs["semanticLabel"]).toBeNull();
  });

  it("rejects an overlong normalized label without mutating the transaction", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;

    const result = setSemanticLabelChecked({
      tr,
      target: requireParagraph(editor, "paragraph-a"),
      value: ` ${"A".repeat(MAX_SEMANTIC_LABEL_LENGTH + 1)} `,
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "semantic_label_too_long" }),
    });
    expect(tr.steps).toHaveLength(0);
    expect(tr.doc.eq(editor.state.doc)).toBe(true);
  });

  it("dispatches one undoable transaction through a freshly resolved authoring target", () => {
    const editor = makeEditor();
    const target = createAuthoringNodeTarget(editor, {
      id: "paragraph-a",
      nodeType: "paragraph",
    });
    const transactionListener = vi.fn();
    editor.on("transaction", transactionListener);

    const result = target.transact((tr, resolved) =>
      setSemanticLabelChecked({ tr, target: resolved, value: "Author overview" }),
    );

    expect(result.ok).toBe(true);
    expect(transactionListener).toHaveBeenCalledTimes(1);
    expect(target.read()?.node.attrs["semanticLabel"]).toBe("Author overview");
    expect(editor.commands.undo()).toBe(true);
    expect(target.read()?.node.attrs["semanticLabel"]).toBeNull();
    expect(editor.commands.redo()).toBe(true);
    expect(target.read()?.node.attrs["semanticLabel"]).toBe("Author overview");
  });

  it("does not copy the author-only override onto the paragraph created by a split", () => {
    const editor = makeEditor(paragraph("paragraph-a", "Learner content", "Author overview"));
    editor.commands.setTextSelection(8);

    expect(editor.commands.splitBlock()).toBe(true);

    const labels: unknown[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === "paragraph") labels.push(node.attrs["semanticLabel"]);
    });
    expect(labels).toEqual(["Author overview", null]);
  });

  it("preserves the override in JSON reloads without rendering learner-visible HTML", () => {
    const editor = makeEditor(paragraph("paragraph-a", "Learner content", "Author overview"));
    const saved = editor.getJSON();

    expect(saved.content?.[0]?.attrs?.["semanticLabel"]).toBe("Author overview");
    expect(editor.getHTML()).not.toContain("Author overview");

    const reloaded = makeEditor(saved.content?.[0]);
    expect(reloaded.getJSON().content?.[0]?.attrs?.["semanticLabel"]).toBe("Author overview");
  });
});

function makeEditor(content: JSONContent = paragraph("paragraph-a", "Learner content")): Editor {
  const editor = new Editor({
    extensions: [StarterKit, SemanticLabel, createTestNodeIdentityExtension()],
    content: { type: "doc", content: [content] },
  });
  editors.push(editor);
  return editor;
}

function requireParagraph(editor: Editor, id: string) {
  const target = resolveStableNode(editor.state.doc, { id, nodeType: "paragraph" });
  if (target.status !== "ready") throw new Error(`Expected paragraph ${id}`);
  return target;
}

function paragraph(id: string, text: string, semanticLabel: string | null = null): JSONContent {
  return {
    type: "paragraph",
    attrs: { id, semanticLabel },
    content: [{ type: "text", text }],
  };
}
