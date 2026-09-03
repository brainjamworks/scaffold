import type { JSONContent } from "@tiptap/core";
import {
  DragDropCanvasDataSchema,
  DragDropPayloadSchema,
  DragDropSettingsSchema,
  EmbeddedNodeIdSchema,
  type DragDropCanvasData,
  type DragDropPrivateAssessment,
  type DragDropSettings,
  type EmbeddedNodeId,
} from "@scaffold/contracts";

export const DRAG_DROP_NODE_TYPE = "drag_drop";
export const SURFACE_DRAG_DROP_QUESTION_NODE_TYPE = "surface_drag_drop_question";
export const DRAG_DROP_OWNER_NODE_TYPES = [
  DRAG_DROP_NODE_TYPE,
  SURFACE_DRAG_DROP_QUESTION_NODE_TYPE,
] as const;
export const DRAG_DROP_CHILD_TYPES = [
  "assessment_title",
  "assessment_instructions",
  "assessment_prompt",
  "drag_drop_canvas",
  "assessment_actions_group",
] as const;
export interface DragDropAuthoredQuestion {
  readonly ownerId: EmbeddedNodeId;
  readonly settings: DragDropSettings;
  readonly canvas: DragDropCanvasData;
  readonly assessment: DragDropPrivateAssessment;
  readonly ready: boolean;
}

export interface DragDropPublicQuestion {
  readonly ownerId: EmbeddedNodeId;
  readonly settings: DragDropSettings;
  readonly canvas: DragDropCanvasData;
  readonly ready: boolean;
}
export function parseDragDropPublicQuestion(node: JSONContent): DragDropPublicQuestion {
  if (!isDragDropOwnerNodeType(node.type)) {
    throw new Error("Expected a Drag and Drop assessment owner.");
  }
  const content = Array.isArray(node.content) ? node.content : [];
  if (
    content.length !== DRAG_DROP_CHILD_TYPES.length ||
    content.some((child, index) => child.type !== DRAG_DROP_CHILD_TYPES[index])
  ) {
    throw new Error(
      "Drag and Drop must contain exactly one canonical assessment shell and canvas.",
    );
  }

  const attrs = isRecord(node.attrs) ? node.attrs : {};
  const canvasAttrs = isRecord(content[3]?.attrs) ? content[3].attrs : {};
  EmbeddedNodeIdSchema.parse(canvasAttrs["id"]);
  const canvas = DragDropCanvasDataSchema.parse(canvasAttrs["data"]);

  return {
    ownerId: EmbeddedNodeIdSchema.parse(attrs["id"]),
    settings: DragDropSettingsSchema.parse(attrs["settings"]),
    canvas,
    ready: canvas.image !== null && canvas.imageAspectRatio !== null && canvas.markers.length > 0,
  };
}

export function parseDragDropAuthoredQuestion(node: JSONContent): DragDropAuthoredQuestion {
  const publicQuestion = parseDragDropPublicQuestion(node);
  const attrs = isRecord(node.attrs) ? node.attrs : {};
  const payload = DragDropPayloadSchema.parse({
    canvas: publicQuestion.canvas,
    assessment: attrs["assessment"],
  });
  return { ...publicQuestion, canvas: payload.canvas, assessment: payload.assessment };
}
export function isDragDropOwnerNodeType(
  value: unknown,
): value is (typeof DRAG_DROP_OWNER_NODE_TYPES)[number] {
  return DRAG_DROP_OWNER_NODE_TYPES.some((nodeType) => nodeType === value);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
