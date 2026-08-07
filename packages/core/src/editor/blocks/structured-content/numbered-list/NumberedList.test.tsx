// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { NumberedListDataSchema as ContractNumberedListDataSchema } from "@scaffold/contracts";

import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createBlockInsertActions } from "@/editor/insertion/block-insert-action";
import { createInsertCatalog } from "@/editor/insertion/insert-catalog";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";
import { projectLearnerDocument } from "@/authoring/publication/document-projection";

import {
  ExtendedBlockquote,
  ExtendedBulletList,
  ExtendedCodeBlock,
  ExtendedHeading,
  ExtendedHorizontalRule,
  ExtendedListItem,
  ExtendedOrderedList,
} from "@/editor/rich-text/model/rich-text-blocks";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  NUMBERED_LIST_ITEM_NODE,
  NUMBERED_LIST_NODE,
  NUMBERED_LIST_TITLE_NODE,
  emptyNumberedListData,
  numberedListItemContent,
  numberedListTitleContent,
} from "./content";
import { numberedListBlockDefinition } from "./numbered-list-definition";
import { NumberedListAuthoringExtension } from "./numbered-list-authoring-extension";
import { NumberedListRuntimeExtension } from "./numbered-list-runtime-extension";
import { NumberedListNode } from "./node";
import { NumberedListItemNode, NumberedListTitleNode } from "./slots";

const blockInsertCatalog = createInsertCatalog(
  createBlockInsertActions([numberedListBlockDefinition]),
);

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "numbered_list",
  actionId: "numbered-list",
  extensions: [createScaffoldInteractionOwnerExtension(builtInBlockRegistry)],
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function makeEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        orderedList: false,
      }),
      ExtendedParagraph,
      ExtendedHeading,
      ExtendedBulletList,
      ExtendedOrderedList,
      ExtendedListItem,
      ExtendedBlockquote,
      ExtendedCodeBlock,
      ExtendedHorizontalRule,
      createRuntimeBlockFrameAttributesExtension([NUMBERED_LIST_NODE]),
      NumberedListTitleNode,
      NumberedListItemNode,
      NumberedListNode,
    ],
  });
}

function numberedListFixture(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: NUMBERED_LIST_NODE,
        attrs: {
          id: "numbered-list-delete-fixture",
          data: emptyNumberedListData(),
        },
        content: [
          {
            type: NUMBERED_LIST_TITLE_NODE,
            content: numberedListTitleContent("Checklist for launch"),
          },
          {
            type: NUMBERED_LIST_ITEM_NODE,
            attrs: { id: "numbered-list-item-one", status: "neutral" },
            content: numberedListItemContent("First numbered item"),
          },
          {
            type: NUMBERED_LIST_ITEM_NODE,
            attrs: { id: "numbered-list-item-two", status: "inProgress" },
            content: numberedListItemContent("Second numbered item"),
          },
          {
            type: NUMBERED_LIST_ITEM_NODE,
            attrs: { id: "numbered-list-item-three", status: "complete" },
            content: numberedListItemContent("Third numbered item"),
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Keep after numbered list" }],
      },
    ],
  };
}

it("renders an item-shaped add numbered-list affordance", async () => {
  const fixture = makeDisposableNumberedListEditor();
  const add = await screen.findByRole("button", { name: "Add item" });

  expect(add.classList.contains("sc-app-block-add--item")).toBe(true);
  expect(add.classList.contains("sc-app-numbered-list-add")).toBe(true);
  expect(add.querySelector(".sc-app-numbered-list-add__marker")).not.toBeNull();
  expect(add.textContent).toContain("+");
  fixture.destroy();
});

function makeDisposableNumberedListEditor(
  content: JSONContent = numberedListFixture(),
  { runtime = false }: { runtime?: boolean } = {},
) {
  const fixture = createDisposableEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        orderedList: false,
      }),
      ExtendedParagraph,
      ExtendedHeading,
      ExtendedBulletList,
      ExtendedOrderedList,
      ExtendedListItem,
      ExtendedBlockquote,
      ExtendedCodeBlock,
      ExtendedHorizontalRule,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension([NUMBERED_LIST_NODE]),
      runtime ? NumberedListRuntimeExtension : NumberedListAuthoringExtension,
    ],
    content,
    editable: !runtime,
  });

  render(<EditorContent editor={fixture.editor} />);

  return fixture;
}

it("separates Course presentation from App authoring controls and maps semantic states", async () => {
  const fixture = makeDisposableNumberedListEditor();

  await waitFor(() => {
    expect(
      document.querySelectorAll(".sc-course-numbered-list section[role='list'] [role='listitem']"),
    ).toHaveLength(3);
  });

  const list = document.querySelector<HTMLElement>(".sc-course-numbered-list section[role='list']");
  const markers = list?.querySelectorAll<HTMLElement>(".sc-course-numbered-list__marker");
  expect(markers?.[0]?.getAttribute("data-course-state")).toBeNull();
  expect(markers?.[1]?.getAttribute("data-course-state")).toBe("current");
  expect(markers?.[2]?.getAttribute("data-course-state")).toBe("completed");
  expect(markers?.[0]?.classList.contains("sc-app-numbered-list-status-cycle")).toBe(true);
  expect(document.querySelector(".sc-app-numbered-list-icon-picker")).not.toBeNull();
  expect(document.querySelector(".sc-course-numbered-list__delete")).not.toBeNull();
  expect(
    document.querySelector('[class^="sc-numbered-list"], [class*=" sc-numbered-list"]'),
  ).toBeNull();

  fixture.destroy();
});

it("adds at the end without changing existing numbered-list item identities", async () => {
  const user = userEvent.setup();
  const fixture = makeDisposableNumberedListEditor();

  await user.click(await screen.findByRole("button", { name: "Add item" }));

  await waitFor(() => {
    expect(fixture.json().content?.[0]?.content).toHaveLength(5);
  });

  const itemIds = fixture
    .json()
    .content?.[0]?.content?.filter((child) => child.type === NUMBERED_LIST_ITEM_NODE)
    .map((child) => child.attrs?.["id"]);
  expect(itemIds?.slice(0, 3)).toEqual([
    "numbered-list-item-one",
    "numbered-list-item-two",
    "numbered-list-item-three",
  ]);
  expect(itemIds?.[3]).toEqual(expect.any(String));

  fixture.destroy();
});

it("exposes numbered state text at runtime while keeping markers noninteractive", async () => {
  const fixture = makeDisposableNumberedListEditor(numberedListFixture(), { runtime: true });

  await waitFor(() => {
    expect(
      document.querySelectorAll(".sc-course-numbered-list section[role='list'] [role='listitem']"),
    ).toHaveLength(3);
  });

  const list = document.querySelector<HTMLElement>(".sc-course-numbered-list section[role='list']");
  const markers = list?.querySelectorAll<HTMLElement>(".sc-course-numbered-list__marker");
  expect(markers?.[0]).toHaveTextContent("Item 1");
  expect(markers?.[1]).toHaveTextContent("Item 2, in progress");
  expect(markers?.[2]).toHaveTextContent("Item 3, complete");
  expect(markers?.[0]?.tagName).toBe("SPAN");
  expect(markers?.[1]?.getAttribute("data-course-state")).toBe("current");
  expect(markers?.[2]?.getAttribute("data-course-state")).toBe("completed");
  expect(list?.querySelector("button")).toBeNull();
  expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();

  fixture.destroy();
});

it("persists an author-selected item state into learner runtime", async () => {
  const user = userEvent.setup();
  const authoring = makeDisposableNumberedListEditor();

  await user.click(
    await screen.findByRole("button", {
      name: "Set item 1 status. Current: neutral.",
    }),
  );

  await waitFor(() => {
    expect(authoring.json().content?.[0]?.content?.[1]?.attrs?.["status"]).toBe("inProgress");
  });

  const learnerContent = projectLearnerDocument(authoring.json(), builtInBlockRegistry).document;
  authoring.destroy();
  cleanup();
  const runtime = makeDisposableNumberedListEditor(learnerContent, { runtime: true });

  expect(await screen.findByText("Item 1, in progress")).toBeInTheDocument();

  runtime.destroy();
});

it("keeps the final delete action focusable and explains why it is unavailable", async () => {
  const user = userEvent.setup();
  const content = numberedListFixture();
  content.content![0]!.content = content.content![0]!.content?.slice(0, 2) ?? [];
  const fixture = makeDisposableNumberedListEditor(content);
  const deleteButton = await screen.findByRole("button", {
    name: "Delete numbered list item 1",
  });

  expect(deleteButton.getAttribute("aria-disabled")).toBe("true");
  expect(deleteButton.hasAttribute("disabled")).toBe(false);
  const explanationId = deleteButton.getAttribute("aria-describedby");
  expect(explanationId).not.toBeNull();
  expect(document.getElementById(explanationId!)).toHaveTextContent(
    "A numbered list must contain at least one item.",
  );

  deleteButton.focus();
  expect(document.activeElement).toBe(deleteButton);
  await user.click(deleteButton);
  expect(fixture.json().content?.[0]?.content).toHaveLength(2);

  fixture.destroy();
});

describe("numbered list node", () => {
  it("constructs serialized defaults in the Numbered List feature", () => {
    expect(ContractNumberedListDataSchema.parse(emptyNumberedListData())).toEqual({
      type: "numbered_list",
      showTitle: true,
      showIcon: true,
      icon: null,
    });
    expect(emptyNumberedListData({ showTitle: false, showIcon: false })).toEqual({
      type: "numbered_list",
      showTitle: false,
      showIcon: false,
      icon: null,
    });
  });

  it("models the title and list items as rich text content", () => {
    const editor = makeEditor();

    expect(editor.schema.nodes["numbered_list_title"]?.spec.content).toBe("text_content+");
    expect(editor.schema.nodes["numbered_list_item"]?.spec.content).toBe("text_content+");
    expect(editor.schema.nodes["numbered_list"]?.spec.content).toBe(
      "numbered_list_title numbered_list_item+",
    );

    editor.destroy();
  });

  it("seeds catalog content with stable block and component ids", () => {
    const insertContent = blockInsertCatalog.getById("numbered-list")?.content() as
      | JSONContent
      | undefined;

    expect(insertContent?.type).toBe("numbered_list");
    expect(insertContent?.attrs?.["id"]).toMatch(/^[0-9A-Z_a-z-]{12}$/);
    expect(insertContent?.attrs?.["data"]).toMatchObject({
      type: "numbered_list",
      showTitle: true,
      showIcon: true,
      icon: null,
    });
    expect(insertContent?.content?.[0]?.type).toBe("numbered_list_title");
    expect(insertContent?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe("Numbered list");
    expect(insertContent?.content?.slice(1).map((child) => child.type)).toEqual([
      "numbered_list_item",
      "numbered_list_item",
    ]);
    expect(insertContent?.content?.[1]?.attrs?.["id"]).toMatch(/^[0-9A-Z_a-z-]{12}$/);
    expect(insertContent?.content?.[1]?.attrs?.["status"]).toBe("neutral");
  });

  it("allows rich text toolbar blocks inside the title and list items", () => {
    const editor = makeEditor();

    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "numbered_list",
          attrs: {
            id: "block-test",
            data: {
              type: "numbered_list",
              showTitle: true,
              showIcon: true,
              icon: null,
            },
          },
          content: [
            {
              type: "numbered_list_title",
              content: [
                {
                  type: "heading",
                  attrs: { level: 1 },
                  content: [{ type: "text", text: "Outcomes" }],
                },
              ],
            },
            {
              type: "numbered_list_item",
              attrs: { id: "component-test", status: "neutral" },
              content: [
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Explain the model" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const top = editor.getJSON().content?.[0] as JSONContent | undefined;
    expect(top?.content?.[0]?.content?.[0]?.type).toBe("heading");
    expect(top?.content?.[0]?.content?.[0]?.attrs?.["level"]).toBe(1);
    expect(top?.content?.[1]?.content?.[0]?.type).toBe("bulletList");

    editor.destroy();
  });

  it("stores marker status on each list item", () => {
    const editor = makeEditor();

    const itemType = editor.schema.nodes["numbered_list_item"];
    expect(itemType).toBeDefined();

    const item = itemType?.createAndFill({
      id: "component-status",
      status: "complete",
    });
    expect(item?.attrs["status"]).toBe("complete");

    editor.destroy();
  });

  it("deletes the requested numbered list item from a disposable editor fixture", async () => {
    const user = userEvent.setup();
    const fixture = makeDisposableNumberedListEditor();

    await user.click(
      await screen.findByRole("button", {
        name: "Delete numbered list item 2",
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Second numbered item")).toBeNull();
    });

    const numberedList = fixture.json().content?.[0];
    const itemIds = numberedList?.content
      ?.filter((child) => child.type === NUMBERED_LIST_ITEM_NODE)
      .map((child) => child.attrs?.["id"]);

    expect(fixture.topLevelNodeTypes()).toEqual(["numbered_list", "paragraph"]);
    expect(fixture.editor.state.doc.textContent).toContain("Keep after numbered list");
    expect(fixture.editor.state.doc.textContent).toContain("First numbered item");
    expect(fixture.editor.state.doc.textContent).toContain("Third numbered item");
    expect(itemIds).toEqual(["numbered-list-item-one", "numbered-list-item-three"]);

    fixture.destroy();
  });
});
