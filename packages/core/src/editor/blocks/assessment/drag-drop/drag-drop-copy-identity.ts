import { DragDropPayloadSchema, type EmbeddedDataId } from "@scaffold/contracts";

import type { ContentIdentityRewrite } from "@/document/model/identity/clone-with-new-ids";

export const rewriteDragDropCopiedContent: ContentIdentityRewrite = ({ content, generators }) => {
  if (content.type !== "drag_drop" && content.type !== "surface_drag_drop_question") {
    throw new Error("Expected a Drag and Drop content identity owner.");
  }
  const attrs = record(content.attrs);
  const children = Array.isArray(content.content) ? content.content : [];
  const canvasIndexes = children.flatMap((child, index) =>
    child.type === "drag_drop_canvas" ? [index] : [],
  );
  if (!attrs || canvasIndexes.length !== 1) {
    throw new Error("Malformed Drag and Drop private identity graph.");
  }
  const canvasIndex = canvasIndexes[0]!;
  const canvas = children[canvasIndex]!;
  const canvasAttrs = record(canvas.attrs);
  if (!canvasAttrs) throw new Error("Malformed Drag and Drop private identity graph.");

  const payload = DragDropPayloadSchema.parse({
    canvas: canvasAttrs["data"],
    assessment: attrs["assessment"],
  });
  const markerIdChanges = new Map<EmbeddedDataId, EmbeddedDataId>();
  const generatedIds = new Set<EmbeddedDataId>();
  const markers = payload.canvas.markers.map((marker) => {
    const nextId = generators.createDataId();
    if (generatedIds.has(nextId)) {
      throw new Error(`Duplicate generated Drag and Drop marker identity "${nextId}".`);
    }
    generatedIds.add(nextId);
    markerIdChanges.set(marker.id, nextId);
    return { ...marker, id: nextId };
  });
  const mappedId = (oldId: EmbeddedDataId) => {
    const nextId = markerIdChanges.get(oldId);
    if (!nextId) throw new Error(`Missing copied Drag and Drop marker identity "${oldId}".`);
    return nextId;
  };

  return {
    ...content,
    attrs: {
      ...attrs,
      assessment: {
        ...payload.assessment,
        correctPlacements: payload.assessment.correctPlacements.map((placement) => ({
          ...placement,
          markerId: mappedId(placement.markerId),
        })),
        feedbackByMarkerId: Object.fromEntries(
          Object.entries(payload.assessment.feedbackByMarkerId).map(([markerId, feedback]) => [
            mappedId(markerId as EmbeddedDataId),
            feedback,
          ]),
        ),
      },
    },
    content: children.map((child, index) =>
      index === canvasIndex
        ? {
            ...canvas,
            attrs: {
              ...canvasAttrs,
              data: { ...payload.canvas, markers },
            },
          }
        : child,
    ),
  };
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
