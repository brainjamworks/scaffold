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

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "key_value_list",
  catalogId: "key-value-list",
  extensions: [createScaffoldInteractionOwnerExtension(builtInBlockRegistry)],
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function keyValueListFixture(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: KEY_VALUE_LIST_NODE,
        attrs: {
          id: "kv-list-0001",
          data: { type: "keyValueList", layout: "stacked", keyWidth: "auto" },
        },
        content: [
          {
            type: KEY_VALUE_ROW_NODE,
            attrs: { id: "kv-row-00001" },
            content: [
              { type: KEY_VALUE_ROW_KEY_NODE, content: [{ type: "paragraph" }] },
              { type: KEY_VALUE_ROW_VALUE_NODE, content: [{ type: "paragraph" }] },
            ],
          },
        ],
      },
    ],
  };
}

function renderKeyValueListEditor() {
  const fixture = createDisposableEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension([KEY_VALUE_LIST_NODE]),
      KeyValueListAuthoringExtension,
    ],
    content: keyValueListFixture(),
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

  it("adds a new pair through the authoring ghost affordance", async () => {
    const user = userEvent.setup();
    const fixture = renderKeyValueListEditor();

    await user.click(await screen.findByRole("button", { name: "Add item" }));

    await waitFor(() => {
      expect(fixture.json().content?.[0]?.content).toHaveLength(2);
    });
    expect(fixture.json().content?.[0]?.content?.[1]?.type).toBe(KEY_VALUE_ROW_NODE);

    fixture.destroy();
  });

  it("renders an item-shaped add pair affordance", async () => {
    const fixture = renderKeyValueListEditor();
    const add = await screen.findByRole("button", { name: "Add item" });

    expect(add.classList.contains("sc-ghost-add--item")).toBe(true);
    expect(add.querySelector(".sc-key-value-list__add-key")).not.toBeNull();
    expect(add.querySelector(".sc-key-value-list__add-value")).not.toBeNull();
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
