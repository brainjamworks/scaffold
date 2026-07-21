// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import {
  insertDirectChildSettingsItemChecked,
  readDirectChildSettingsItems,
  removeDirectChildSettingsItemChecked,
  updateDirectChildSettingsItemChecked,
} from "./content-collections";

const ItemSchema = z.object({ title: z.string().min(1) });

const CollectionOwnerNode = Node.create({
  name: "test_collection_owner",
  group: "block",
  content: "(test_collection_item | test_collection_nest)+",
  addAttributes() {
    return { id: { default: null }, label: { default: "owner" } };
  },
  renderHTML() {
    return ["div", 0];
  },
});

const OtherOwnerNode = Node.create({
  name: "test_other_collection_owner",
  group: "block",
  content: "test_collection_item+",
  addAttributes() {
    return { id: { default: null } };
  },
  renderHTML() {
    return ["div", 0];
  },
});

const CollectionNestNode = Node.create({
  name: "test_collection_nest",
  content: "test_collection_item+",
  addAttributes() {
    return { id: { default: null } };
  },
  renderHTML() {
    return ["div", 0];
  },
});

const CollectionItemNode = Node.create({
  name: "test_collection_item",
  atom: true,
  addAttributes() {
    return {
      id: { default: null },
      data: { default: { title: "Untitled" } },
      preserved: { default: "yes" },
    };
  },
  renderHTML() {
    return ["div"];
  },
});

const OtherItemNode = Node.create({
  name: "test_other_collection_item",
  atom: true,
  addAttributes() {
    return { id: { default: null }, data: { default: { title: "Other" } } };
  },
  renderHTML() {
    return ["div"];
  },
});

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function makeEditor(extraContent: Record<string, unknown>[] = []) {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      CollectionOwnerNode,
      OtherOwnerNode,
      CollectionNestNode,
      CollectionItemNode,
      OtherItemNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "test_collection_owner",
          attrs: { id: "owner-a", label: "preserve-owner" },
          content: [
            {
              type: "test_collection_item",
              attrs: { id: "item-a", data: { title: "Alpha" }, preserved: "alpha-meta" },
            },
            {
              type: "test_collection_nest",
              attrs: { id: "nest-a" },
              content: [
                {
                  type: "test_collection_item",
                  attrs: { id: "nested-item", data: { title: "Nested" } },
                },
              ],
            },
            {
              type: "test_collection_item",
              attrs: { id: "item-b", data: { title: "Beta" }, preserved: "beta-meta" },
            },
          ],
        },
        {
          type: "test_other_collection_owner",
          attrs: { id: "owner-b" },
          content: [
            {
              type: "test_collection_item",
              attrs: { id: "item-c", data: { title: "Gamma" } },
            },
          ],
        },
        ...extraContent,
      ],
    },
  });
  editors.push(editor);
  return editor;
}

const target = {
  ownerId: "owner-a",
  ownerNodeType: "test_collection_owner",
  childNodeType: "test_collection_item",
  attr: "data",
  schema: ItemSchema,
};

describe("checked direct-child content collections", () => {
  it("reads matching direct children in document order and excludes nested matches", () => {
    const editor = makeEditor();

    expect(readDirectChildSettingsItems({ doc: editor.state.doc, ...target })).toEqual({
      ok: true,
      items: [
        { id: "item-a", value: { title: "Alpha" } },
        { id: "item-b", value: { title: "Beta" } },
      ],
    });
  });

  it("inserts a schema-valid direct child with the supplied stable identity", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;

    const result = insertDirectChildSettingsItemChecked({
      tr,
      ...target,
      childId: "item-new",
      value: { title: "New" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(readDirectChildSettingsItems({ doc: result.tr.doc, ...target })).toEqual({
      ok: true,
      items: [
        { id: "item-a", value: { title: "Alpha" } },
        { id: "item-b", value: { title: "Beta" } },
        { id: "item-new", value: { title: "New" } },
      ],
    });
    expect(editor.state.doc.eq(result.tr.doc)).toBe(false);
  });

  it("updates one direct child while preserving parent and sibling attrs", () => {
    const editor = makeEditor();
    const result = updateDirectChildSettingsItemChecked({
      tr: editor.state.tr,
      ...target,
      childId: "item-a",
      value: { title: "Updated" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const owner = result.tr.doc.firstChild;
    expect(owner?.attrs["label"]).toBe("preserve-owner");
    expect(owner?.child(0).attrs).toMatchObject({
      id: "item-a",
      data: { title: "Updated" },
      preserved: "alpha-meta",
    });
    expect(owner?.child(2).attrs).toMatchObject({
      id: "item-b",
      data: { title: "Beta" },
      preserved: "beta-meta",
    });
  });

  it("removes only the requested direct child", () => {
    const editor = makeEditor();
    const result = removeDirectChildSettingsItemChecked({
      tr: editor.state.tr,
      ...target,
      childId: "item-a",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(readDirectChildSettingsItems({ doc: result.tr.doc, ...target })).toEqual({
      ok: true,
      items: [{ id: "item-b", value: { title: "Beta" } }],
    });
    expect(result.tr.doc.child(1).attrs["id"]).toBe("owner-b");
  });

  it("rejects stale, nested, wrong-type, duplicate-id, and invalid-value targets without steps", () => {
    const editor = makeEditor();
    const transactions = Array.from({ length: 8 }, () => editor.state.tr);
    const cases = [
      updateDirectChildSettingsItemChecked({
        tr: transactions[0]!,
        ...target,
        ownerId: "missing-owner",
        childId: "item-a",
        value: { title: "No" },
      }),
      updateDirectChildSettingsItemChecked({
        tr: transactions[1]!,
        ...target,
        ownerNodeType: "test_other_collection_owner",
        childId: "item-a",
        value: { title: "No" },
      }),
      updateDirectChildSettingsItemChecked({
        tr: transactions[2]!,
        ...target,
        childId: "nested-item",
        value: { title: "No" },
      }),
      updateDirectChildSettingsItemChecked({
        tr: transactions[3]!,
        ...target,
        childNodeType: "test_other_collection_item",
        childId: "item-a",
        value: { title: "No" },
      }),
      updateDirectChildSettingsItemChecked({
        tr: transactions[4]!,
        ...target,
        childId: "missing-item",
        value: { title: "No" },
      }),
      updateDirectChildSettingsItemChecked({
        tr: transactions[5]!,
        ...target,
        childId: "item-a",
        value: { title: "" },
      }),
      insertDirectChildSettingsItemChecked({
        tr: transactions[6]!,
        ...target,
        childId: "item-c",
        value: { title: "Duplicate" },
      }),
      removeDirectChildSettingsItemChecked({
        tr: transactions[7]!,
        ...target,
        childId: "item-c",
      }),
    ];

    expect(cases.map((result) => (result.ok ? "ok" : result.issue.code))).toEqual([
      "missing_collection_owner",
      "wrong_collection_owner_type",
      "collection_child_not_direct",
      "wrong_collection_child_type",
      "missing_collection_child",
      "invalid_collection_item_value",
      "duplicate_collection_child_id",
      "collection_child_not_direct",
    ]);
    expect(cases.every((result) => !result.ok)).toBe(true);
    expect(transactions.every((tr) => tr.steps.length === 0 && tr.doc.eq(editor.state.doc))).toBe(
      true,
    );
  });

  it("rejects a duplicated collection owner identity without adding transaction steps", () => {
    const editor = makeEditor([
      {
        type: "test_collection_owner",
        attrs: { id: "owner-a" },
        content: [
          {
            type: "test_collection_item",
            attrs: { id: "item-duplicate-owner", data: { title: "Duplicate owner" } },
          },
        ],
      },
    ]);
    const tr = editor.state.tr;

    const result = updateDirectChildSettingsItemChecked({
      tr,
      ...target,
      childId: "item-a",
      value: { title: "No" },
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "duplicate_collection_owner" }),
    });
    expect(tr.steps).toHaveLength(0);
    expect(tr.doc.eq(editor.state.doc)).toBe(true);
  });
});
