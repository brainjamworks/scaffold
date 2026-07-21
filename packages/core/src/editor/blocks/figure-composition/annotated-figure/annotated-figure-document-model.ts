import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  AnnotatedFigureAnnotationAttrsSchema,
  AnnotatedFigureDataSchema,
  type AnnotatedFigureData,
} from "@scaffold/contracts";

import {
  ANNOTATED_FIGURE_ANNOTATION_NODE,
  ANNOTATED_FIGURE_CANVAS_NODE,
  ANNOTATED_FIGURE_LEGEND_NODE,
  ANNOTATED_FIGURE_NODE,
} from "./content";

export interface AnnotatedFigureAnnotationProjection {
  id: string;
  index: number;
  number: number;
  x: number;
  y: number;
  node: ProseMirrorNode;
  pos: number;
  captionNode: ProseMirrorNode;
}

export interface ResolvedAnnotatedFigureModel {
  owner: { node: ProseMirrorNode; pos: number };
  canvas: { node: ProseMirrorNode; pos: number };
  legend: { node: ProseMirrorNode; pos: number };
  data: AnnotatedFigureData;
  annotations: AnnotatedFigureAnnotationProjection[];
}

export function resolveAnnotatedFigureOwnerAtPosition(
  doc: ProseMirrorNode,
  pos: number | null | undefined,
): { node: ProseMirrorNode; pos: number } | null {
  if (typeof pos !== "number" || !Number.isInteger(pos) || pos < 0 || pos > doc.content.size) {
    return null;
  }

  try {
    const $pos = doc.resolve(pos);
    for (let depth = $pos.depth; depth >= 0; depth -= 1) {
      const node = $pos.node(depth);
      if (node.type.name !== ANNOTATED_FIGURE_NODE) continue;
      return { node, pos: depth === 0 ? 0 : $pos.before(depth) };
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveAnnotatedFigureModel(owner: {
  node: ProseMirrorNode;
  pos: number;
}): ResolvedAnnotatedFigureModel | null {
  if (owner.node.type.name !== ANNOTATED_FIGURE_NODE || owner.node.childCount !== 2) return null;

  const data = AnnotatedFigureDataSchema.safeParse(owner.node.attrs["data"]);
  if (!data.success) return null;

  const canvasNode = owner.node.child(0);
  const legendNode = owner.node.child(1);
  if (
    canvasNode.type.name !== ANNOTATED_FIGURE_CANVAS_NODE ||
    canvasNode.childCount !== 0 ||
    legendNode.type.name !== ANNOTATED_FIGURE_LEGEND_NODE
  ) {
    return null;
  }

  const canvas = { node: canvasNode, pos: owner.pos + 1 };
  const legend = { node: legendNode, pos: canvas.pos + canvasNode.nodeSize };
  const seenIds = new Set<string>();
  const annotations: AnnotatedFigureAnnotationProjection[] = [];
  let annotationPos = legend.pos + 1;

  for (let index = 0; index < legendNode.childCount; index += 1) {
    const annotationNode = legendNode.child(index);
    const attrs = AnnotatedFigureAnnotationAttrsSchema.safeParse(annotationNode.attrs);
    if (
      annotationNode.type.name !== ANNOTATED_FIGURE_ANNOTATION_NODE ||
      annotationNode.childCount !== 1 ||
      annotationNode.child(0).type.name !== "paragraph" ||
      !attrs.success ||
      seenIds.has(attrs.data.id)
    ) {
      return null;
    }

    seenIds.add(attrs.data.id);
    annotations.push({
      id: attrs.data.id,
      index,
      number: index + 1,
      x: attrs.data.x,
      y: attrs.data.y,
      node: annotationNode,
      pos: annotationPos,
      captionNode: annotationNode.child(0),
    });
    annotationPos += annotationNode.nodeSize;
  }

  return { owner, canvas, legend, data: data.data, annotations };
}
