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

import {
  DRAG_DROP_NODE_TYPE,
  parseDragDropAuthoredQuestion,
  parseDragDropPublicQuestion,
} from "@/editor/assessment/drag-drop/node-codecs";

export interface DragDropNotLearnerReadyDetails {
  readonly kind: "block" | "surface";
  readonly capabilityId: string;
  readonly stableId: string;
}

export class DragDropNotLearnerReadyError extends Error {
  readonly details: DragDropNotLearnerReadyDetails;

  constructor(details: DragDropNotLearnerReadyDetails) {
    super("Drag and Drop question is not learner-ready.");
    this.name = "DragDropNotLearnerReadyError";
    this.details = details;
  }
}

export function isDragDropNotLearnerReady(error: unknown): error is DragDropNotLearnerReadyError {
  return error instanceof DragDropNotLearnerReadyError;
}

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
  if (!question.ready) {
    throw new DragDropNotLearnerReadyError({
      kind: "block",
      capabilityId: node.type ?? DRAG_DROP_NODE_TYPE,
      stableId: question.ownerId,
    });
  }
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
  if (!question.ready) {
    throw new DragDropNotLearnerReadyError({
      kind: "block",
      capabilityId: node.type ?? DRAG_DROP_NODE_TYPE,
      stableId: question.ownerId,
    });
  }
  return question;
}
