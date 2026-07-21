import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { Transform } from "@tiptap/pm/transform";

import type { CheckedMutationResult } from "@/document/model/commands/checked-transactions";
import type { ResolvedAuthoringNode } from "@/editor/prosemirror/authoring-target";

import { resolveAnnotatedFigureModel } from "./annotated-figure-document-model";

export function addAnnotatedFigureAnnotationChecked({
  tr,
  target,
  annotationId,
  x,
  y,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  annotationId: string;
  x: number;
  y: number;
}): CheckedMutationResult<Transaction> {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  if (!annotationId.trim()) return failure("invalid_annotation_id", "Annotation id is required.");
  if (model.model.annotations.some(({ id }) => id === annotationId)) {
    return failure("duplicate_annotation_id", `Annotation "${annotationId}" already exists.`);
  }
  const position = parsePosition(x, y);
  if (!position) return invalidPositionFailure();

  let annotation: ProseMirrorNode;
  try {
    const schema = model.model.owner.node.type.schema;
    const paragraphType = schema.nodes["paragraph"];
    const annotationType = schema.nodes["annotated_figure_annotation"];
    if (!paragraphType || !annotationType) {
      return failure("invalid_annotated_figure_schema", "Annotated Figure node types are missing.");
    }
    annotation = annotationType.create(
      { id: annotationId, x: position.x, y: position.y },
      paragraphType.create(),
    );
    annotation.check();
  } catch (error) {
    return failure(
      "invalid_annotation_content",
      error instanceof Error ? error.message : "The annotation could not be created.",
    );
  }

  return applyChecked(tr, (transform) => {
    transform.insert(model.model.legend.pos + model.model.legend.node.nodeSize - 1, annotation);
  });
}

export function removeAnnotatedFigureAnnotationChecked({
  tr,
  target,
  annotationId,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  annotationId: string;
}): CheckedMutationResult<Transaction> {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  const annotation = model.model.annotations.find(({ id }) => id === annotationId);
  if (!annotation) return missingAnnotationFailure(annotationId);

  return applyChecked(tr, (transform) => {
    transform.delete(annotation.pos, annotation.pos + annotation.node.nodeSize);
  });
}

export function moveAnnotatedFigureAnnotationChecked({
  tr,
  target,
  annotationId,
  direction,
  relativeToId,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  annotationId: string;
  direction: "before" | "after";
  relativeToId: string;
}): CheckedMutationResult<Transaction> {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  if (annotationId === relativeToId) {
    return failure("invalid_annotation_move", "An annotation cannot move relative to itself.");
  }

  const source = model.model.annotations.find(({ id }) => id === annotationId);
  const relative = model.model.annotations.find(({ id }) => id === relativeToId);
  if (!source) return missingAnnotationFailure(annotationId);
  if (!relative) return missingAnnotationFailure(relativeToId);

  const nextNodes = model.model.annotations
    .filter(({ id }) => id !== annotationId)
    .map(({ node }) => node);
  const relativeIndex = model.model.annotations
    .filter(({ id }) => id !== annotationId)
    .findIndex(({ id }) => id === relativeToId);
  nextNodes.splice(direction === "before" ? relativeIndex : relativeIndex + 1, 0, source.node);

  return applyChecked(tr, (transform) => {
    transform.replaceWith(
      model.model.legend.pos + 1,
      model.model.legend.pos + model.model.legend.node.nodeSize - 1,
      Fragment.fromArray(nextNodes),
    );
  });
}

export function setAnnotatedFigureAnnotationPositionChecked({
  tr,
  target,
  annotationId,
  x,
  y,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  annotationId: string;
  x: number;
  y: number;
}): CheckedMutationResult<Transaction> {
  const model = resolveCurrentModel(tr, target);
  if (!model.ok) return model;
  const annotation = model.model.annotations.find(({ id }) => id === annotationId);
  if (!annotation) return missingAnnotationFailure(annotationId);
  const position = parsePosition(x, y);
  if (!position) return invalidPositionFailure();

  return applyChecked(tr, (transform) => {
    transform.setNodeMarkup(annotation.pos, undefined, {
      ...annotation.node.attrs,
      x: position.x,
      y: position.y,
    });
  });
}

function resolveCurrentModel(
  tr: Transaction,
  target: ResolvedAuthoringNode,
):
  | { ok: true; model: NonNullable<ReturnType<typeof resolveAnnotatedFigureModel>> }
  | { ok: false; issue: { code: string; message: string } } {
  const currentOwner = tr.doc.nodeAt(target.pos);
  if (
    !currentOwner ||
    currentOwner.type.name !== target.node.type.name ||
    currentOwner.attrs["id"] !== target.node.attrs["id"]
  ) {
    return failure(
      "stale_annotated_figure_owner",
      "The Annotated Figure owner is no longer current.",
    );
  }

  const model = resolveAnnotatedFigureModel({ node: currentOwner, pos: target.pos });
  return model
    ? { ok: true, model }
    : failure("invalid_annotated_figure_model", "The Annotated Figure structure is invalid.");
}

function applyChecked(
  tr: Transaction,
  apply: (transform: Transform) => void,
): CheckedMutationResult<Transaction> {
  try {
    const probe = new Transform(tr.doc);
    apply(probe);
    probe.doc.check();
    for (const step of probe.steps) tr.step(step);
    tr.doc.check();
    return { ok: true, tr };
  } catch (error) {
    return failure(
      "invalid_document_after_annotated_figure_update",
      error instanceof Error
        ? error.message
        : "Updating the Annotated Figure produced an invalid document.",
    );
  }
}

function parsePosition(x: number, y: number): { x: number; y: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clampCoordinate(x), y: clampCoordinate(y) };
}

function clampCoordinate(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function invalidPositionFailure(): CheckedMutationResult<never> {
  return failure("invalid_annotation_position", "Annotation coordinates must be finite numbers.");
}

function missingAnnotationFailure(annotationId: string): CheckedMutationResult<never> {
  return failure("missing_annotation", `Annotation "${annotationId}" was not found.`);
}

function failure(
  code: string,
  message: string,
): {
  ok: false;
  issue: { code: string; message: string };
} {
  return { ok: false, issue: { code, message } };
}
