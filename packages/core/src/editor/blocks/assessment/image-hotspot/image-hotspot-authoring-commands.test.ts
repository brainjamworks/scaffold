// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { Fragment } from "@tiptap/pm/model";
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
import { resolveStableNode } from "@/document/model/identity/resolve-stable-node";
import { ImageHotspotCanvasDataSchema, type ImageHotspotCanvasData } from "@scaffold/contracts";

import {
  removeImageHotspotChecked,
  resolveImageHotspotAuthoringModel,
  setImageHotspotCanvasDataChecked,
  setImageHotspotFeedbackChecked,
  toggleImageHotspotCorrectChecked,
} from "./image-hotspot-authoring-commands";
import { createImageHotspotCanvasNode } from "@/editor/assessment/image-hotspot/image-hotspot-canvas-shared";
import { createImageHotspotNode } from "./node";

const canvasData: ImageHotspotCanvasData = ImageHotspotCanvasDataSchema.parse({
  image: { mode: "external", src: "https://example.test/hotspot.png", alt: "Map" },
  hotspots: [
    { id: "hotsp_000001", centerX: 20, centerY: 30, radius: 8, label: "First" },
    { id: "hotsp_000002", centerX: 70, centerY: 60, radius: 12, label: "Second" },
  ],
  maxClicks: 2,
  debug: false,
});

const feedback = {
  kind: "rich-text" as const,
  document: {
    type: "doc" as const,
    content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Good" }] }],
  },
};

const assessment = {
  gradingMode: "partial-credit" as const,
  correctHotspotIds: ["hotsp_000001", "hotsp_000002"],
  feedbackByHotspotId: { hotsp_000002: feedback },
  missFeedback: null,
  summaryFeedback: null,
};

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function makeEditor({
  canvas = canvasData,
  privateAssessment = assessment,
}: {
  canvas?: unknown;
  privateAssessment?: unknown;
} = {}) {
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
      createImageHotspotCanvasNode(),
      createImageHotspotNode(),
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "image_hotspot",
          attrs: {
            id: "ihsblk_00001",
            assessment: privateAssessment,
            preservedOwnerAttr: "ignored-by-schema",
          },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            { type: "assessment_instructions", content: [{ type: "paragraph" }] },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            { type: "image_hotspot_canvas", attrs: { data: canvas } },
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
    id: "ihsblk_00001",
    nodeType: "image_hotspot",
  }).read();
  if (!target) throw new Error("Expected a ready image-hotspot owner");
  return target;
}

describe("image-hotspot checked authoring commands", () => {
  it("resolves the live owner, direct canvas child, and parsed authoring model", () => {
    const editor = makeEditor();
    const target = ownerTarget(editor);

    const model = resolveImageHotspotAuthoringModel(target);

    expect(model).not.toBeNull();
    expect(model?.owner).toBe(target);
    expect(model?.canvas.node.type.name).toBe("image_hotspot_canvas");
    expect(editor.state.doc.nodeAt(model?.canvas.pos ?? -1)).toBe(model?.canvas.node);
    expect(model?.data).toEqual(canvasData);
    expect(model?.assessment).toEqual(assessment);
  });

  it("rejects malformed attrs and missing or wrong direct canvas children", () => {
    const malformedCanvasEditor = makeEditor({ canvas: { hotspots: [{ id: "broken" }] } });
    const malformedAssessmentEditor = makeEditor({
      privateAssessment: { gradingMode: "not-a-mode" },
    });
    const validTarget = ownerTarget(makeEditor());
    const paragraph = validTarget.node.type.schema.nodes["paragraph"]?.create();
    if (!paragraph) throw new Error("Expected paragraph node type");

    const missingCanvasTarget: ResolvedAuthoringNode = {
      ...validTarget,
      node: validTarget.node.type.create(validTarget.node.attrs, Fragment.empty),
    };
    const wrongCanvasTarget: ResolvedAuthoringNode = {
      ...validTarget,
      node: validTarget.node.type.create(validTarget.node.attrs, Fragment.from(paragraph)),
    };

    expect(resolveImageHotspotAuthoringModel(ownerTarget(malformedCanvasEditor))).toBeNull();
    expect(resolveImageHotspotAuthoringModel(ownerTarget(malformedAssessmentEditor))).toBeNull();
    expect(resolveImageHotspotAuthoringModel(missingCanvasTarget)).toBeNull();
    expect(resolveImageHotspotAuthoringModel(wrongCanvasTarget)).toBeNull();
  });

  it("rejects dangling private references in the complete authoring model", () => {
    const danglingCorrect = makeEditor({
      privateAssessment: {
        ...assessment,
        correctHotspotIds: ["hotsp_000099"],
      },
    });
    const danglingFeedback = makeEditor({
      privateAssessment: {
        ...assessment,
        feedbackByHotspotId: { hotsp_000099: feedback },
      },
    });

    expect(resolveImageHotspotAuthoringModel(ownerTarget(danglingCorrect))).toBeNull();
    expect(resolveImageHotspotAuthoringModel(ownerTarget(danglingFeedback))).toBeNull();
  });

  it("updates canvas data while preserving owner and canvas attrs", () => {
    const editor = makeEditor();
    const target = ownerTarget(editor);
    const nextData = {
      ...canvasData,
      maxClicks: 1,
      hotspots: canvasData.hotspots.map((hotspot) =>
        hotspot.id === "hotsp_000002" ? { ...hotspot, centerX: 75, label: "Moved" } : hotspot,
      ),
    };

    const result = setImageHotspotCanvasDataChecked({
      tr: editor.state.tr,
      target,
      data: nextData,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const nextTarget = resolveStableNode(result.tr.doc, {
      id: "ihsblk_00001",
      nodeType: "image_hotspot",
    });
    expect(nextTarget.status).toBe("ready");
    if (nextTarget.status !== "ready") return;
    const nextModel = resolveImageHotspotAuthoringModel(nextTarget);
    expect(nextModel?.data).toEqual(nextData);
    expect(nextModel?.assessment).toEqual(assessment);
    expect(nextModel?.owner.node.attrs["settings"]).toEqual(target.node.attrs["settings"]);
  });

  it("rejects canvas updates that would leave private references dangling", () => {
    const editor = makeEditor();
    const target = ownerTarget(editor);
    const tr = editor.state.tr;

    const result = setImageHotspotCanvasDataChecked({
      tr,
      target,
      data: {
        ...canvasData,
        hotspots: canvasData.hotspots.filter((hotspot) => hotspot.id === "hotsp_000001"),
      },
    });

    expect(result.ok).toBe(false);
    expect(tr.steps).toHaveLength(0);
  });

  it("toggles correctness and writes feedback through checked parent mutations", () => {
    const editor = makeEditor();
    const target = ownerTarget(editor);

    const toggleResult = toggleImageHotspotCorrectChecked({
      tr: editor.state.tr,
      target,
      hotspotId: "hotsp_000002",
    });
    expect(toggleResult.ok).toBe(true);
    if (!toggleResult.ok) return;
    const toggledTarget = resolveStableNode(toggleResult.tr.doc, {
      id: "ihsblk_00001",
      nodeType: "image_hotspot",
    });
    expect(toggledTarget.status).toBe("ready");
    if (toggledTarget.status !== "ready") return;
    expect(resolveImageHotspotAuthoringModel(toggledTarget)?.assessment.correctHotspotIds).toEqual([
      "hotsp_000001",
    ]);

    const feedbackResult = setImageHotspotFeedbackChecked({
      tr: editor.state.tr,
      target,
      hotspotId: "hotsp_000001",
      feedback,
    });
    expect(feedbackResult.ok).toBe(true);
    if (!feedbackResult.ok) return;
    const feedbackTarget = resolveStableNode(feedbackResult.tr.doc, {
      id: "ihsblk_00001",
      nodeType: "image_hotspot",
    });
    expect(feedbackTarget.status).toBe("ready");
    if (feedbackTarget.status !== "ready") return;
    expect(
      resolveImageHotspotAuthoringModel(feedbackTarget)?.assessment.feedbackByHotspotId[
        "hotsp_000001"
      ],
    ).toEqual(feedback);
  });

  it("fails invalid checked writes without adding transaction steps", () => {
    const editor = makeEditor();
    const target = ownerTarget(editor);
    const transactions = Array.from({ length: 4 }, () => editor.state.tr);

    const results = [
      setImageHotspotCanvasDataChecked({
        tr: transactions[0]!,
        target,
        data: { ...canvasData, maxClicks: 0 },
      }),
      toggleImageHotspotCorrectChecked({
        tr: transactions[1]!,
        target,
        hotspotId: "hotsp_000099",
      }),
      setImageHotspotFeedbackChecked({
        tr: transactions[2]!,
        target,
        hotspotId: "hotsp_000099",
        feedback,
      }),
      removeImageHotspotChecked({
        tr: transactions[3]!,
        target,
        hotspotId: "hotsp_000099",
      }),
    ];

    expect(results.every((result) => !result.ok)).toBe(true);
    expect(transactions.map((tr) => tr.steps.length)).toEqual([0, 0, 0, 0]);
  });

  it("removes canvas geometry, correctness, and feedback atomically before dispatch", () => {
    const editor = makeEditor();
    const originalDoc = editor.state.doc;
    const target = ownerTarget(editor);

    const result = removeImageHotspotChecked({
      tr: editor.state.tr,
      target,
      hotspotId: "hotsp_000002",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(editor.state.doc).toBe(originalDoc);
    expect(editor.state.doc.eq(result.tr.doc)).toBe(false);
    const nextTarget = resolveStableNode(result.tr.doc, {
      id: "ihsblk_00001",
      nodeType: "image_hotspot",
    });
    expect(nextTarget.status).toBe("ready");
    if (nextTarget.status !== "ready") return;
    const nextModel = resolveImageHotspotAuthoringModel(nextTarget);
    expect(nextModel?.data.hotspots.map((hotspot) => hotspot.id)).toEqual(["hotsp_000001"]);
    expect(nextModel?.assessment.correctHotspotIds).toEqual(["hotsp_000001"]);
    expect(nextModel?.assessment.feedbackByHotspotId["hotsp_000002"]).toBeUndefined();
    expect(result.tr.steps).toHaveLength(2);
  });
});
