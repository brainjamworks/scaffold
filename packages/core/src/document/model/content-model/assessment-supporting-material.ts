import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";

import { isFieldContentEmpty } from "./is-field-content-empty";

export const ASSESSMENT_SUPPORTING_MATERIAL_NODE_TYPE = "assessment_supporting_material";
export const ASSESSMENT_SUPPORTING_MATERIAL_DISPLAY_SIZES = ["small", "medium", "large"] as const;
export const DEFAULT_ASSESSMENT_SUPPORTING_MATERIAL_DISPLAY_SIZE = "medium";

export const ASSESSMENT_SUPPORTING_MATERIAL_SLOT_ATTRIBUTE = "data-slot";
export const ASSESSMENT_SUPPORTING_MATERIAL_SLOT = "assessment-supporting-material";
export const ASSESSMENT_SUPPORTING_MATERIAL_DISPLAY_SIZE_ATTRIBUTE = "data-display-size";

export type AssessmentSupportingMaterialDisplaySize =
  (typeof ASSESSMENT_SUPPORTING_MATERIAL_DISPLAY_SIZES)[number];

export interface AssessmentSupportingMaterialJSON extends JSONContent {
  type: typeof ASSESSMENT_SUPPORTING_MATERIAL_NODE_TYPE;
  attrs: {
    displaySize: AssessmentSupportingMaterialDisplaySize;
  };
  content: JSONContent[];
}

export type SupportingMaterialValidationResult =
  | { ok: true }
  | {
      ok: false;
      code: "forbidden_supporting_material_descendant";
      nodeType: string;
      path: Array<string | number>;
    };

const FORBIDDEN_SUPPORTING_MATERIAL_DESCENDANT_TYPES = new Set([
  "quiz",
  "surface",
  "region",
  "courseDocument",
  ASSESSMENT_SUPPORTING_MATERIAL_NODE_TYPE,
]);

export function normalizeAssessmentSupportingMaterialDisplaySize(
  value: unknown,
): AssessmentSupportingMaterialDisplaySize {
  if (value === "small" || value === "medium" || value === "large") {
    return value;
  }
  return DEFAULT_ASSESSMENT_SUPPORTING_MATERIAL_DISPLAY_SIZE;
}

export function createAssessmentSupportingMaterialJSON(): AssessmentSupportingMaterialJSON {
  return {
    type: ASSESSMENT_SUPPORTING_MATERIAL_NODE_TYPE,
    attrs: { displaySize: DEFAULT_ASSESSMENT_SUPPORTING_MATERIAL_DISPLAY_SIZE },
    content: [{ type: "paragraph" }],
  };
}

export function createAssessmentActionsGroupJSON(): JSONContent {
  return {
    type: "assessment_actions_group",
    content: [
      { type: "assessment_hints_group" },
      createAssessmentSupportingMaterialJSON(),
      { type: "assessment_summary_feedback" },
    ],
  };
}

export function isAssessmentSupportingMaterialEmpty(node: ProseMirrorNode): boolean {
  return isFieldContentEmpty(node);
}

export function validateAssessmentSupportingMaterial(
  node: ProseMirrorNode | JSONContent,
): SupportingMaterialValidationResult {
  const children = getSupportingMaterialChildren(node);

  for (const [index, child] of children.entries()) {
    const violation = findForbiddenSupportingMaterialDescendant(child, ["content", index]);
    if (violation) return violation;
  }

  return { ok: true };
}

function findForbiddenSupportingMaterialDescendant(
  node: unknown,
  path: Array<string | number>,
): Exclude<SupportingMaterialValidationResult, { ok: true }> | null {
  const nodeType = getSupportingMaterialNodeType(node);

  if (
    FORBIDDEN_SUPPORTING_MATERIAL_DESCENDANT_TYPES.has(nodeType) ||
    Boolean(builtInBlockRegistry.getByNodeType(nodeType)?.capabilities?.assessment)
  ) {
    return {
      ok: false,
      code: "forbidden_supporting_material_descendant",
      nodeType,
      path,
    };
  }

  for (const [index, child] of getSupportingMaterialChildren(node).entries()) {
    const violation = findForbiddenSupportingMaterialDescendant(child, [...path, "content", index]);
    if (violation) return violation;
  }

  return null;
}

function getSupportingMaterialChildren(node: unknown): unknown[] {
  if (isProseMirrorNode(node)) {
    const children: ProseMirrorNode[] = [];
    node.forEach((child) => children.push(child));
    return children;
  }

  if (!isRecord(node)) return [];
  return Array.isArray(node["content"]) ? node["content"] : [];
}

function getSupportingMaterialNodeType(node: unknown): string {
  if (isProseMirrorNode(node)) return node.type.name;
  if (!isRecord(node)) return "";

  const nodeType = node["type"];
  return typeof nodeType === "string" ? nodeType : "";
}

function isProseMirrorNode(node: unknown): node is ProseMirrorNode {
  if (!isRecord(node) || !isRecord(node["type"])) return false;
  return typeof node["type"]["name"] === "string" && typeof node["forEach"] === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
