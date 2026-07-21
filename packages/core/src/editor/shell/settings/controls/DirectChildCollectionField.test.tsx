// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { useMemo } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import {
  createAuthoringNodeTarget,
  useAuthoringNodeTarget,
} from "@/editor/prosemirror/authoring-target";
import { EmptyScaffoldRichTextDocument } from "@/schemas/rich-text";
import { ImageBlockAttrsSchema } from "@scaffold/contracts";

import { DirectChildCollectionField } from "./DirectChildCollectionField";

vi.mock("@/editor/media/authoring/picker/LazyFilePickerModal", () => ({
  FilePickerModal: ({
    open,
    onResolved,
  }: {
    open: boolean;
    onResolved: (value: unknown) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onResolved({
            source: "upload",
            mediaType: "image",
            upload: { id: "managed-new", url: "blob:managed-new" },
            alt: "New image",
          })
        }
      >
        Resolve managed image
      </button>
    ) : null,
}));

const ItemDataSchema = z.object({
  image: ImageBlockAttrsSchema.nullable(),
  caption: z.object({ type: z.literal("doc"), content: z.array(z.unknown()).optional() }),
});

const CollectionOwnerNode = Node.create({
  name: "settings_collection_owner",
  group: "block",
  content: "settings_collection_item*",
  addAttributes() {
    return { id: { default: null }, data: { default: {} } };
  },
  parseHTML() {
    return [{ tag: "div[data-settings-collection-owner]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-settings-collection-owner": "" }, 0];
  },
});

const CollectionItemNode = Node.create({
  name: "settings_collection_item",
  group: "block",
  atom: true,
  addAttributes() {
    return { id: { default: null }, data: { default: null } };
  },
  parseHTML() {
    return [{ tag: "div[data-settings-collection-item]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-settings-collection-item": "" }];
  },
});

const editors: Editor[] = [];

afterEach(() => {
  cleanup();
  while (editors.length > 0) editors.pop()?.destroy();
});

const descriptor = {
  id: "images",
  childNodeType: "settings_collection_item",
  attr: "data",
  schema: ItemDataSchema,
  initialValue: { image: null, caption: EmptyScaffoldRichTextDocument },
  itemLabel: "Image",
  addLabel: "Add image",
  referenceStyle: "lower-alpha" as const,
  fields: [
    {
      kind: "image" as const,
      name: "image",
      label: "Image file",
      mediaStorage: "canonical" as const,
    },
    {
      kind: "richText" as const,
      name: "caption",
      label: "Caption",
      placeholder: "Describe this image",
    },
  ],
};

describe("DirectChildCollectionField", () => {
  it("projects direct children, derives references, and applies immediate checked actions", async () => {
    const editor = makeEditor();
    renderField(editor);

    expect(screen.getByRole("group", { name: "Image (a)" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Image (b)" })).toBeInTheDocument();

    await userEvent.type(screen.getAllByRole("textbox", { name: "Caption" })[0]!, "Caption A");
    await waitFor(() => {
      expect(JSON.stringify(readItems(editor)[0]?.caption)).toContain("Caption A");
    });
    expect(editor.commands.undo()).toBe(true);
    expect(JSON.stringify(readItems(editor)[0]?.caption)).not.toContain("Caption A");
    expect(editor.commands.redo()).toBe(true);
    expect(JSON.stringify(readItems(editor)[0]?.caption)).toContain("Caption A");

    await userEvent.click(screen.getAllByRole("button", { name: "Replace image" })[0]!);
    await userEvent.click(screen.getByRole("button", { name: "Resolve managed image" }));

    await waitFor(() => {
      expect(readItems(editor)[0]?.image).toEqual({
        mode: "managed",
        mediaId: "managed-new",
        alt: "New image",
      });
    });
    expect(editor.commands.undo()).toBe(true);
    expect(readItems(editor)[0]?.image).toEqual({
      mode: "external",
      src: "https://example.test/a.jpg",
      alt: "A",
    });
    expect(editor.commands.redo()).toBe(true);
    expect(readItems(editor)[0]?.image).toEqual({
      mode: "managed",
      mediaId: "managed-new",
      alt: "New image",
    });
    expect(readItems(editor)[1]?.image).toEqual({
      mode: "external",
      src: "https://example.test/b.jpg",
      alt: "B",
    });

    await userEvent.click(screen.getByRole("button", { name: "Remove Image (a)" }));
    expect(readItemIds(editor)).toEqual(["item-b"]);

    await userEvent.click(screen.getByRole("button", { name: "Add image" }));
    expect(readItemIds(editor)).toHaveLength(2);
    expect(readItems(editor)[1]).toEqual({
      image: null,
      caption: EmptyScaffoldRichTextDocument,
    });

    expect(editor.commands.undo()).toBe(true);
    expect(readItemIds(editor)).toEqual(["item-b"]);
  });

  it("refreshes projected rows from outer transactions", async () => {
    const editor = makeEditor();
    renderField(editor);

    editor.view.dispatch(
      editor.state.tr.setNodeAttribute(1, "data", {
        image: { mode: "external", src: "https://example.test/updated.jpg", alt: "Updated" },
        caption: EmptyScaffoldRichTextDocument,
      }),
    );

    await waitFor(() => {
      expect(screen.getByAltText("Updated")).toBeInTheDocument();
    });
    expect(screen.getAllByRole("group", { name: /Image \([ab]\)/ })).toHaveLength(2);
  });

  it("keeps the live owner through movement, deletion, and undo", async () => {
    const editor = makeEditor();
    renderField(editor);
    const paragraph = editor.state.schema.nodes["paragraph"]?.create();
    if (!paragraph) throw new Error("Expected the paragraph node type");
    editor.view.dispatch(editor.state.tr.insert(0, paragraph));
    const transactionListener = vi.fn();
    editor.on("transaction", transactionListener);

    await userEvent.click(screen.getByRole("button", { name: "Add image" }));

    expect(transactionListener).toHaveBeenCalledTimes(1);
    expect(readItemIds(editor)).toHaveLength(3);

    const ownerPos = findNodePos(editor, "settings_collection_owner");
    const owner = editor.state.doc.nodeAt(ownerPos);
    if (!owner) throw new Error("Expected the collection owner");
    editor.view.dispatch(editor.state.tr.delete(ownerPos, ownerPos + owner.nodeSize));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/target|owner/i);
    });

    expect(editor.commands.undo()).toBe(true);
    await waitFor(() => {
      expect(screen.getAllByRole("group", { name: /Image \([ab]\)/ })).toHaveLength(2);
    });
  });
});

function makeEditor(): Editor {
  const editor = new Editor({
    extensions: [StarterKit, CollectionOwnerNode, CollectionItemNode],
    content: {
      type: "doc",
      content: [
        {
          type: "settings_collection_owner",
          attrs: { id: "owner-a", data: {} },
          content: [
            item("item-a", "https://example.test/a.jpg", "A"),
            item("item-b", "https://example.test/b.jpg", "B"),
          ],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function item(id: string, src: string, alt: string) {
  return {
    type: "settings_collection_item",
    attrs: {
      id,
      data: {
        image: { mode: "external", src, alt },
        caption: EmptyScaffoldRichTextDocument,
      },
    },
  };
}

function renderField(editor: Editor) {
  render(
    <ScaffoldServicesProvider
      ports={{
        media: {
          resolve: async (mediaId) => `https://cdn.example.test/${mediaId}.jpg`,
          upload: vi.fn(),
        },
      }}
    >
      <DirectChildCollectionFieldHarness editor={editor} />
    </ScaffoldServicesProvider>,
  );
}

function DirectChildCollectionFieldHarness({ editor }: { editor: Editor }) {
  useAuthoringNodeTarget(editor, {
    id: "owner-a",
    nodeType: "settings_collection_owner",
  });
  const target = useMemo(
    () =>
      createAuthoringNodeTarget(editor, {
        id: "owner-a",
        nodeType: "settings_collection_owner",
      }),
    [editor],
  );
  return <DirectChildCollectionField descriptor={descriptor} target={target} />;
}

function readItems(editor: Editor): Array<z.infer<typeof ItemDataSchema>> {
  const owner = editor.state.doc.nodeAt(findNodePos(editor, "settings_collection_owner"));
  return owner
    ? Array.from({ length: owner.childCount }, (_, index) => owner.child(index).attrs["data"])
    : [];
}

function readItemIds(editor: Editor): string[] {
  const owner = editor.state.doc.nodeAt(findNodePos(editor, "settings_collection_owner"));
  return owner
    ? Array.from({ length: owner.childCount }, (_, index) => owner.child(index).attrs["id"])
    : [];
}

function findNodePos(editor: Editor, nodeType: string): number {
  let result: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== nodeType) return true;
    result = pos;
    return false;
  });
  if (result === null) throw new Error(`Expected ${nodeType}`);
  return result;
}
