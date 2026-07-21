/**
 * Schema-only labels used in node `group:` declarations and slot `content:`
 * expressions.
 *
 * `block` and `inline` are ProseMirror/Tiptap's broad built-in groups.
 * These custom groups are narrow ProseMirror tokens for private field/slot
 * nodes. `text_content` is curated text-oriented content. `rich_content` is
 * an explicit opt-in group for selected ordinary Scaffold blocks. UI
 * behavior comes from registries and command descriptors; it does not derive
 * from these group strings.
 */
export const BLOCK_CONTENT = "block";
export const INLINE_CONTENT = "inline";
export const COURSE_BLOCK_CONTENT = "course_block";
export const ASSESSMENT_QUESTION_CONTENT = "assessment_question";
export const ARRANGEMENT_CONTENT = "arrangement";
export const CELL_ARRANGEMENT_CONTENT = "cell_arrangement";
export const SECTION_ARRANGEMENT_CONTENT = "section_arrangement";
export const TEXT_CONTENT = "text_content";
export const RICH_CONTENT = "rich_content";

/**
 * Narrow block group for fill-blank bodies.
 *
 * Despite the name, this is not the inline blank atom group. `fill_blank` is a
 * normal inline node inside paragraphs. This group marks paragraph-like
 * textblocks that may host those inline blanks while excluding broader
 * `text_content` blocks such as block math.
 */
export const FILL_BLANK_INLINE_CONTENT = "fill_blank_inline_content";

export interface TextContentExpressionOptions {
  required?: boolean;
}

export interface RichContentExpressionOptions {
  required?: boolean;
}

export interface FieldContainerSpecOptions extends TextContentExpressionOptions {
  content?: string;
  selectable?: boolean;
  draggable?: boolean;
}

export function textContentExpression(options: TextContentExpressionOptions = {}): string {
  return `${TEXT_CONTENT}${options.required === false ? "*" : "+"}`;
}

export function richContentExpression(options: RichContentExpressionOptions = {}): string {
  return `(${TEXT_CONTENT} | ${RICH_CONTENT})${options.required === false ? "*" : "+"}`;
}

export function fieldContainerSpec(options: FieldContainerSpecOptions = {}) {
  const base = {
    content: options.content ?? textContentExpression(options),
    defining: true,
    isolating: true,
    selectable: options.selectable ?? false,
  };

  if (typeof options.draggable === "boolean") {
    return { ...base, draggable: options.draggable };
  }

  return base;
}
