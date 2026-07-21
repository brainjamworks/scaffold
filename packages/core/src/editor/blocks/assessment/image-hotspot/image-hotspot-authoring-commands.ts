import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import type { AssessmentFeedbackContent } from "@scaffold/contracts";

import type { CheckedMutationResult } from "@/document/model/commands/checked-transactions";
import type { ResolvedAuthoringNode } from "@/editor/prosemirror/authoring-target";
import {
  ImageHotspotCanvasDataSchema,
  ImageHotspotPrivateAssessmentSchema,
  type ImageHotspotCanvasData,
  type ImageHotspotPrivateAssessment,
} from "@scaffold/contracts";

import { IMAGE_HOTSPOT_CANVAS_NODE_TYPE } from "./image-hotspot-canvas-shared";

const IMAGE_HOTSPOT_NODE_TYPE = "image_hotspot";

export interface ImageHotspotAuthoringModel {
  owner: ResolvedAuthoringNode;
  canvas: { node: ProseMirrorNode; pos: number };
  data: ImageHotspotCanvasData;
  assessment: ImageHotspotPrivateAssessment;
}

export function resolveImageHotspotAuthoringModel(
  target: ResolvedAuthoringNode,
): ImageHotspotAuthoringModel | null {
  if (target.node.type.name !== IMAGE_HOTSPOT_NODE_TYPE) return null;

  const assessment = ImageHotspotPrivateAssessmentSchema.safeParse(target.node.attrs["assessment"]);
  if (!assessment.success) return null;

  let canvas: { node: ProseMirrorNode; pos: number } | null = null;
  let canvasCount = 0;
  let childPos = target.pos + 1;
  for (let index = 0; index < target.node.childCount; index += 1) {
    const child = target.node.child(index);
    if (child.type.name === IMAGE_HOTSPOT_CANVAS_NODE_TYPE) {
      canvasCount += 1;
      canvas = { node: child, pos: childPos };
    }
    childPos += child.nodeSize;
  }
  if (canvasCount !== 1 || !canvas) return null;

  const data = ImageHotspotCanvasDataSchema.safeParse(canvas.node.attrs["data"]);
  if (!data.success) return null;

  return {
    owner: target,
    canvas,
    data: data.data,
    assessment: assessment.data,
  };
}

export function setImageHotspotCanvasDataChecked({
  tr,
  target,
  data,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  data: unknown;
}): CheckedMutationResult<Transaction> {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;

  const parsed = ImageHotspotCanvasDataSchema.safeParse(data);
  if (!parsed.success) {
    return failure("invalid_image_hotspot_canvas_data", parsed.error.message);
  }

  return applyChecked(tr, () => {
    tr.setNodeMarkup(model.model.canvas.pos, undefined, {
      ...model.model.canvas.node.attrs,
      data: parsed.data,
    });
  });
}

export function toggleImageHotspotCorrectChecked({
  tr,
  target,
  hotspotId,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  hotspotId: string;
}): CheckedMutationResult<Transaction> {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  if (!hasHotspot(model.model, hotspotId)) return missingHotspotFailure(hotspotId);

  const correctIds = new Set(model.model.assessment.correctHotspotIds);
  if (correctIds.has(hotspotId)) correctIds.delete(hotspotId);
  else correctIds.add(hotspotId);

  return setAssessmentChecked(tr, model.model, {
    ...model.model.assessment,
    correctHotspotIds: [...correctIds],
  });
}

export function setImageHotspotFeedbackChecked({
  tr,
  target,
  hotspotId,
  feedback,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  hotspotId: string;
  feedback: AssessmentFeedbackContent | null;
}): CheckedMutationResult<Transaction> {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  if (!hasHotspot(model.model, hotspotId)) return missingHotspotFailure(hotspotId);

  const feedbackByHotspotId = { ...model.model.assessment.feedbackByHotspotId };
  if (feedback) feedbackByHotspotId[hotspotId] = feedback;
  else delete feedbackByHotspotId[hotspotId];

  return setAssessmentChecked(tr, model.model, {
    ...model.model.assessment,
    feedbackByHotspotId,
  });
}

export function removeImageHotspotChecked({
  tr,
  target,
  hotspotId,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  hotspotId: string;
}): CheckedMutationResult<Transaction> {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  if (!hasHotspot(model.model, hotspotId)) return missingHotspotFailure(hotspotId);

  const data = ImageHotspotCanvasDataSchema.safeParse({
    ...model.model.data,
    hotspots: model.model.data.hotspots.filter((hotspot) => hotspot.id !== hotspotId),
  });
  const feedbackByHotspotId = { ...model.model.assessment.feedbackByHotspotId };
  delete feedbackByHotspotId[hotspotId];
  const assessment = ImageHotspotPrivateAssessmentSchema.safeParse({
    ...model.model.assessment,
    correctHotspotIds: model.model.assessment.correctHotspotIds.filter((id) => id !== hotspotId),
    feedbackByHotspotId,
  });
  if (!data.success) return failure("invalid_image_hotspot_canvas_data", data.error.message);
  if (!assessment.success) {
    return failure("invalid_image_hotspot_assessment", assessment.error.message);
  }

  return applyChecked(tr, () => {
    tr.setNodeMarkup(model.model.canvas.pos, undefined, {
      ...model.model.canvas.node.attrs,
      data: data.data,
    });
    tr.setNodeMarkup(model.model.owner.pos, undefined, {
      ...model.model.owner.node.attrs,
      assessment: assessment.data,
    });
  });
}

function resolveCurrentModel(
  tr: Transaction,
  target: ResolvedAuthoringNode,
):
  | { ok: true; model: ImageHotspotAuthoringModel }
  | { ok: false; issue: { code: string; message: string } } {
  const currentOwner = tr.doc.nodeAt(target.pos);
  if (!currentOwner || !currentOwner.eq(target.node)) {
    return {
      ok: false,
      issue: {
        code: "stale_image_hotspot_owner",
        message: "The image-hotspot owner is no longer current.",
      },
    };
  }

  const model = resolveImageHotspotAuthoringModel(target);
  if (!model) {
    return {
      ok: false,
      issue: {
        code: "invalid_image_hotspot_authoring_model",
        message: "The image-hotspot authoring model is invalid.",
      },
    };
  }
  return { ok: true, model };
}

function setAssessmentChecked(
  tr: Transaction,
  model: ImageHotspotAuthoringModel,
  assessment: unknown,
): CheckedMutationResult<Transaction> {
  const parsed = ImageHotspotPrivateAssessmentSchema.safeParse(assessment);
  if (!parsed.success) {
    return failure("invalid_image_hotspot_assessment", parsed.error.message);
  }

  return applyChecked(tr, () => {
    tr.setNodeMarkup(model.owner.pos, undefined, {
      ...model.owner.node.attrs,
      assessment: parsed.data,
    });
  });
}

function applyChecked(tr: Transaction, apply: () => void): CheckedMutationResult<Transaction> {
  try {
    apply();
    tr.doc.check();
    return { ok: true, tr };
  } catch (error) {
    return failure(
      "invalid_document_after_image_hotspot_update",
      error instanceof Error
        ? error.message
        : "Updating image-hotspot data produced an invalid document.",
    );
  }
}

function hasHotspot(model: ImageHotspotAuthoringModel, hotspotId: string): boolean {
  return hotspotId.length > 0 && model.data.hotspots.some((hotspot) => hotspot.id === hotspotId);
}

function missingHotspotFailure(hotspotId: string): CheckedMutationResult<never> {
  return failure("missing_image_hotspot", `Hotspot "${hotspotId}" was not found.`);
}

function failure(code: string, message: string): CheckedMutationResult<never> {
  return { ok: false, issue: { code, message } };
}
