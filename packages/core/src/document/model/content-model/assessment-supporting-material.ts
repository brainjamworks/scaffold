import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

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
