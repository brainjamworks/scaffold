// @vitest-environment happy-dom

import { CheckSquareIcon } from "@phosphor-icons/react";
import { Editor, Node, mergeAttributes } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { createAuthoringBlockExtensions } from "@/editor/blocks/authoring-block-extensions";
import { defineConfiguration } from "@/editor/configuration/definition";
import { describeBlockContract } from "@/editor/testing";
import { assertBlockContract } from "@/editor/testing/block-contract";
import { AUTHORING_FRAME_ATTR } from "@/editor/interactions/dom/authoring-frame";
import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentChoicesGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-choices-group";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import {
  SelectableChoiceBodyNode,
  SelectableChoiceNode,
} from "@/editor/blocks/assessment/shared/nodes/selectable-choice";
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
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { EditorMovementLayer } from "@/editor/drag/view/EditorMovementLayer";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";

const TestContractDataSchema = z.object({
  label: z.string().default(""),
});

const TestContractNode = Node.create({
  name: "test_contract_block",
  group: `block ${COURSE_BLOCK_CONTENT}`,
  selectable: true,

  addAttributes() {
    return {
      id: { default: null },
      data: { default: { label: "" } },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-test-contract-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["section", mergeAttributes(HTMLAttributes, { "data-test-contract-block": "" }), 0];
  },
});

const TestContractBadIdNode = Node.create({
  name: "test_contract_bad_id_block",
  group: `block ${COURSE_BLOCK_CONTENT}`,
  selectable: true,

  addAttributes() {
    return {
      id: { default: null },
      data: { default: { label: "" } },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-test-contract-bad-id-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-test-contract-bad-id-block": "",
      }),
      0,
    ];
  },
});

const testContractBlockDefinition = defineBlock({
  nodeType: "test_contract_block",
  configuration: defineConfiguration({
    attr: "data",
    schema: TestContractDataSchema,
    controls: [],
  }),
  insert: {
    id: "test-contract-block",
    category: "content",
    title: "Contract block",
    description: "A block used by contract harness tests",
    icon: CheckSquareIcon,
    content: () => ({
      type: "test_contract_block",
      attrs: {
        id: "AbCdEf123_--",
        data: { label: "Contract block" },
      },
    }),
  },
});
const testContractBadIdBlockDefinition = defineBlock({
  nodeType: "test_contract_bad_id_block",
  insert: {
    id: "test-contract-bad-id-block",
    category: "content",
    title: "Contract bad id block",
    description: "A block with an invalid stable id",
    icon: CheckSquareIcon,
    content: () => ({
      type: "test_contract_bad_id_block",
      attrs: {
        id: "not-an-opaque-stable-id",
        data: { label: "Bad id block" },
      },
    }),
  },
});

const testBlockRegistry = createBlockRegistry([
  testContractBlockDefinition,
  testContractBadIdBlockDefinition,
]);

describeBlockContract({
  blockDefinitions: testBlockRegistry,
  nodeType: "test_contract_block",
  catalogId: "test-contract-block",
  extensions: [TestContractNode],
  expectsConfiguration: true,
  expectsFrame: false,
  expectsAssessment: false,
});

describe("block contract assertions", () => {
  it("reports stable id violations", () => {
    expect(() =>
      assertBlockContract({
        blockDefinitions: testBlockRegistry,
        nodeType: "test_contract_bad_id_block",
        catalogId: "test-contract-bad-id-block",
        extensions: [TestContractBadIdNode],
      }),
    ).toThrow(/stable id/i);
  });

  it("renders an explicit authoring frame for every registered insertable block", async () => {
    const definitions = builtInBlockRegistry.definitions.filter((definition) => definition.insert);

    for (const definition of definitions) {
      const editor = createAuthoringFrameContractEditor();
      try {
        const insert = definition.insert;
        if (!insert) continue;
        const node = editor.schema.nodeFromJSON(insert.content());
        node.check();

        const blockId = node.attrs["id"];
        expect(blockId, insert.id).toEqual(expect.any(String));

        editor.commands.setContent({
          type: "doc",
          content: [node.toJSON()],
        });
        render(
          createElement(
            InteractionProvider,
            { store: getInteractionFacadeStoreForEditor(editor) },
            createElement(
              EditorMovementLayer,
              {
                blockDefinitions: builtInBlockRegistry,
                editor,
                surfaceVariants: builtInSurfaceVariantRegistry,
              },
              createElement(EditorContent, { editor }),
            ),
          ),
        );

        await waitFor(() => {
          const authoringFrame = document.body.querySelector<HTMLElement>(
            `[${AUTHORING_FRAME_ATTR}="block"][data-id="${blockId}"]`,
          );

          expect(authoringFrame, insert.id).not.toBeNull();
          expect(authoringFrame?.getAttribute("data-node"), insert.id).toBe(definition.nodeType);
          expect(authoringFrame?.getAttribute("data-definition"), insert.id).toBe(
            definition.nodeType,
          );
        });
      } finally {
        cleanup();
        editor.destroy();
      }
    }
  }, 30_000);
});

function createAuthoringFrameContractEditor(): Editor {
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
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentActionsGroupNode,
      AssessmentHintNode,
      AssessmentChoicesGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      SelectableChoiceBodyNode,
      SelectableChoiceNode,
      createRuntimeBlockFrameAttributesExtension(builtInBlockRegistry.resizableNodeTypes),
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      ...createAuthoringBlockExtensions(builtInBlockRegistry),
    ],
  });
}
