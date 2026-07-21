import type { ResolvedPos } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";

import { isNodeSelection } from "@/editor/selection/selection-facts";
import { setNodeSelectionInTransaction } from "@/editor/selection/selection-transactions";
import {
  FillBlankPrivateAssessmentEntrySchema,
  FillBlanksPrivateAssessmentSchema,
  type FillBlankPrivateAssessmentEntry,
} from "@scaffold/contracts";

import { createFillBlankAttrs } from "./fill-blank-shared";

export function createFillBlankAssessmentEntry(selectedText = ""): FillBlankPrivateAssessmentEntry {
  return FillBlankPrivateAssessmentEntrySchema.parse({
    acceptedAnswers: selectedText ? [selectedText] : [""],
    feedback: null,
    caseSensitive: false,
    trimWhitespace: true,
  });
}

function closestDepth($pos: ResolvedPos, nodeType: string): number | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === nodeType) return depth;
  }
  return null;
}

function selectionEndForInlineValidation(editor: Editor): ResolvedPos {
  const { selection } = editor.state;
  if (selection.empty) return selection.$to;

  return editor.state.doc.resolve(Math.max(selection.from, selection.to - 1));
}

export function canApplyFillBlankToEditor(editor: Editor): boolean {
  if (!editor.schema.nodes["fill_blank"]) return false;

  const { selection } = editor.state;
  if (isNodeSelection(selection)) return false;

  const $from = selection.$from;
  const $to = selectionEndForInlineValidation(editor);
  const fromBodyDepth = closestDepth($from, "fill_blanks_body");
  const toBodyDepth = closestDepth($to, "fill_blanks_body");

  if (fromBodyDepth === null || toBodyDepth === null) return false;
  if ($from.before(fromBodyDepth) !== $to.before(toBodyDepth)) return false;
  if (!$from.parent.inlineContent || !$to.parent.inlineContent) return false;
  if ($from.parent !== $to.parent) return false;

  return true;
}

export function applyFillBlankToEditor(editor: Editor): boolean {
  const fillBlank = editor.schema.nodes["fill_blank"];
  if (!fillBlank || !canApplyFillBlankToEditor(editor)) return false;

  const { from, to } = editor.state.selection;
  const selectedText = editor.state.doc.textBetween(from, to, " ").trim();
  const attrs = createFillBlankAttrs(selectedText);
  const node = fillBlank.create(attrs);

  try {
    const tr = editor.state.tr.replaceRangeWith(from, to, node);
    const fillBlanksDepth = closestDepth(editor.state.doc.resolve(from), "fill_blanks");
    if (fillBlanksDepth !== null) {
      const parent = editor.state.doc.resolve(from).node(fillBlanksDepth);
      const parentPos = editor.state.doc.resolve(from).before(fillBlanksDepth);
      const assessment = FillBlanksPrivateAssessmentSchema.parse(parent.attrs["assessment"] ?? {});
      tr.setNodeMarkup(parentPos, null, {
        ...parent.attrs,
        assessment: {
          ...assessment,
          blanksById: {
            ...assessment.blanksById,
            [attrs.id]: createFillBlankAssessmentEntry(selectedText),
          },
        },
      });
    }
    if (!setNodeSelectionInTransaction(tr, from)) return false;
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
    return true;
  } catch {
    return false;
  }
}
