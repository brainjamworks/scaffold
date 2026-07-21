import type { Editor as TiptapEditor } from "@tiptap/core";

import { replaceRangeWithNodeChecked } from "@/document/model/commands/checked-transactions";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { isInlineReplacementRange } from "@/editor/rich-text/model/inline-replacement-range";
import { isNodeSelection } from "@/editor/selection/selection-facts";
import { setNodeSelectionInTransaction } from "@/editor/selection/selection-transactions";

import {
  normalizeVocabularyText,
  VOCABULARY_TERM_NODE_NAME,
  type VocabularyTermAttrs,
} from "../model/VocabularyTermNode";

export interface VocabularyTermTarget extends VocabularyTermAttrs {
  from: number;
  to: number;
  mode: "insert" | "update";
}

export function selectedVocabularyTerm(editor: TiptapEditor): VocabularyTermTarget | null {
  const { selection } = editor.state;
  if (!isNodeSelection(selection)) return null;
  if (selection.node.type.name !== VOCABULARY_TERM_NODE_NAME) return null;

  return {
    from: selection.from,
    to: selection.to,
    mode: "update",
    term: normalizeVocabularyText(selection.node.attrs["term"]),
    definition: normalizeVocabularyText(selection.node.attrs["definition"]),
  };
}

export function resolveVocabularyTermTarget(editor: TiptapEditor): VocabularyTermTarget {
  const selectedTerm = selectedVocabularyTerm(editor);
  if (selectedTerm) return selectedTerm;

  const { from, to } = editor.state.selection;
  return {
    from,
    to,
    mode: "insert",
    term: editor.state.doc.textBetween(from, to, " ").trim(),
    definition: "",
  };
}

export function canApplyVocabularyTermToEditor(
  editor: TiptapEditor,
  target: VocabularyTermTarget = resolveVocabularyTermTarget(editor),
): boolean {
  const vocabularyTerm = editor.schema.nodes[VOCABULARY_TERM_NODE_NAME];
  if (!vocabularyTerm) return false;

  if (target.mode === "update") {
    if (!isValidEditorDocPos(editor, target.from)) return false;
    return editor.state.doc.nodeAt(target.from)?.type.name === VOCABULARY_TERM_NODE_NAME;
  }

  if (
    !isValidEditorDocPos(editor, target.from) ||
    !isValidEditorDocPos(editor, target.to) ||
    !isInlineReplacementRange(editor, target.from, target.to)
  ) {
    return false;
  }

  const node = vocabularyTerm.create({
    term: normalizeVocabularyText(target.term) || "Term",
    definition: "Definition",
  });
  const result = replaceRangeWithNodeChecked({
    tr: editor.state.tr,
    from: target.from,
    to: target.to,
    node,
  });
  if (!result.ok) return false;

  return setNodeSelectionInTransaction(result.tr, target.from);
}

export function applyVocabularyTermToEditor(
  editor: TiptapEditor,
  target: VocabularyTermTarget,
  attrs: VocabularyTermAttrs,
): boolean {
  const vocabularyTerm = editor.schema.nodes[VOCABULARY_TERM_NODE_NAME];
  const term = normalizeVocabularyText(attrs.term);
  const definition = normalizeVocabularyText(attrs.definition);
  if (!vocabularyTerm || !term || !definition) return false;

  if (target.mode === "update") {
    if (!isValidEditorDocPos(editor, target.from)) return false;
    const node = editor.state.doc.nodeAt(target.from);
    if (!node || node.type.name !== VOCABULARY_TERM_NODE_NAME) return false;

    const tr = editor.state.tr.setNodeMarkup(target.from, undefined, {
      ...node.attrs,
      term,
      definition,
    });
    if (!setNodeSelectionInTransaction(tr, target.from)) return false;
    editor.view.dispatch(tr.scrollIntoView());
    return true;
  }

  if (
    !isValidEditorDocPos(editor, target.from) ||
    !isValidEditorDocPos(editor, target.to) ||
    !isInlineReplacementRange(editor, target.from, target.to)
  ) {
    return false;
  }

  const node = vocabularyTerm.create({ term, definition });
  const result = replaceRangeWithNodeChecked({
    tr: editor.state.tr,
    from: target.from,
    to: target.to,
    node,
  });
  if (!result.ok) return false;
  if (!setNodeSelectionInTransaction(result.tr, target.from)) return false;
  editor.view.dispatch(result.tr.scrollIntoView());
  return true;
}

export function clearVocabularyTermFromEditor(
  editor: TiptapEditor,
  target: VocabularyTermTarget,
): boolean {
  if (target.mode !== "update") return false;
  if (!isValidEditorDocPos(editor, target.from)) return false;
  const node = editor.state.doc.nodeAt(target.from);
  if (!node || node.type.name !== VOCABULARY_TERM_NODE_NAME) return false;
  const term = normalizeVocabularyText(node.attrs["term"]);
  const tr = editor.state.tr;
  if (term) {
    tr.replaceRangeWith(target.from, target.from + node.nodeSize, editor.schema.text(term));
  } else {
    tr.delete(target.from, target.from + node.nodeSize);
  }
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}
