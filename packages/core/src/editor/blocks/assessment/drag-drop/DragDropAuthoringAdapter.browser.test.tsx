// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent } from "@tiptap/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";

import { DragDropAuthoringExtension } from "./drag-drop-authoring-extension";
import { dragDropBlockDefinition } from "./drag-drop-definition";

const TEST_IMAGE_SRC =
  "data:image/gif;base64,R0lGODlhAgABAPAAAP///wAAACH5BAAAAAAALAAAAAACAAEAAAICBAoAOw==";
const editors: Editor[] = [];

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("Drag and Drop authoring adapter", () => {
  it("writes the visible default selector and resolves persisted custom icons after reopen", async () => {
    const user = userEvent.setup();
    const resolve = vi.fn(async () => TEST_IMAGE_SRC);
    const media = {
      resolve,
      upload: async () => {
        throw new Error("Upload is not used by this persisted-media test.");
      },
    };
    const firstEditor = createEditor(authoredDocument());
    const firstRender = render(
      <ScaffoldServicesProvider ports={{ media }}>
        {createAuthoringMovementTestRoot(firstEditor, <EditorContent editor={firstEditor} />)}
      </ScaffoldServicesProvider>,
    );

    await waitFor(() => expect(resolve).toHaveBeenCalledWith("custom-marker-icon"));
    expect(screen.queryByRole("img", { name: "Custom marker icon unavailable" })).toBeNull();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Default marker appearance" }),
      "check",
    );
    await waitFor(() =>
      expect(canvasDataFrom(firstEditor.getJSON()).defaultMarkerVisual).toEqual({
        kind: "preset",
        preset: "check",
      }),
    );
    const saved = firstEditor.getJSON();
    firstRender.unmount();
    firstEditor.destroy();
    editors.splice(editors.indexOf(firstEditor), 1);
    resolve.mockClear();

    const reopenedEditor = createEditor(saved);
    render(
      <ScaffoldServicesProvider ports={{ media }}>
        {createAuthoringMovementTestRoot(reopenedEditor, <EditorContent editor={reopenedEditor} />)}
      </ScaffoldServicesProvider>,
    );

    await waitFor(() => expect(resolve).toHaveBeenCalledWith("custom-marker-icon"));
    expect(screen.queryByRole("img", { name: "Custom marker icon unavailable" })).toBeNull();
  });
});

function createEditor(content: JSONContent): Editor {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([dragDropBlockDefinition.nodeType]),
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      DragDropAuthoringExtension,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content,
  });
  editors.push(editor);
  return editor;
}

function authoredDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "drag_drop",
        attrs: {
          id: "dragdrop0001",
          settings: {},
          assessment: {
            correctPlacements: [
              {
                markerId: "marker000001",
                geometry: { kind: "circle", centerX: 50, centerY: 50, radius: 5 },
              },
            ],
            feedbackByMarkerId: {},
            summaryFeedback: null,
          },
        },
        content: [
          { type: "assessment_title", content: [{ type: "paragraph" }] },
          { type: "assessment_instructions", content: [{ type: "paragraph" }] },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "drag_drop_canvas",
            attrs: {
              id: "canvas000001",
              data: {
                image: { mode: "managed", mediaId: "background-image", alt: "Map" },
                imageAspectRatio: 2,
                defaultMarkerVisual: { kind: "preset", preset: "dot" },
                markers: [
                  {
                    id: "marker000001",
                    label: "London",
                    visualOverride: {
                      kind: "custom",
                      source: { mode: "managed", mediaId: "custom-marker-icon" },
                    },
                  },
                ],
              },
            },
          },
          {
            type: "assessment_actions_group",
            content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
          },
        ],
      },
    ],
  };
}

function canvasDataFrom(document: JSONContent): Record<string, unknown> {
  const owner = document.content?.find(({ type }) => type === "drag_drop");
  const canvas = owner?.content?.find(({ type }) => type === "drag_drop_canvas");
  const data = canvas?.attrs?.["data"];
  if (!data || typeof data !== "object") throw new Error("Expected authored Drag and Drop data.");
  return data as Record<string, unknown>;
}
