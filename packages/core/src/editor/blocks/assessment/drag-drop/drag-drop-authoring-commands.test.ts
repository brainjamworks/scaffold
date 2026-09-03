// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import {
  createAuthoringNodeTarget,
  type ResolvedAuthoringNode,
} from "@/editor/prosemirror/authoring-target";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";

import {
  createDragDropMarkerChecked,
  deleteDragDropMarkerChecked,
  reorderDragDropMarkersChecked,
  resolveDragDropAuthoringModel,
  setDragDropBackgroundChecked,
  setDragDropCorrectPlacementChecked,
  setDragDropDefaultMarkerVisualChecked,
  setDragDropMarkerFeedbackChecked,
  updateDragDropMarkerChecked,
} from "./drag-drop-authoring-commands";
import { createDragDropCanvasNode, defaultDragDropCanvasData } from "@/editor/assessment/drag-drop/drag-drop-canvas-shared";
import { createDragDropNode } from "./node";

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("Drag and Drop checked authoring commands", () => {
  it("commits a resolved background and intrinsic ratio together", () => {
    const editor = makeEditor();
    const result = setDragDropBackgroundChecked({
      tr: editor.state.tr,
      target: ownerTarget(editor),
      resolution: { kind: "resolved", image: managedImage(), width: 1600, height: 900 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const model = modelFrom(result.tr.doc.nodeAt(0)!, 0);
    expect(model.data.image).toEqual(managedImage());
    expect(model.data.imageAspectRatio).toBeCloseTo(16 / 9);
    expect(result.tr.steps).toHaveLength(1);
  });

  it("returns typed cancellation without writing", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;
    const result = setDragDropBackgroundChecked({
      tr,
      target: ownerTarget(editor),
      resolution: { kind: "cancelled" },
    });

    expect(result).toMatchObject({
      ok: false,
      issue: { code: "drag_drop_background_cancelled", ownerId: "dragdrop0001" },
    });
    expect(tr.steps).toHaveLength(0);
  });

  it("commits one allocated marker and answer together", () => {
    const editor = makeEditor({ readyBackground: true });
    const result = createDragDropMarkerChecked({
      tr: editor.state.tr,
      target: ownerTarget(editor),
      draft: { label: "London", visualOverride: { kind: "preset", preset: "pin" } },
      geometry: { kind: "circle", centerX: 20, centerY: 30, radius: 5 },
      createMarkerId: () => "marker000001",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markerId).toBe("marker000001");
    const model = modelFrom(result.tr.doc.nodeAt(0)!, 0);
    expect(model.data.markers).toEqual([
      { id: "marker000001", label: "London", visualOverride: { kind: "preset", preset: "pin" } },
    ]);
    expect(model.assessment.correctPlacements).toEqual([
      {
        markerId: "marker000001",
        geometry: { kind: "circle", centerX: 20, centerY: 30, radius: 5 },
      },
    ]);
    expect(result.tr.steps).toHaveLength(2);
  });

  it("updates the assessment default marker visual through one checked mutation", () => {
    const editor = makeEditor({ readyBackground: true });
    const result = setDragDropDefaultMarkerVisualChecked({
      tr: editor.state.tr,
      target: ownerTarget(editor),
      visual: {
        kind: "custom",
        source: { mode: "managed", mediaId: "default-marker-icon" },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(modelFrom(result.tr.doc.nodeAt(0)!, 0).data.defaultMarkerVisual).toEqual({
      kind: "custom",
      source: { mode: "managed", mediaId: "default-marker-icon" },
    });
    expect(result.tr.steps).toHaveLength(1);
  });

  it("preserves exact marker-keyed coverage across edit, reorder and delete", () => {
    const editor = makeEditor({ complete: true });
    const target = ownerTarget(editor);
    const renamed = updateDragDropMarkerChecked({
      tr: editor.state.tr,
      target,
      markerId: "marker000001",
      patch: { label: "Updated", visualOverride: { kind: "preset", preset: "check" } },
    });
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;

    const reordered = reorderDragDropMarkersChecked({
      tr: renamed.tr,
      target: targetFrom(renamed.tr.doc.nodeAt(0)!, 0),
      markerIds: ["marker000002", "marker000001"],
    });
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) return;

    const moved = setDragDropCorrectPlacementChecked({
      tr: reordered.tr,
      target: targetFrom(reordered.tr.doc.nodeAt(0)!, 0),
      markerId: "marker000001",
      geometry: { kind: "circle", centerX: 99, centerY: 1, radius: 2 },
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    const feedback = setDragDropMarkerFeedbackChecked({
      tr: moved.tr,
      target: targetFrom(moved.tr.doc.nodeAt(0)!, 0),
      markerId: "marker000001",
      feedback: richFeedback("Try again"),
    });
    expect(feedback.ok).toBe(true);
    if (!feedback.ok) return;

    const deleted = deleteDragDropMarkerChecked({
      tr: feedback.tr,
      target: targetFrom(feedback.tr.doc.nodeAt(0)!, 0),
      markerId: "marker000001",
    });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    const model = modelFrom(deleted.tr.doc.nodeAt(0)!, 0);
    expect(model.data.markers.map(({ id }) => id)).toEqual(["marker000002"]);
    expect(model.assessment.correctPlacements.map(({ markerId }) => markerId)).toEqual([
      "marker000002",
    ]);
    expect(model.assessment.feedbackByMarkerId).toEqual({});
  });

  it("returns reason-specific stale owner and removed marker outcomes", () => {
    const editor = makeEditor({ complete: true });
    const target = ownerTarget(editor);
    const staleTarget = {
      ...target,
      node: target.node.type.create(
        { ...target.node.attrs, settings: { ...target.node.attrs["settings"], points: 2 } },
        target.node.content,
      ),
    };

    expect(
      updateDragDropMarkerChecked({
        tr: editor.state.tr,
        target: staleTarget,
        markerId: "marker000001",
        patch: { label: "No" },
      }),
    ).toMatchObject({
      ok: false,
      issue: { code: "stale_drag_drop_owner", ownerId: "dragdrop0001" },
    });
    expect(
      deleteDragDropMarkerChecked({
        tr: editor.state.tr,
        target,
        markerId: "marker999999",
      }),
    ).toMatchObject({
      ok: false,
      issue: { code: "missing_drag_drop_marker", markerId: "marker999999" },
    });
  });

  it("leaves allocator and malformed-graph defects observable", () => {
    const editor = makeEditor({ complete: true });
    const tr = editor.state.tr;
    expect(() =>
      createDragDropMarkerChecked({
        tr,
        target: ownerTarget(editor),
        draft: { label: "Duplicate", visualOverride: null },
        geometry: { kind: "circle", centerX: 50, centerY: 50, radius: 5 },
        createMarkerId: () => "marker000001",
      }),
    ).toThrow(/duplicate/i);
    expect(tr.steps).toHaveLength(0);
  });
});

function makeEditor({ readyBackground = false, complete = false } = {}) {
  const markers = complete ? [marker("marker000001", "One"), marker("marker000002", "Two")] : [];
  const correctPlacements = markers.map(({ id }, index) => ({
    markerId: id,
    geometry: { kind: "circle" as const, centerX: 25 + index * 50, centerY: 50, radius: 5 },
  }));
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      ExtendedParagraph,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      createDragDropCanvasNode(),
      createDragDropNode(),
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "drag_drop",
          attrs: {
            id: "dragdrop0001",
            settings: {},
            assessment: { correctPlacements, feedbackByMarkerId: {}, summaryFeedback: null },
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
                  ...defaultDragDropCanvasData(),
                  ...(readyBackground || complete
                    ? { image: managedImage(), imageAspectRatio: 2 }
                    : {}),
                  markers,
                },
              },
            },
            {
              type: "assessment_actions_group",
              content: [
                { type: "assessment_hints_group" },
                { type: "assessment_summary_feedback" },
              ],
            },
          ],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function ownerTarget(editor: Editor): ResolvedAuthoringNode {
  const target = createAuthoringNodeTarget(editor, {
    id: "dragdrop0001",
    nodeType: "drag_drop",
  }).read();
  if (!target) throw new Error("Expected Drag and Drop owner");
  return target;
}

function targetFrom(node: ResolvedAuthoringNode["node"], pos: number): ResolvedAuthoringNode {
  return { status: "ready", node, pos };
}

function modelFrom(node: ResolvedAuthoringNode["node"], pos: number) {
  return resolveDragDropAuthoringModel(targetFrom(node, pos));
}

function managedImage() {
  return { mode: "managed" as const, mediaId: "background-image", alt: "Map" };
}

function marker(id: "marker000001" | "marker000002", label: string) {
  return { id, label, visualOverride: null };
}

function richFeedback(text: string) {
  return {
    kind: "rich-text" as const,
    document: {
      type: "doc" as const,
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  };
}
