// @vitest-environment jsdom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import {
  createCategoriseBinNode,
  createCategoriseItemBodyNode,
  createCategoriseItemNode,
} from "@/editor/assessment/categorise/categorise-fields-shared";
import {
  createDropdownChoiceLabelNode,
  createDropdownChoiceNode,
} from "@/editor/blocks/assessment/dropdown/dropdown-choice-shared";
import { createFillBlankNode } from "@/editor/blocks/assessment/fill-blanks/fill-blank-shared";
import { createSequencingItemNode } from "@/editor/assessment/sequencing/sequencing-fields-shared";
import {
  SelectableChoiceBodyNode,
  createSelectableChoiceNode,
} from "@/editor/blocks/assessment/shared/nodes/selectable-choice";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";

const TestContainerNode = Node.create({
  name: "identity_test_container",
  group: "block",
  content:
    "selectable_choice dropdown_choice sequencing_item categorise_bin categorise_item paragraph",

  parseHTML() {
    return [{ tag: 'div[data-node="identity-test-container"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-node": "identity-test-container" }, 0];
  },
});

describe("assessment child canonical node identity", () => {
  it("serializes every current-node identity through UniqueID as data-id", () => {
    const editor = new Editor({
      extensions: [
        StarterKit.configure({ paragraph: false, undoRedo: false }),
        ExtendedParagraph,
        TestContainerNode,
        SelectableChoiceBodyNode,
        createSelectableChoiceNode(),
        createDropdownChoiceLabelNode(),
        createDropdownChoiceNode(),
        createFillBlankNode(),
        createSequencingItemNode(),
        createCategoriseBinNode(),
        createCategoriseItemBodyNode(),
        createCategoriseItemNode(),
        UniqueID.configure({
          attributeName: "id",
          types: "all",
          updateDocument: false,
        }),
      ],
      content: identityDocument(),
    });

    try {
      const container = document.createElement("div");
      container.innerHTML = editor.getHTML();

      expectIdentity(container, "selectable-choice", "choiceId0001");
      expectIdentity(container, "dropdown-choice", "dropChoice01");
      expectIdentity(container, "fill-blank", "fillBlank001");
      expectIdentity(container, "sequencing-item", "sequence0001");
      expectIdentity(container, "categorise-bin", "category0001");
      expectIdentity(container, "categorise-item", "catItem00001");

      expect(container.querySelector("[data-choice-id]")).toBeNull();
      expect(container.querySelector("[data-blank-id]")).toBeNull();
      expect(container.querySelector("[data-bin-id]")).toBeNull();
      expect(container.querySelector("[data-item-id]")).toBeNull();
    } finally {
      editor.destroy();
    }
  });
});

function expectIdentity(container: HTMLElement, nodeName: string, id: string) {
  expect(container.querySelector(`[data-node="${nodeName}"]`)?.getAttribute("data-id")).toBe(id);
}

function identityDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "identity_test_container",
        attrs: { id: "container001" },
        content: [
          {
            type: "selectable_choice",
            attrs: { id: "choiceId0001" },
            content: [
              {
                type: "selectable_choice_body",
                attrs: { id: "choiceBody01" },
                content: [{ type: "paragraph", attrs: { id: "choicePara01" } }],
              },
            ],
          },
          {
            type: "dropdown_choice",
            attrs: { id: "dropChoice01" },
            content: [
              {
                type: "dropdown_choice_label",
                attrs: { id: "dropLabel001" },
                content: [{ type: "paragraph", attrs: { id: "dropPara0001" } }],
              },
            ],
          },
          {
            type: "sequencing_item",
            attrs: { id: "sequence0001" },
            content: [{ type: "paragraph", attrs: { id: "seqPara00001" } }],
          },
          {
            type: "categorise_bin",
            attrs: { id: "category0001" },
            content: [{ type: "paragraph", attrs: { id: "binPara00001" } }],
          },
          {
            type: "categorise_item",
            attrs: { id: "catItem00001" },
            content: [
              {
                type: "categorise_item_body",
                attrs: { id: "catBody00001" },
                content: [{ type: "paragraph", attrs: { id: "catPara00001" } }],
              },
            ],
          },
          {
            type: "paragraph",
            attrs: { id: "paragraph001" },
            content: [
              { type: "text", text: "Before " },
              {
                type: "fill_blank",
                attrs: { id: "fillBlank001", placeholder: "Answer" },
              },
              { type: "text", text: " after" },
            ],
          },
        ],
      },
    ],
  };
}
