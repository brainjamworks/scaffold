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
};

export function questionTypeTag(nodeName: string): string {
  return QUESTION_TYPE_TAGS[nodeName] ?? nodeName.toUpperCase();
}
