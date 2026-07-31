import { Editor, Node as TiptapNode } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { render as renderBrowserReact } from "vitest-browser-react";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import type { SettingsFormDefinition } from "@/editor/configuration/settings-sheet";
import {
  createAuthoringNodeTarget,
  useAuthoringNodeTarget,
} from "@/editor/prosemirror/authoring-target";
import "@/styles/globals.css";

import { SettingsForm } from "./SettingsForm";

const ItemDataSchema = z.object({ label: z.string() });

const CollectionOwnerNode = TiptapNode.create({
  name: "mixed_settings_owner",
  group: "block",
  content: "mixed_settings_item*",
  addAttributes() {
    return { id: { default: null }, data: { default: {} } };
  },
  parseHTML() {
    return [{ tag: "div[data-mixed-settings-owner]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-mixed-settings-owner": "" }, 0];
  },
});

const CollectionItemNode = TiptapNode.create({
  name: "mixed_settings_item",
  group: "block",
  atom: true,
  addAttributes() {
    return { id: { default: null }, data: { default: null } };
  },
  parseHTML() {
    return [{ tag: "div[data-mixed-settings-item]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-mixed-settings-item": "" }];
  },
});

const definition: SettingsFormDefinition = {
  sections: [
    {
      id: "content",
      title: "Content",
      items: [
        { kind: "text", name: "before", label: "Before collection" },
        {
          kind: "directChildCollection",
          id: "items",
          childNodeType: "mixed_settings_item",
          attr: "data",
          schema: ItemDataSchema,
          initialValue: { label: "" },
          itemLabel: "Item",
          addLabel: "Add item",
          fields: [{ kind: "text", name: "label", label: "Item label" }],
        },
        { kind: "textarea", name: "after", label: "After collection" },
      ],
    },
  ],
};

describe("SettingsForm collection items", () => {
  it("keeps mixed item order and collection add/remove history in Chromium", async () => {
    const editor = createEditor();
    const rendered = await renderBrowserReact(<MixedSettingsForm editor={editor} />);

    try {
      const before = requireElement(document, 'input[name="before"]').closest(".sc-field");
      const collection = requireElement(document, ".sc-settings-collection");
      const after = requireElement(document, 'textarea[name="after"]').closest(".sc-field");
      if (!before || !after) throw new Error("Expected scalar settings field wrappers");

      expect(before.compareDocumentPosition(collection) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(collection.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(document.querySelectorAll('.sc-settings-collection__item[role="group"]')).toHaveLength(
        1,
      );

      requireButton("Add item").click();
      await waitForCondition(() => readItemIds(editor).length === 2);
      const addedIds = readItemIds(editor);
      expect(addedIds[0]).toBe("item-a");
      expect(addedIds[1]).toMatch(/^[0-9A-Z_a-z-]{12}$/);

      expect(editor.commands.undo()).toBe(true);
      await waitForCondition(() => readItemIds(editor).length === 1);
      expect(editor.commands.redo()).toBe(true);
      await waitForCondition(() => readItemIds(editor).length === 2);

      requireElement<HTMLButtonElement>(document, 'button[aria-label="Remove Item 1"]').click();
      await waitForCondition(() => readItemIds(editor).length === 1);
      expect(readItemIds(editor)).toEqual([addedIds[1]]);
      expect(editor.commands.undo()).toBe(true);
      await waitForCondition(() => readItemIds(editor).length === 2);
    } finally {
      await rendered.unmount();
      editor.destroy();
    }
  });
});

function MixedSettingsForm({ editor }: { editor: Editor }) {
  const form = useForm({ defaultValues: { before: "Before", after: "After" } });
  useAuthoringNodeTarget(editor, { id: "owner-a", nodeType: "mixed_settings_owner" });
  const target = useMemo(
    () =>
      createAuthoringNodeTarget(editor, {
        id: "owner-a",
        nodeType: "mixed_settings_owner",
      }),
    [editor],
  );

  return <SettingsForm definition={definition} form={form} authoringTarget={target} />;
}

function createEditor(): Editor {
  return new Editor({
    extensions: [StarterKit, CollectionOwnerNode, CollectionItemNode],
    content: {
      type: "doc",
      content: [
        {
          type: "mixed_settings_owner",
          attrs: { id: "owner-a", data: {} },
          content: [
            {
              type: "mixed_settings_item",
              attrs: { id: "item-a", data: { label: "First" } },
            },
          ],
        },
      ],
    },
  });
}

function readItemIds(editor: Editor): string[] {
  const owner = editor.state.doc.firstChild;
  return owner
    ? Array.from({ length: owner.childCount }, (_, index) => owner.child(index).attrs["id"])
    : [];
}

function requireButton(name: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  if (!button) throw new Error(`Expected button named ${name}`);
  return button;
}

function requireElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element matching ${selector}`);
  return element;
}

async function waitForCondition(condition: () => boolean, timeout = 2_000): Promise<void> {
  const started = performance.now();
  while (!condition() && performance.now() - started < timeout) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  expect(condition()).toBe(true);
}
