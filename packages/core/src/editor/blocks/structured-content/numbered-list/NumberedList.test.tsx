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
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";

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
import "./numbered-list-definition";
import { NumberedListAuthoringExtension } from "./numbered-list-authoring-extension";
import { NumberedListNode } from "./node";
import { NumberedListItemNode, NumberedListTitleNode } from "./slots";

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "numbered_list",
  catalogId: "numbered-list",
  extensions: [createScaffoldInteractionOwnerExtension(builtInBlockRegistry)],
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
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
            attrs: { id: "numbered-list-item-two", status: "neutral" },
            content: numberedListItemContent("Second numbered item"),
          },
          {
            type: NUMBERED_LIST_ITEM_NODE,
            attrs: { id: "numbered-list-item-three", status: "neutral" },
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

function makeDisposableNumberedListEditor(content: JSONContent = numberedListFixture()) {
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
      NumberedListAuthoringExtension,
    ],
    content,
  });

  render(<EditorContent editor={fixture.editor} />);

  return fixture;
}

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

  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
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
    const insertContent = builtInInsertCatalog.getById("numbered-list")?.content() as
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
