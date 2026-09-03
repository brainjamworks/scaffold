export type FullSlideQuestionFamily =
  | "categorise"
  | "dropdown"
  | "drag-drop"
  | "fill-blanks"
  | "image-hotspot"
  | "matching"
  | "multiple-choice"
  | "multiselect"
  | "sequencing";

const FAMILY_BY_NODE_TYPE = {
  surface_categorise_question: "categorise",
  surface_dropdown_question: "dropdown",
  surface_drag_drop_question: "drag-drop",
  surface_fill_blanks_question: "fill-blanks",
  surface_image_hotspot_question: "image-hotspot",
  surface_matching_question: "matching",
  surface_multiple_choice_question: "multiple-choice",
  surface_multiselect_question: "multiselect",
  surface_sequencing_question: "sequencing",
} as const satisfies Readonly<Record<string, FullSlideQuestionFamily>>;

export function fullSlideQuestionFamilyForNodeType(nodeType: string): FullSlideQuestionFamily {
  const family = (FAMILY_BY_NODE_TYPE as Readonly<Record<string, FullSlideQuestionFamily>>)[
    nodeType
  ];
  if (family === undefined) {
    throw new Error(`Unsupported full-slide question node type "${nodeType}".`);
  }
  return family;
}

export function fullSlideQuestionStageAttributes(nodeType: string): {
  readonly "data-full-slide-question-stage": "";
  readonly "data-full-slide-question-family": FullSlideQuestionFamily;
} {
  return {
    "data-full-slide-question-stage": "",
    "data-full-slide-question-family": fullSlideQuestionFamilyForNodeType(nodeType),
  };
}
