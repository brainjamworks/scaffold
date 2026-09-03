/**
 * Compact mono-uppercase tags shown next to question pills + in the
 * stage meta row. Reserved (per design memory) for assessment chrome.
 */
export const QUESTION_TYPE_TAGS: Record<string, string> = {
  mcq: "MCQ",
  multiselect: "MULTI",
  dropdown: "DROP",
  sequencing: "SEQ",
  matching: "MATCH",
  categorise: "CLASSIFY",
  fill_blanks: "FILL",
  image_hotspot: "HOTSPOT",
  drag_drop: "DRAG",
  surface_multiple_choice_question: "MCQ",
  surface_multiselect_question: "MULTI",
  surface_dropdown_question: "DROP",
  surface_sequencing_question: "SEQ",
  surface_matching_question: "MATCH",
  surface_categorise_question: "CLASSIFY",
  surface_fill_blanks_question: "FILL",
  surface_image_hotspot_question: "HOTSPOT",
  surface_drag_drop_question: "DRAG",
};

export function questionTypeTag(nodeName: string): string {
  return QUESTION_TYPE_TAGS[nodeName] ?? nodeName.toUpperCase();
}
