import { Editor, type AnyExtension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent } from "@tiptap/react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import { createAuthoringBlockExtensions } from "@/editor/blocks/authoring-block-extensions";
import type { BlockDefinition } from "@/editor/blocks/block-definition";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { createBlockInsertAction } from "@/editor/insertion/block-insert-action";
import { createCatalogNodeChecked } from "@/editor/insertion/checked-insertion";
import { createInsertCatalog } from "@/editor/insertion/insert-catalog";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { AUTHORING_FRAME_ATTR } from "@/editor/interactions/dom/authoring-frame";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
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
import { COURSE_BLOCK_CONTENT, TEXT_CONTENT } from "@/document/model/content-model/content-groups";
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

export interface DescribeBlockContractInput {
  blockDefinitions: BlockDefinitionLookup;
  nodeType: string;
  catalogId: string;
  extensions?: readonly AnyExtension[];
  expectsConfiguration?: boolean;
  expectsFrame?: boolean;
  expectsAuthoringResizeWrapper?: boolean;
  expectsAuthoringFrame?: boolean;
  expectsAssessment?: boolean;
}

export function describeBlockContract(input: DescribeBlockContractInput): void {
  describe(`block contract: ${input.nodeType}`, () => {
    it("creates valid catalog content for the registered block", () => {
      assertBlockContract(input);
    });

    if (input.expectsFrame && input.expectsAuthoringResizeWrapper !== false) {
      it("renders the selected block resize wrapper in editor mode", async () => {
        const editor = createBlockContractEditor(input);
        try {
          const node = createBlockContractNode(input, editor);

          editor.commands.setContent({
            type: "doc",
            content: [node.toJSON()],
          });
          render(createElement(EditorContent, { editor }));

          await waitFor(() => {
            expect(document.body.querySelector("[data-authoring-frame-wrapper]")).not.toBeNull();
          });
        } finally {
          cleanup();
          editor.destroy();
        }
      });
    }

    if (input.expectsAuthoringFrame) {
      it("renders an explicit block authoring frame in editor mode", async () => {
        const editor = createBlockContractEditor(input);
        try {
          const node = createBlockContractNode(input, editor);

          const blockId = node.attrs["id"];
          expect(typeof blockId).toBe("string");

          editor.commands.setContent({
            type: "doc",
            content: [node.toJSON()],
          });
          render(createElement(EditorContent, { editor }));

          await waitFor(() => {
            const authoringFrame = document.body.querySelector<HTMLElement>(
              `[${AUTHORING_FRAME_ATTR}="block"][data-id="${blockId}"]`,
            );

            expect(authoringFrame).not.toBeNull();
            expect(authoringFrame?.getAttribute("data-node")).toBe(input.nodeType);
            expect(authoringFrame?.getAttribute("data-definition")).toBe(input.nodeType);
          });
        } finally {
          cleanup();
          editor.destroy();
        }
      });
    }
  });
}

export function assertBlockContract(input: DescribeBlockContractInput): void {
  const definition = input.blockDefinitions.getByNodeType(input.nodeType);
  expect(definition).toBeDefined();
  expect(definition?.nodeType).toBe(input.nodeType);

  if (input.expectsConfiguration) {
    expect(definition?.configuration).toBeDefined();
  }

  if (input.expectsFrame) {
    expect(definition?.frame?.resizable).toBe(true);
  }

  if (input.expectsAssessment) {
    expect(definition?.capabilities?.assessment).toBeDefined();
  }

  const editor = createBlockContractEditor(input);
  try {
    const node = createBlockContractNode(input, editor);

    expect(node.type.name).toBe(input.nodeType);
    expect(
      node.type.spec.group,
      `Expected registered block "${input.nodeType}" to belong to ${COURSE_BLOCK_CONTENT}.`,
    ).toContain(COURSE_BLOCK_CONTENT);
    expect(
      node.type.spec.group,
      `Expected registered block "${input.nodeType}" to stay out of ${TEXT_CONTENT}.`,
    ).not.toContain(TEXT_CONTENT);
    expect(typeof node.attrs["id"]).toBe("string");
    expect(node.attrs["id"], `Expected "${input.nodeType}" to have an opaque stable id.`).toMatch(
      /^[0-9A-Z_a-z-]{12}$/,
    );
  } finally {
    editor.destroy();
  }
}

function createBlockContractNode(
  input: DescribeBlockContractInput,
  editor: Editor,
): ProseMirrorNode {
  const definition = requireBlockDefinition(input);
  const action = createBlockInsertAction(definition);
  if (!action) {
    throw new Error(`Block "${input.nodeType}" has no insert definition.`);
  }
  expect(action.id).toBe(input.catalogId);
  const catalog = createInsertCatalog([action]);
  const result = createCatalogNodeChecked({
    catalog,
    catalogId: input.catalogId,
    schema: editor.schema,
  });
  if (!result.ok) {
    throw new Error(result.issue.message);
  }
  const node = result.node;
  if (definition.configuration) {
    expect(
      definition.configuration.schema.safeParse(node.attrs[definition.configuration.attr]).success,
    ).toBe(true);
  }
  return node;
}

function requireBlockDefinition(input: DescribeBlockContractInput): BlockDefinition {
  const definition = input.blockDefinitions.getByNodeType(input.nodeType);
  if (!definition) {
    throw new Error(`Block "${input.nodeType}" is absent from the contract registry.`);
  }
  return definition;
}

function createBlockContractEditor(input: DescribeBlockContractInput): Editor {
  const definition = input.blockDefinitions.getByNodeType(input.nodeType);
  const hasInteractionOwner = input.extensions?.some(
    (extension) => extension.name === "scaffoldInteractionOwner",
  );
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
      createRuntimeBlockFrameAttributesExtension(
        definition?.frame?.resizable ? [input.nodeType] : [],
      ),
      ...(hasInteractionOwner
        ? []
        : [createScaffoldInteractionOwnerExtension(input.blockDefinitions)]),
      ...createAuthoringBlockExtensions(input.blockDefinitions),
      ...(input.extensions ?? []),
    ],
  });
}
