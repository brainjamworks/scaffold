// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent } from "@tiptap/react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createAuthoringBlockExtensions } from "@/editor/blocks/authoring-block-extensions";
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
import {
  AUTHORING_FRAME_WRAPPER_ACTIVE_ATTR,
  AUTHORING_RESIZE_HANDLE_ATTR,
} from "@/editor/interactions/dom/authoring-chrome";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { createCatalogNodeChecked } from "@/editor/insertion/checked-insertion";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
  cleanup();
});

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "audio_block",
  catalogId: "audio",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

describe("AudioBlock resize frame", () => {
  it("shows active resize chrome when the audio block is node-selected", async () => {
    editor = createAudioBlockTestEditor();

    const nodeResult = createCatalogNodeChecked({
      catalog: builtInInsertCatalog,
      schema: editor.schema,
      catalogId: "audio",
    });
    expect(nodeResult.ok).toBe(true);
    if (!nodeResult.ok) return;

    editor.commands.setContent({
      type: "doc",
      content: [nodeResult.node.toJSON()],
    });
    render(createElement(EditorContent, { editor }));

    act(() => {
      editor?.view.focus();
      editor?.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)),
      );
    });

    await waitFor(() => {
      expect(
        document.body.querySelector(`[${AUTHORING_FRAME_WRAPPER_ACTIVE_ATTR}]`),
      ).not.toBeNull();
      expect(visibleResizeHandle("bottom-right")?.style.display).toBe("block");
    });
  });

  it("selects the audio block and shows resize chrome when its empty control is pressed", async () => {
    editor = createAudioBlockTestEditor();

    const nodeResult = createCatalogNodeChecked({
      catalog: builtInInsertCatalog,
      schema: editor.schema,
      catalogId: "audio",
    });
    expect(nodeResult.ok).toBe(true);
    if (!nodeResult.ok) return;

    editor.commands.setContent({
      type: "doc",
      content: [nodeResult.node.toJSON()],
    });
    render(createElement(EditorContent, { editor }));

    fireEvent.mouseDown(await screen.findByRole("button", { name: "Add audio" }));

    await waitFor(() => {
      expect(editor?.state.selection).toBeInstanceOf(NodeSelection);
      expect(
        document.body.querySelector(`[${AUTHORING_FRAME_WRAPPER_ACTIVE_ATTR}]`),
      ).not.toBeNull();
      expect(visibleResizeHandle("bottom-right")?.style.display).toBe("block");
    });
  });
});

function createAudioBlockTestEditor() {
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
      createRuntimeBlockFrameAttributesExtension(["audio_block"]),
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      ...createAuthoringBlockExtensions(builtInBlockRegistry),
    ],
  });
}

function visibleResizeHandle(direction: string): HTMLElement | null {
  return document.body.querySelector(
    `[${AUTHORING_RESIZE_HANDLE_ATTR}="${direction}"]`,
  ) as HTMLElement | null;
}
