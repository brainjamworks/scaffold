// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, expect, it } from "vite-plus/test";

import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { ChecklistAuthoringExtension } from "./checklist-authoring-extension";
import {
  CHECKLIST_ITEM_NODE,
  CHECKLIST_NODE,
  checklistItemContent,
  emptyChecklistData,
} from "./content";
import "./checklist-definition";

it("constructs serialized defaults in the Checklist feature", () => {
  expect(emptyChecklistData()).toEqual({
    type: "checklist",
    showProgress: true,
    showReset: true,
  });
  expect(emptyChecklistData({ showProgress: false, showReset: false })).toEqual({
    type: "checklist",
    showProgress: false,
    showReset: false,
  });
});

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "checklist",
  catalogId: "checklist",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function checklistFixture(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: CHECKLIST_NODE,
        attrs: {
          id: "checklist-delete-fixture",
          data: emptyChecklistData(),
        },
        content: [
          {
            type: CHECKLIST_ITEM_NODE,
            attrs: { id: "checklist-item-one" },
            content: checklistItemContent("First checklist item"),
          },
          {
            type: CHECKLIST_ITEM_NODE,
            attrs: { id: "checklist-item-two" },
            content: checklistItemContent("Second checklist item"),
          },
          {
            type: CHECKLIST_ITEM_NODE,
            attrs: { id: "checklist-item-three" },
            content: checklistItemContent("Third checklist item"),
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Keep after checklist" }],
      },
    ],
  };
}

function renderChecklistEditor(content: JSONContent = checklistFixture()) {
  const fixture = createDisposableEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
      }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([CHECKLIST_NODE]),
      ChecklistAuthoringExtension,
    ],
    content,
  });

  render(createElement(EditorContent, { editor: fixture.editor }));

  return fixture;
}

it("deletes the requested checklist item from a disposable editor fixture", async () => {
  const user = userEvent.setup();
  const fixture = renderChecklistEditor();

  await user.click(
    await screen.findByRole("button", {
      name: "Delete checklist item 2",
    }),
  );

  await waitFor(() => {
    expect(screen.queryByText("Second checklist item")).toBeNull();
  });

  const checklist = fixture.json().content?.[0];
  const itemIds = checklist?.content?.map((child) => child.attrs?.["id"]);

  expect(fixture.topLevelNodeTypes()).toEqual(["checklist", "paragraph"]);
  expect(fixture.editor.state.doc.textContent).toContain("Keep after checklist");
  expect(fixture.editor.state.doc.textContent).toContain("First checklist item");
  expect(fixture.editor.state.doc.textContent).toContain("Third checklist item");
  expect(itemIds).toEqual(["checklist-item-one", "checklist-item-three"]);

  fixture.destroy();
});
