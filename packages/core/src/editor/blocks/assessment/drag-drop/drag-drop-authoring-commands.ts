import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import {
  AssessmentFeedbackContentSchema,
  DragDropPayloadSchema,
  DragDropSettingsSchema,
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  ImageBlockAttrsSchema,
  MarkerVisualSchema,
  SpatialPlacementCircleSchema,
  type AssessmentFeedbackContent,
  type DragDropCanvasData,
  type DragDropMarker,
  type DragDropPrivateAssessment,
  type DragDropSettings,
  type EmbeddedDataId,
  type EmbeddedNodeId,
  type ImageBlockAttrs,
  type MarkerVisual,
  type SpatialPlacementCircle,
} from "@scaffold/contracts";

import type { ResolvedAuthoringNode } from "@/editor/prosemirror/authoring-target";

import { defaultDragDropCanvasData, DRAG_DROP_CANVAS_NODE_TYPE } from "@/editor/assessment/drag-drop/drag-drop-canvas-shared";
import { isDragDropOwnerNodeType } from "./node";

export interface DragDropAuthoringModel {
  readonly owner: ResolvedAuthoringNode;
  readonly ownerId: EmbeddedNodeId;
  readonly canvas: Readonly<{ node: ProseMirrorNode; pos: number }>;
  readonly data: DragDropCanvasData;
  readonly assessment: DragDropPrivateAssessment;
  readonly settings: DragDropSettings;
}

export type DragDropAuthoringIssue =
  | Readonly<{
      code: "stale_drag_drop_owner";
      message: string;
      ownerId: string;
      ownerPos: number;
    }>
  | Readonly<{
      code: "missing_drag_drop_marker";
      message: string;
      ownerId: EmbeddedNodeId;
      markerId: string;
    }>
  | Readonly<{
      code: "drag_drop_background_cancelled";
      message: string;
      ownerId: EmbeddedNodeId;
    }>;

export type DragDropAuthoringResult =
  | Readonly<{ ok: true; tr: Transaction; markerId?: EmbeddedDataId }>
  | Readonly<{ ok: false; issue: DragDropAuthoringIssue }>;

export type DragDropBackgroundResolution =
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "resolved"; image: ImageBlockAttrs; width: number; height: number }>;

export function resolveDragDropAuthoringModel(
  target: ResolvedAuthoringNode,
): DragDropAuthoringModel {
  if (!isDragDropOwnerNodeType(target.node.type.name)) {
    throw new Error("Expected a Drag and Drop authoring owner.");
  }

  let canvas: { node: ProseMirrorNode; pos: number } | null = null;
  let childPos = target.pos + 1;
  for (let index = 0; index < target.node.childCount; index += 1) {
    const child = target.node.child(index);
    if (child.type.name === DRAG_DROP_CANVAS_NODE_TYPE) {
      if (canvas) throw new Error("Drag and Drop contains duplicate canvas children.");
      canvas = { node: child, pos: childPos };
    }
    childPos += child.nodeSize;
  }
  if (!canvas) throw new Error("Drag and Drop is missing its canonical canvas child.");

  const payload = DragDropPayloadSchema.parse({
    canvas: canvas.node.attrs["data"],
    assessment: target.node.attrs["assessment"],
  });
  return {
    owner: target,
    ownerId: EmbeddedNodeIdSchema.parse(target.node.attrs["id"]),
    canvas,
    data: payload.canvas,
    assessment: payload.assessment,
    settings: DragDropSettingsSchema.parse(target.node.attrs["settings"]),
  };
}

export function setDragDropBackgroundChecked({
  tr,
  target,
  resolution,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  resolution: DragDropBackgroundResolution;
}): DragDropAuthoringResult {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  if (resolution.kind === "cancelled") {
    return {
      ok: false,
      issue: {
        code: "drag_drop_background_cancelled",
        message: "Background selection was cancelled.",
        ownerId: model.model.ownerId,
      },
    };
  }
  const image = ImageBlockAttrsSchema.parse(resolution.image);
  const ratio = resolution.width / resolution.height;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new Error("Resolved Drag and Drop image dimensions must produce a positive ratio.");
  }
  return setModel(tr, model.model, {
    data: { ...model.model.data, image, imageAspectRatio: ratio },
  });
}

export function createDragDropMarkerChecked({
  tr,
  target,
  draft,
  geometry,
  createMarkerId,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  draft: Readonly<{ label: string; visualOverride: MarkerVisual | null }>;
  geometry: SpatialPlacementCircle;
  createMarkerId: () => string;
}): DragDropAuthoringResult {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  if (model.model.data.image === null || model.model.data.imageAspectRatio === null) {
    throw new Error("A resolved background is required before creating a Drag and Drop marker.");
  }
  const markerId = EmbeddedDataIdSchema.parse(createMarkerId());
  if (model.model.data.markers.some(({ id }) => id === markerId)) {
    throw new Error(`Drag and Drop marker allocator produced duplicate id "${markerId}".`);
  }
  const marker: DragDropMarker = {
    id: markerId,
    label: draft.label,
    visualOverride:
      draft.visualOverride === null ? null : MarkerVisualSchema.parse(draft.visualOverride),
  };
  const result = setModel(tr, model.model, {
    data: { ...model.model.data, markers: [...model.model.data.markers, marker] },
    assessment: {
      ...model.model.assessment,
      correctPlacements: [
        ...model.model.assessment.correctPlacements,
        { markerId, geometry: SpatialPlacementCircleSchema.parse(geometry) },
      ],
    },
  });
  return result.ok ? { ...result, markerId } : result;
}

export function setDragDropDefaultMarkerVisualChecked({
  tr,
  target,
  visual,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  visual: MarkerVisual;
}): DragDropAuthoringResult {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  return setModel(tr, model.model, {
    data: {
      ...model.model.data,
      defaultMarkerVisual: MarkerVisualSchema.parse(visual),
    },
  });
}

export function updateDragDropMarkerChecked({
  tr,
  target,
  markerId,
  patch,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  markerId: string;
  patch: Partial<Pick<DragDropMarker, "label" | "visualOverride">>;
}): DragDropAuthoringResult {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  const marker = markerFor(model.model, markerId);
  if (!marker.ok) return marker;
  return setModel(tr, model.model, {
    data: {
      ...model.model.data,
      markers: model.model.data.markers.map((candidate) =>
        candidate.id === marker.marker.id
          ? { ...candidate, ...patch, id: candidate.id }
          : candidate,
      ),
    },
  });
}

export function reorderDragDropMarkersChecked({
  tr,
  target,
  markerIds,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  markerIds: readonly string[];
}): DragDropAuthoringResult {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  const byId = new Map(model.model.data.markers.map((marker) => [marker.id, marker]));
  if (
    markerIds.length !== byId.size ||
    new Set(markerIds).size !== markerIds.length ||
    markerIds.some((id) => !byId.has(id as EmbeddedDataId))
  ) {
    throw new Error("Drag and Drop marker reorder must contain every current marker exactly once.");
  }
  return setModel(tr, model.model, {
    data: {
      ...model.model.data,
      markers: markerIds.map((id) => byId.get(id as EmbeddedDataId)!),
    },
  });
}

export function setDragDropCorrectPlacementChecked({
  tr,
  target,
  markerId,
  geometry,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  markerId: string;
  geometry: SpatialPlacementCircle;
}): DragDropAuthoringResult {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  const marker = markerFor(model.model, markerId);
  if (!marker.ok) return marker;
  const parsedGeometry = SpatialPlacementCircleSchema.parse(geometry);
  return setModel(tr, model.model, {
    assessment: {
      ...model.model.assessment,
      correctPlacements: model.model.assessment.correctPlacements.map((placement) =>
        placement.markerId === marker.marker.id
          ? { markerId: placement.markerId, geometry: parsedGeometry }
          : placement,
      ),
    },
  });
}

export function setDragDropMarkerFeedbackChecked({
  tr,
  target,
  markerId,
  feedback,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  markerId: string;
  feedback: AssessmentFeedbackContent | null;
}): DragDropAuthoringResult {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  const marker = markerFor(model.model, markerId);
  if (!marker.ok) return marker;
  const feedbackByMarkerId = { ...model.model.assessment.feedbackByMarkerId };
  if (feedback === null) delete feedbackByMarkerId[marker.marker.id];
  else feedbackByMarkerId[marker.marker.id] = AssessmentFeedbackContentSchema.parse(feedback);
  return setModel(tr, model.model, {
    assessment: { ...model.model.assessment, feedbackByMarkerId },
  });
}

export function deleteDragDropMarkerChecked({
  tr,
  target,
  markerId,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  markerId: string;
}): DragDropAuthoringResult {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  const marker = markerFor(model.model, markerId);
  if (!marker.ok) return marker;
  const feedbackByMarkerId = { ...model.model.assessment.feedbackByMarkerId };
  delete feedbackByMarkerId[marker.marker.id];
  return setModel(tr, model.model, {
    data: {
      ...model.model.data,
      markers: model.model.data.markers.filter(({ id }) => id !== marker.marker.id),
    },
    assessment: {
      ...model.model.assessment,
      correctPlacements: model.model.assessment.correctPlacements.filter(
        ({ markerId: id }) => id !== marker.marker.id,
      ),
      feedbackByMarkerId,
    },
  });
}

export function setDragDropSettingsChecked({
  tr,
  target,
  settings,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  settings: unknown;
}): DragDropAuthoringResult {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  const parsed = DragDropSettingsSchema.parse(settings);
  tr.setNodeMarkup(model.model.owner.pos, undefined, {
    ...model.model.owner.node.attrs,
    settings: parsed,
  });
  tr.doc.check();
  return { ok: true, tr };
}

export function clearDragDropQuestionChecked({
  tr,
  target,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
}): DragDropAuthoringResult {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  return setModel(tr, model.model, {
    data: defaultDragDropCanvasData(),
    assessment: { correctPlacements: [], feedbackByMarkerId: {}, summaryFeedback: null },
  });
}

function resolveCurrentModel(
  tr: Transaction,
  target: ResolvedAuthoringNode,
):
  | Readonly<{ ok: true; model: DragDropAuthoringModel }>
  | Readonly<{
      ok: false;
      issue: Extract<DragDropAuthoringIssue, { code: "stale_drag_drop_owner" }>;
    }> {
  const ownerId = String(target.node.attrs["id"] ?? "");
  const current =
    Number.isInteger(target.pos) && target.pos >= 0 && target.pos <= tr.doc.content.size
      ? tr.doc.nodeAt(target.pos)
      : null;
  if (current !== target.node) {
    return {
      ok: false,
      issue: {
        code: "stale_drag_drop_owner",
        message: "The Drag and Drop owner is no longer current.",
        ownerId,
        ownerPos: target.pos,
      },
    };
  }
  return { ok: true, model: resolveDragDropAuthoringModel(target) };
}

function markerFor(
  model: DragDropAuthoringModel,
  markerId: string,
):
  | Readonly<{ ok: true; marker: DragDropMarker }>
  | Readonly<{
      ok: false;
      issue: Extract<DragDropAuthoringIssue, { code: "missing_drag_drop_marker" }>;
    }> {
  const marker = model.data.markers.find(({ id }) => id === markerId);
  return marker
    ? { ok: true, marker }
    : {
        ok: false,
        issue: {
          code: "missing_drag_drop_marker",
          message: `Drag and Drop marker "${markerId}" no longer exists.`,
          ownerId: model.ownerId,
          markerId,
        },
      };
}

function setModel(
  tr: Transaction,
  model: DragDropAuthoringModel,
  next: Readonly<{
    data?: DragDropCanvasData;
    assessment?: DragDropPrivateAssessment;
  }>,
): DragDropAuthoringResult {
  const payload = DragDropPayloadSchema.parse({
    canvas: next.data ?? model.data,
    assessment: next.assessment ?? model.assessment,
  });
  if (next.data) {
    tr.setNodeMarkup(model.canvas.pos, undefined, {
      ...model.canvas.node.attrs,
      data: payload.canvas,
    });
  }
  if (next.assessment) {
    const owner = tr.doc.nodeAt(model.owner.pos);
    if (!owner || !isDragDropOwnerNodeType(owner.type.name)) {
      throw new Error("Drag and Drop owner disappeared during an atomic update.");
    }
    tr.setNodeMarkup(model.owner.pos, undefined, {
      ...owner.attrs,
      assessment: payload.assessment,
    });
  }
  tr.doc.check();
  return { ok: true, tr };
}
