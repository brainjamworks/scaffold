// @vitest-environment happy-dom
// Regression coverage for the RIZ-290/RIZ-301 fresh-authoring races: fresh block and
// surface inserts must mount without throwing, then survive image + marker + dialog.

import { Editor, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent } from "@tiptap/react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createEmbeddedDataId, createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { createAuthoringNodeTarget } from "@/editor/prosemirror/authoring-target/authoring-node-target";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import { DragDropAuthoringExtension } from "./drag-drop-authoring-extension";
import { dragDropBlockDefinition } from "./drag-drop-definition";
import {
  createDragDropMarkerChecked,
  setDragDropBackgroundChecked,
} from "./drag-drop-authoring-commands";

const TEST_IMAGE_SRC =
  "data:image/gif;base64,R0lGODlhAgABAPAAAP///wAAACH5BAAAAAAALAAAAAACAAEAAAICBAoAOw==";
const editors: Editor[] = [];

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

function mediaStub() {
  return {
    resolve: async () => TEST_IMAGE_SRC,
    upload: async () => {
      throw new Error("Upload is not used by this fresh-flow test.");
    },
  };
}

function mountEditor(editor: Editor) {
  render(
    <ScaffoldServicesProvider ports={{ media: mediaStub() }}>
      {createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />)}
    </ScaffoldServicesProvider>,
  );
}

function createBlockEditor(): Editor {
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
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
  editors.push(editor);
  return editor;
}

function createSurfaceEditor(): Editor {
  const composition = createCoreScaffoldAuthoringComposition();
  const editor = new Editor({
    extensions: createCourseDocumentAuthoringExtensions({ editable: true, composition }),
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode: "slideshow" },
          content: [
            { type: "courseSection", attrs: { id: createEmbeddedNodeId(), title: "Intro" } },
          ],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function findNodeId(editor: Editor, nodeType: string): string {
  let found: string | null = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name === nodeType) {
      found = node.attrs["id"] as string;
      return false;
    }
    return true;
  });
  if (!found) throw new Error(`Fresh content has no ${nodeType} id`);
  return found;
}

describe("drag-drop authoring fresh flow", () => {
  for (let run = 0; run < 2; run += 1) {
    it(`fresh block insert -> image -> marker -> workspace dialog (run ${run})`, async () => {
      const user = userEvent.setup();
      const editor = createBlockEditor();
      mountEditor(editor);

      let inserted = false;
      await act(async () => {
        inserted = editor.commands.insertContent(
          dragDropBlockDefinition.insert!.content() as JSONContent,
        );
      });
      expect(inserted).toBe(true);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Add background image" })).toBeTruthy();
      });

      const target = createAuthoringNodeTarget(editor, {
        id: findNodeId(editor, dragDropBlockDefinition.nodeType),
        nodeType: dragDropBlockDefinition.nodeType,
      });

      const background = target.transact((tr, resolved) =>
        setDragDropBackgroundChecked({
          tr,
          target: resolved,
          resolution: {
            kind: "resolved",
            image: { mode: "managed", mediaId: `media-block-${run}`, alt: "Map" },
            width: 800,
            height: 400,
          },
        }),
      );
      expect(background.ok).toBe(true);
      await waitFor(() => {
        expect(screen.getByRole("img", { name: "Map" })).toBeTruthy();
      });

      const marker = target.transact((tr, resolved) =>
        createDragDropMarkerChecked({
          tr,
          target: resolved,
          draft: { label: `City ${run}`, visualOverride: null },
          geometry: { kind: "circle", centerX: 25, centerY: 60, radius: 7 },
          createMarkerId: createEmbeddedDataId,
        }),
      );
      expect(marker.ok).toBe(true);
      await waitFor(() => {
        expect(
          screen.getAllByRole("button", { name: new RegExp(`City ${run}`) }).length,
        ).toBeGreaterThan(0);
      });

      await user.click(screen.getByRole("button", { name: "Edit markers in expanded workspace" }));
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeTruthy();
      });
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    });

    it(`fresh surface insert -> image -> marker (run ${run})`, async () => {
      const editor = createSurfaceEditor();
      mountEditor(editor);

      const definition = builtInSurfaceVariantRegistry.get("slide-drag-drop-question");
      if (!definition) throw new Error("Expected slide-drag-drop-question definition.");
      const surface = definition.createSurface({ surfaceId: createEmbeddedNodeId() });

      let sectionEnd = 0;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "courseSection") {
          sectionEnd = pos + node.nodeSize;
          return false;
        }
        return true;
      });
      if (sectionEnd === 0) throw new Error("Fresh document has no section");
      let inserted = false;
      await act(async () => {
        inserted = editor.commands.insertContentAt(sectionEnd, surface);
      });
      expect(inserted).toBe(true);
      await waitFor(() => {
        expect(
          document.querySelector(".sc-slide-drag-drop-question-surface-authoring-view"),
        ).toBeTruthy();
      });

      const target = createAuthoringNodeTarget(editor, {
        id: findNodeId(editor, "surface_drag_drop_question"),
        nodeType: "surface_drag_drop_question",
      });

      const background = target.transact((tr, resolved) =>
        setDragDropBackgroundChecked({
          tr,
          target: resolved,
          resolution: {
            kind: "resolved",
            image: { mode: "managed", mediaId: `media-surface-${run}`, alt: "Map" },
            width: 800,
            height: 400,
          },
        }),
      );
      expect(background.ok).toBe(true);
      await waitFor(() => {
        expect(screen.getByRole("img", { name: "Map" })).toBeTruthy();
      });

      const marker = target.transact((tr, resolved) =>
        createDragDropMarkerChecked({
          tr,
          target: resolved,
          draft: { label: `Town ${run}`, visualOverride: null },
          geometry: { kind: "circle", centerX: 25, centerY: 60, radius: 7 },
          createMarkerId: createEmbeddedDataId,
        }),
      );
      expect(marker.ok).toBe(true);
      await waitFor(() => {
        expect(
          screen.getAllByRole("button", { name: new RegExp(`Town ${run}`) }).length,
        ).toBeGreaterThan(0);
      });
    });
  }
});
