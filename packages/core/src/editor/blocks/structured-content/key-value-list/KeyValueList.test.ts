// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";

import {
  KEY_VALUE_LIST_NODE,
  KEY_VALUE_ROW_KEY_NODE,
  KEY_VALUE_ROW_NODE,
  KEY_VALUE_ROW_VALUE_NODE,
  emptyKeyValueListData,
} from "./content";
import "./key-value-list-definition";
import { KeyValueListAuthoringExtension } from "./key-value-list-authoring-extension";
import { keyValueListBlockDefinition } from "./key-value-list-definition";
import { KeyValueListRuntimeExtension } from "./key-value-list-runtime-extension";

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "key_value_list",
  actionId: "key-value-list",
  extensions: [createScaffoldInteractionOwnerExtension(builtInBlockRegistry)],
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function keyValueListFixture({ rowCount = 1 }: { rowCount?: number } = {}): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: KEY_VALUE_LIST_NODE,
        attrs: {
          id: "kv-list-0001",
          data: { type: "keyValueList", layout: "stacked", keyWidth: "auto" },
        },
        content: Array.from({ length: rowCount }, (_, index) => ({
          type: KEY_VALUE_ROW_NODE,
          attrs: { id: `kv-row-${String(index + 1).padStart(5, "0")}` },
          content: [
            { type: KEY_VALUE_ROW_KEY_NODE, content: [{ type: "paragraph" }] },
            { type: KEY_VALUE_ROW_VALUE_NODE, content: [{ type: "paragraph" }] },
          ],
        })),
      },
    ],
  };
}

function renderKeyValueListEditor({
  runtime = false,
  rowCount = 1,
}: { runtime?: boolean; rowCount?: number } = {}) {
  const fixture = createDisposableEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension([KEY_VALUE_LIST_NODE]),
      runtime ? KeyValueListRuntimeExtension : KeyValueListAuthoringExtension,
    ],
    content: keyValueListFixture({ rowCount }),
    editable: !runtime,
  });

  render(createElement(EditorContent, { editor: fixture.editor }));
  return fixture;
}

describe("key-value list block", () => {
  it("constructs serialized defaults in the Key-Value List feature", () => {
    expect(emptyKeyValueListData()).toEqual({
      type: "key_value_list",
      layout: "stacked",
      keyWidth: "auto",
    });
    expect(emptyKeyValueListData({ layout: "grid", keyWidth: "wide" })).toEqual({
      type: "key_value_list",
      layout: "grid",
      keyWidth: "wide",
    });
  });

  it("renders live authoring with valid definition semantics and App controls outside the list", async () => {
    const fixture = renderKeyValueListEditor();
    const add = await screen.findByRole("button", { name: "Add item" });
    const outer = document.querySelector("div.sc-course-key-value-list");
    const list = outer?.querySelector(':scope > [role="list"][data-node="key-value-list"]');
    const row = list?.querySelector('[role="listitem"][data-node="key-value-row"]');
    const key = row?.querySelector('[role="term"][data-slot="key-value-row-key"]');
    const value = row?.querySelector('[role="definition"][data-slot="key-value-row-value"]');

    expect(outer).not.toBeNull();
    expect(list?.tagName).toBe("DIV");
    expect(list?.getAttribute("data-layout")).toBe("stacked");
    expect(list?.getAttribute("data-key-width")).toBe("auto");
    expect(key?.id).toBe("sc-key-value-key-kv-row-00001");
    expect(value?.getAttribute("aria-labelledby")).toBe(key?.id);
    expect(list?.contains(add)).toBe(false);

    fixture.destroy();
  });

  it("renders the same valid definition semantics at runtime without authoring affordances", async () => {
    const fixture = renderKeyValueListEditor({ runtime: true });
    await waitFor(() => {
      expect(document.querySelector("div.sc-course-key-value-list")).not.toBeNull();
    });
    const outer = document.querySelector("div.sc-course-key-value-list");
    const list = outer?.querySelector(':scope > [role="list"][data-node="key-value-list"]');
    const row = list?.querySelector('[role="listitem"][data-node="key-value-row"]');
    const key = row?.querySelector('[role="term"][data-slot="key-value-row-key"]');
    const value = row?.querySelector('[role="definition"][data-slot="key-value-row-value"]');

    expect(list?.tagName).toBe("DIV");
    expect(key?.id).toBe("sc-key-value-key-kv-row-00001");
    expect(value?.getAttribute("aria-labelledby")).toBe(key?.id);
    expect(outer?.querySelector("button")).toBeNull();
    expect(outer?.querySelector('[class*="sc-app-key-value-list"]')).toBeNull();
    expect(outer?.querySelector("p.is-empty")).toBeNull();

    fixture.destroy();
  });

  it("adds a new pair without changing the existing row identities", async () => {
    const user = userEvent.setup();
    const fixture = renderKeyValueListEditor();

    await user.click(await screen.findByRole("button", { name: "Add item" }));

    await waitFor(() => {
      expect(fixture.json().content?.[0]?.content).toHaveLength(2);
    });
    expect(fixture.json().content?.[0]?.content?.[1]?.type).toBe(KEY_VALUE_ROW_NODE);
    expect(fixture.json().content?.[0]?.content?.[0]?.attrs?.["id"]).toBe("kv-row-00001");
    expect(fixture.json().content?.[0]?.content?.[1]?.attrs?.["id"]).toEqual(expect.any(String));

    fixture.destroy();
  });

  it("deletes one pair without changing the remaining row identity", async () => {
    const user = userEvent.setup();
    const fixture = renderKeyValueListEditor({ rowCount: 2 });

    await user.click(await screen.findByRole("button", { name: "Delete item 2" }));

    await waitFor(() => {
      expect(fixture.json().content?.[0]?.content).toHaveLength(1);
    });
    expect(fixture.json().content?.[0]?.content?.[0]?.attrs?.["id"]).toBe("kv-row-00001");

    fixture.destroy();
  });

  it("keeps the final pair and explains why its delete action is unavailable", async () => {
    const user = userEvent.setup();
    const fixture = renderKeyValueListEditor();
    const deleteButton = await screen.findByRole("button", { name: "Delete item 1" });

    expect(deleteButton).toHaveAttribute("aria-disabled", "true");
    expect(deleteButton).toHaveAccessibleDescription(
      "A key-value list must contain at least one item.",
    );
    await user.click(deleteButton);
    expect(fixture.json().content?.[0]?.content).toHaveLength(1);

    fixture.destroy();
  });

  it("renders a text-only Add item affordance", async () => {
    const fixture = renderKeyValueListEditor();
    const add = await screen.findByRole("button", { name: "Add item" });

    expect(add.classList.contains("sc-app-block-add--item")).toBe(true);
    expect(add.classList.contains("sc-app-key-value-list-add")).toBe(true);
    expect(add).toHaveTextContent(/^Add item$/);
    expect(add.querySelector("svg")).toBeNull();
    expect(add.querySelector('[class*="sc-app-key-value-list-add__"]')).toBeNull();
    fixture.destroy();
  });

  it("exposes icon-based layout choices in the block bubble menu", () => {
    const layout = keyValueListBlockDefinition.quickMenu?.controls.find(
      (control) => control.name === "layout",
    );

    expect(layout).toMatchObject({ kind: "select", presentation: "segmented" });
    if (!layout || layout.kind !== "select") throw new Error("Expected layout quick-menu control.");
    expect(layout.options?.every((option) => option.icon)).toBe(true);
  });
});
