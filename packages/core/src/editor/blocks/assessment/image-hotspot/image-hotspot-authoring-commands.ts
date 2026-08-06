import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import type { AssessmentFeedbackContent } from "@scaffold/contracts";

import type { CheckedMutationResult } from "@/document/model/commands/checked-transactions";
import type { ResolvedAuthoringNode } from "@/editor/prosemirror/authoring-target";
import {
  ImageHotspotCanvasDataSchema,
  ImageHotspotPrivateAssessmentSchema,
  type HotspotItem,
  type ImageBlockAttrs,
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

export function replaceImageHotspotImageChecked({
  tr,
  target,
  image,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  image: ImageBlockAttrs;
}): CheckedMutationResult<Transaction> {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  const data: ImageHotspotCanvasData = {
    ...model.model.data,
    image,
    hotspots: [],
  };
  const assessment = ImageHotspotPrivateAssessmentSchema.parse({
    ...model.model.assessment,
    correctHotspotIds: [],
    feedbackByHotspotId: {},
  });
  return setModelChecked(tr, model.model, { data, assessment });
}

export function addImageHotspotChecked({
  tr,
  target,
  hotspot,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  hotspot: HotspotItem;
}): CheckedMutationResult<Transaction> {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  const data: ImageHotspotCanvasData = {
    ...model.model.data,
    hotspots: [...model.model.data.hotspots, hotspot],
  };
  return setModelChecked(tr, model.model, { data });
}

export function patchImageHotspotChecked({
  tr,
  target,
  hotspotId,
  patch,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  hotspotId: string;
  patch: Partial<Omit<HotspotItem, "id">>;
}): CheckedMutationResult<Transaction> {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  const current = model.model.data.hotspots.find((hotspot) => hotspot.id === hotspotId);
  if (!current) return missingHotspotFailure(hotspotId);
  const next: HotspotItem = { ...current, ...patch, id: current.id };
  const data: ImageHotspotCanvasData = {
    ...model.model.data,
    hotspots: model.model.data.hotspots.map((hotspot) =>
      hotspot.id === hotspotId ? next : hotspot,
    ),
  };
  return setModelChecked(tr, model.model, { data });
}

export function setImageHotspotAltTextChecked({
  tr,
  target,
  alt,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  alt: string;
}): CheckedMutationResult<Transaction> {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  if (!model.model.data.image) return { ok: true, tr };
  const data: ImageHotspotCanvasData = {
    ...model.model.data,
    image: { ...model.model.data.image, alt },
  };
  return setModelChecked(tr, model.model, { data });
}

export function setImageHotspotClickLimitChecked({
  tr,
  target,
  maxClicks,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  maxClicks: number | null;
}): CheckedMutationResult<Transaction> {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  const data: ImageHotspotCanvasData = { ...model.model.data, maxClicks };
  return setModelChecked(tr, model.model, { data });
}

export function setImageHotspotMissFeedbackChecked({
  tr,
  target,
  feedback,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  feedback: AssessmentFeedbackContent | null;
}): CheckedMutationResult<Transaction> {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  return setAssessmentChecked(tr, model.model, {
    ...model.model.assessment,
    missFeedback: feedback,
  });
}

export function setImageHotspotCorrectChecked({
  tr,
  target,
  hotspotId,
  correct,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  hotspotId: string;
  correct: boolean;
}): CheckedMutationResult<Transaction> {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  if (!hasHotspot(model.model, hotspotId)) return missingHotspotFailure(hotspotId);
  const correctIds = new Set(model.model.assessment.correctHotspotIds);
  if (correct) correctIds.add(hotspotId);
  else correctIds.delete(hotspotId);
  return setAssessmentChecked(tr, model.model, {
    ...model.model.assessment,
    correctHotspotIds: [...correctIds],
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

  return setImageHotspotCorrectChecked({
    tr,
    target,
    hotspotId,
    correct: !model.model.assessment.correctHotspotIds.includes(hotspotId),
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

function setModelChecked(
  tr: Transaction,
  model: ImageHotspotAuthoringModel,
  next: {
    data?: ImageHotspotCanvasData;
    assessment?: ImageHotspotPrivateAssessment;
  },
): CheckedMutationResult<Transaction> {
  return applyChecked(tr, () => {
    if (next.data) {
      tr.setNodeMarkup(model.canvas.pos, undefined, {
        ...model.canvas.node.attrs,
        data: next.data,
      });
    }
    if (next.assessment) {
      const currentOwner = tr.doc.nodeAt(model.owner.pos);
      if (!currentOwner || currentOwner.type.name !== IMAGE_HOTSPOT_NODE_TYPE) {
        throw new Error("The image-hotspot owner is no longer current.");
      }
      tr.setNodeMarkup(model.owner.pos, undefined, {
        ...currentOwner.attrs,
        assessment: next.assessment,
      });
    }
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
