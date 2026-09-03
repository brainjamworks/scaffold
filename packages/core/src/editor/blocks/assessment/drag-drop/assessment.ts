import type { JSONContent } from "@tiptap/core";
import {
  SpatialPlacementAssessmentSchema,
  SpatialPlacementInteractionSchema,
  type AssessmentAnswerKey,
  type AssessmentInteractionContract,
  type AssessmentTargetSettings,
} from "@scaffold/contracts";

import {
  cloneJsonNodeWithoutContent,
  omitAttrs,
  optionalStringField,
  readContent,
  readOptionalString,
  redactCommonAssessmentShellNode,
} from "@/editor/assessment/shared/publication/projection";

import { parseDragDropAuthoredQuestion, parseDragDropPublicQuestion } from "./node";

export function projectDragDropLearnerNode(node: JSONContent): JSONContent {
  parseDragDropAuthoredQuestion(node);
  return {
    ...cloneJsonNodeWithoutContent(node),
    attrs: omitAttrs(node, ["assessment"]),
    content: readContent(node).map((child) =>
      child.type === "drag_drop_canvas"
        ? cloneJsonNodeWithoutContent(child)
        : redactCommonAssessmentShellNode(child),
    ),
  };
}

export function projectDragDropInteraction(node: JSONContent): AssessmentInteractionContract {
  const question = parseDragDropPublicQuestion(node);
  if (!question.ready) throw new Error("Drag and Drop question is not learner-ready.");
  return SpatialPlacementInteractionSchema.parse({
    kind: "spatial-placement",
    markers: question.canvas.markers.map(({ id, label }) => ({ id, label })),
  });
}

export function projectDragDropAssessment(node: JSONContent): AssessmentAnswerKey {
  const question = requireReadyQuestion(node);
  return SpatialPlacementAssessmentSchema.parse({
    kind: "spatial-placement",
    gradingMode: question.settings.gradingMode,
    imageAspectRatio: question.canvas.imageAspectRatio,
    correctPlacements: question.assessment.correctPlacements,
    feedbackByMarkerId: question.assessment.feedbackByMarkerId,
    summaryFeedback: question.assessment.summaryFeedback,
  });
}

export function projectDragDropSettings(settings: unknown): Partial<AssessmentTargetSettings> {
  return optionalStringField("legend", readOptionalString(settings, "legend"));
}

function requireReadyQuestion(node: JSONContent) {
  const question = parseDragDropAuthoredQuestion(node);
  if (!question.ready) throw new Error("Drag and Drop question is not learner-ready.");
  return question;
}
