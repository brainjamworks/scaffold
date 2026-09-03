import type { ResolvedPos } from "@tiptap/pm/model";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";

import { isNodeSelection } from "@/editor/selection/selection-facts";
import { setNodeSelectionInTransaction } from "@/editor/selection/selection-transactions";
import {
  FillBlankPrivateAssessmentEntrySchema,
  FillBlankAttrsSchema,
  FillBlanksPrivateAssessmentSchema,
  type FillBlankPrivateAssessmentEntry,
} from "@scaffold/contracts";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";

import { createFillBlankAttrs, isFillBlanksAssessmentOwnerNodeType } from "@/editor/assessment/fill-blanks/fill-blank-shared";

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

function closestFillBlanksOwnerDepth($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (isFillBlanksAssessmentOwnerNodeType($pos.node(depth).type.name)) return depth;
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
    const fillBlanksDepth = closestFillBlanksOwnerDepth(editor.state.doc.resolve(from));
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

export function repairFillBlanksInEditor(editor: Editor): boolean {
  const tr = repairFillBlanksInTransaction(editor.state, editor.state.tr);
  if (!tr.docChanged) return false;
  editor.view.dispatch(tr);
  return true;
}

export function repairFillBlanksInTransaction(state: EditorState, tr: Transaction): Transaction {
  state.doc.descendants((block, blockPos) => {
    if (!isFillBlanksAssessmentOwnerNodeType(block.type.name)) return true;
    const assessment = FillBlanksPrivateAssessmentSchema.parse(block.attrs["assessment"] ?? {});
    const blanksById: Record<string, FillBlankPrivateAssessmentEntry> = {};
    const seen = new Set<string>();
    let changed = false;

    block.descendants((child, offset) => {
      if (child.type.name !== "fill_blank") return true;
      const parsed = FillBlankAttrsSchema.safeParse(child.attrs);
      const originalId = parsed.success ? parsed.data.id.trim() : "";
      const canKeepId = originalId.length > 0 && !seen.has(originalId);
      const blankId = canKeepId ? originalId : createEmbeddedNodeId();
      const privateBlank = canKeepId
        ? assessment.blanksById[originalId]
        : originalId.length === 0
          ? assessment.blanksById[originalId]
          : undefined;
      blanksById[blankId] = privateBlank ?? createFillBlankAssessmentEntry();
      seen.add(blankId);

      if (blankId !== originalId || !parsed.success) {
        tr.setNodeMarkup(blockPos + 1 + offset, undefined, {
          ...child.attrs,
          id: blankId,
          placeholder: parsed.success ? parsed.data.placeholder : "",
        });
        changed = true;
      }
      if (!assessment.blanksById[blankId]) changed = true;
      return false;
    });

    if (changed || Object.keys(assessment.blanksById).length !== Object.keys(blanksById).length) {
      tr.setNodeMarkup(blockPos, undefined, {
        ...block.attrs,
        assessment: { ...assessment, blanksById },
      });
    }
    return false;
  });
  return tr;
}

export function cleanupRemovedFillBlanksInTransaction(
  oldState: EditorState,
  newState: EditorState,
  tr: Transaction,
): Transaction {
  const oldIdsByBlock = fillBlankIdsByBlock(oldState.doc);
  newState.doc.descendants((block, blockPos) => {
    if (!isFillBlanksAssessmentOwnerNodeType(block.type.name)) return true;
    const blockId = typeof block.attrs["id"] === "string" ? block.attrs["id"] : "";
    const oldIds = oldIdsByBlock.get(blockId);
    if (!oldIds) return false;
    const currentIds = fillBlankIds(block);
    const removedIds = [...oldIds].filter((id) => !currentIds.has(id));
    if (removedIds.length === 0) return false;

    const assessment = FillBlanksPrivateAssessmentSchema.parse(block.attrs["assessment"] ?? {});
    const blanksById = { ...assessment.blanksById };
    let changed = false;
    for (const id of removedIds) {
      if (!Object.hasOwn(blanksById, id)) continue;
      delete blanksById[id];
      changed = true;
    }
    if (changed) {
      tr.setNodeMarkup(blockPos, undefined, {
        ...block.attrs,
        assessment: { ...assessment, blanksById },
      });
    }
    return false;
  });
  return tr;
}

function fillBlankIdsByBlock(doc: ProseMirrorNode): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  doc.descendants((node) => {
    if (!isFillBlanksAssessmentOwnerNodeType(node.type.name)) return true;
    const blockId = typeof node.attrs["id"] === "string" ? node.attrs["id"] : "";
    out.set(blockId, fillBlankIds(node));
    return false;
  });
  return out;
}

function fillBlankIds(block: ProseMirrorNode): Set<string> {
  const ids = new Set<string>();
  block.descendants((node) => {
    if (node.type.name !== "fill_blank") return true;
    const id = typeof node.attrs["id"] === "string" ? node.attrs["id"].trim() : "";
    if (id) ids.add(id);
    return false;
  });
  return ids;
}
