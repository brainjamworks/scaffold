// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import { Transform } from "@tiptap/pm/transform";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import {
  APPROVED_SEMANTIC_MEMBER_FAMILY_CASES,
  SEMANTIC_LIFECYCLE_APPLICATION,
  projectSemanticLifecycleDocument,
  requireLifecycleNodeById,
} from "@/document/model/semantic-document/testing/semantic-publication-lifecycle-fixtures";

import {
  deleteNodeChecked,
  duplicateNodeChecked,
  insertNodeChecked,
  replaceNodeContentChecked,
  replaceRangeWithNodeChecked,
} from "./checked-transactions";

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

function makeEditor() {
  const editor = new Editor({
    extensions: [StarterKit.configure({ undoRedo: false })],
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "First" }],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

describe("checked transaction primitives", () => {
  it("inserts a valid node into a transform without dispatching", () => {
    const editor = makeEditor();
    const node = editor.schema.nodes.paragraph!.createChecked(null, editor.schema.text("Second"));

    const result = insertNodeChecked({
      tr: editor.state.tr,
      pos: editor.state.doc.content.size,
      node,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tr.doc.toJSON()).toMatchObject({
      content: [{ type: "paragraph" }, { type: "paragraph", content: [{ text: "Second" }] }],
    });
    expect(editor.getJSON().content).toHaveLength(1);
  });

  it("rejects an invalid insert position before mutating the transform", () => {
    const editor = makeEditor();
    const node = editor.schema.nodes.paragraph!.createChecked();
    const tr = editor.state.tr;

    const result = insertNodeChecked({
      tr,
      pos: editor.state.doc.content.size + 10,
      node,
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_insert_position" }),
    });
    expect(tr.doc.eq(editor.state.doc)).toBe(true);
  });

  it("rejects nodes that cannot be inserted at the target position", () => {
    const editor = makeEditor();
    const node = editor.schema.nodes.paragraph!.createChecked();
    const tr = editor.state.tr;

    const result = insertNodeChecked({
      tr,
      pos: 2,
      node,
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_insert_target" }),
    });
    expect(tr.doc.eq(editor.state.doc)).toBe(true);
  });

  it("replaces a text range with a valid node without dispatching", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Before /callout" }],
        },
      ],
    });
    const node = editor.schema.nodes.paragraph!.createChecked(null, editor.schema.text("Inserted"));
    const slashPos = findTextPosition(editor, "/callout");

    const result = replaceRangeWithNodeChecked({
      tr: editor.state.tr,
      from: slashPos,
      to: slashPos + "/callout".length,
      node,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tr.doc.textContent).toContain("Inserted");
    expect(editor.state.doc.textContent).toBe("Before /callout");
  });

  it("rejects invalid replace ranges before mutating the transform", () => {
    const editor = makeEditor();
    const node = editor.schema.nodes.paragraph!.createChecked();
    const tr = editor.state.tr;

    const result = replaceRangeWithNodeChecked({
      tr,
      from: 10,
      to: 2,
      node,
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_replace_range" }),
    });
    expect(tr.doc.eq(editor.state.doc)).toBe(true);
  });

  it("replaces node content without replacing the node itself", () => {
    const editor = makeEditor();

    const result = replaceNodeContentChecked({
      tr: editor.state.tr,
      pos: 0,
      nodeType: "paragraph",
      content: [editor.schema.text("Changed")],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tr.doc.toJSON()).toMatchObject({
      content: [{ type: "paragraph", content: [{ text: "Changed" }] }],
    });
    expect(editor.state.doc.textContent).toBe("First");
  });

  it("rejects replacement content that does not fit the target node", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;

    const result = replaceNodeContentChecked({
      tr,
      pos: 0,
      nodeType: "paragraph",
      content: [editor.schema.nodes.paragraph!.createChecked()],
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_replacement_content" }),
    });
    expect(tr.doc.eq(editor.state.doc)).toBe(true);
  });

  it("deletes a valid node without dispatching", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "First" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Second" }],
        },
      ],
    });
    const secondPos = findTopLevelTextNodePosition(editor, "Second");

    const result = deleteNodeChecked({
      tr: editor.state.tr,
      pos: secondPos,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tr.doc.textContent).toBe("First");
    expect(editor.state.doc.textContent).toBe("FirstSecond");
  });

  it("rejects invalid delete positions before mutating the transform", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;

    const result = deleteNodeChecked({
      tr,
      pos: editor.state.doc.content.size + 1,
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_delete_position" }),
    });
    expect(tr.doc.eq(editor.state.doc)).toBe(true);
  });

  it("duplicates a valid node without dispatching", () => {
    const editor = makeEditor();

    const result = duplicateNodeChecked({
      tr: editor.state.tr,
      pos: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.node.textContent).toBe("First");
    expect(result.tr.doc.toJSON()).toMatchObject({
      content: [
        { type: "paragraph", content: [{ text: "First" }] },
        { type: "paragraph", content: [{ text: "First" }] },
      ],
    });
    expect(editor.getJSON().content).toHaveLength(1);
  });

  it("requires the mounted Block lookup when regenerating duplicate identities", () => {
    const editor = makeEditor();
    const duplication = vi.fn(({ content }) => content);
    const blockDuplications = Object.freeze({
      getByNodeType: (nodeType: string) => (nodeType === "paragraph" ? duplication : undefined),
      hasNodeType: (nodeType: string) => nodeType === "paragraph",
    });

    const result = duplicateNodeChecked({
      tr: editor.state.tr,
      pos: 0,
      regenerateNodeIds: true,
      blockDuplications,
    });

    expect(result.ok).toBe(true);
    expect(duplication).toHaveBeenCalledOnce();
  });

  it("rejects a mounted duplication contract fault before checked insertion", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;
    const before = tr.doc.toJSON();
    const blockDuplications = Object.freeze({
      getByNodeType: (nodeType: string) =>
        nodeType === "paragraph"
          ? ({ content }: { content: JSONContent }) => ({ ...content, type: "heading" })
          : undefined,
      hasNodeType: (nodeType: string) => nodeType === "paragraph",
    });

    expect(() =>
      duplicateNodeChecked({
        tr,
        pos: 0,
        regenerateNodeIds: true,
        blockDuplications,
      }),
    ).toThrow(/Block duplication operation for "paragraph" changed a node type/);
    expect(tr.doc.toJSON()).toEqual(before);
    expect(tr.steps).toHaveLength(0);
  });

  it.each(APPROVED_SEMANTIC_MEMBER_FAMILY_CASES)(
    "$label checked duplicate regenerates owner and public-descendant identity",
    (family) => {
      const doc = family.createDocument();
      const source = requireLifecycleNodeById(doc, family.ownerId);
      const sourceBefore = source.node.toJSON();
      const originalDocument = doc.toJSON();
      const tr = new Transform(doc);

      const result = duplicateNodeChecked({
        tr,
        pos: source.pos,
        regenerateNodeIds: true,
        blockDuplications: SEMANTIC_LIFECYCLE_APPLICATION.capabilities.blocks.duplication,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const duplicateOwnerId = EmbeddedNodeIdSchema.parse(result.node.attrs["id"]);
      const snapshot = projectSemanticLifecycleDocument(result.tr.doc, 41);
      const sourceChildren = snapshot.itemById.get(family.ownerId)?.children ?? [];
      const duplicateChildren = snapshot.itemById.get(duplicateOwnerId)?.children ?? [];
      const sourceIdentities = new Set([
        family.ownerId,
        ...sourceChildren.map(({ id }) => id),
      ]);
      const duplicateIdentities = new Set([
        duplicateOwnerId,
        ...duplicateChildren.map(({ id }) => id),
      ]);

      expect(duplicateOwnerId).not.toBe(family.ownerId);
      expect(sourceChildren.map(({ id }) => id)).toEqual([
        family.memberIds.first,
        family.memberIds.second,
      ]);
      expect(duplicateChildren.map(({ nodeType }) => nodeType)).toEqual([
        family.memberNodeType,
        family.memberNodeType,
      ]);
      expect([...sourceIdentities].filter((id) => duplicateIdentities.has(id))).toEqual([]);
      for (const child of duplicateChildren) {
        expect(EmbeddedNodeIdSchema.safeParse(child.id).success).toBe(true);
        expect(snapshot.parentById.get(child.id)).toBe(duplicateOwnerId);
      }
      expect(result.tr.doc.nodeAt(source.pos)?.toJSON()).toEqual(sourceBefore);
      expect(doc.toJSON()).toEqual(originalDocument);
      expect(snapshot.itemById.has(family.unrelatedSiblingId)).toBe(true);
      expect(snapshot.diagnostics).toEqual([]);
    },
  );

  it("rejects invalid duplicate positions before mutating the transform", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;

    const result = duplicateNodeChecked({
      tr,
      pos: editor.state.doc.content.size + 1,
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "invalid_duplicate_position" }),
    });
    expect(tr.doc.eq(editor.state.doc)).toBe(true);
  });
});

function findTextPosition(editor: Editor, text: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (!node.isText) return true;
    const index = node.text?.indexOf(text) ?? -1;
    if (index === -1) return true;
    found = pos + index;
    return false;
  });

  if (found === null) throw new Error(`Could not find text: ${text}`);
  return found;
}

function findTopLevelTextNodePosition(editor: Editor, text: string): number {
  let found: number | null = null;

  editor.state.doc.forEach((node, offset) => {
    if (found !== null) return;
    if (node.textContent === text) {
      found = offset;
    }
  });

  if (found === null) throw new Error(`Could not find top-level node: ${text}`);
  return found;
}
