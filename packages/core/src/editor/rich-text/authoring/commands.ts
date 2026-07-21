import type { Editor } from "@tiptap/core";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { isNodeSelection } from "@/editor/selection/selection-facts";
import { setNodeSelectionInTransaction } from "@/editor/selection/selection-transactions";
import {
  deleteNodeChecked,
  replaceRangeWithNodeChecked,
} from "@/document/model/commands/checked-transactions";

import { cleanMathLiveLatex } from "@/editor/rich-text/math/authoring/math-live";
import { isInlineReplacementRange } from "@/editor/rich-text/model/inline-replacement-range";
import {
  DEFAULT_INLINE_ICON_SIZE,
  DEFAULT_INLINE_ICON_VALUE,
  INLINE_ICON_NODE_NAME,
  readInlineIconSize,
  readInlineIconValue,
} from "@/editor/rich-text/inline-icon/model/InlineIconNode";
import type { IconSize, IconValue } from "@/schemas/media/icon";

export interface InlineMathTarget {
  from: number;
  to: number;
  latex: string;
  mode: "insert" | "update";
}

export function selectedInlineMath(editor: Editor): InlineMathTarget | null {
  const { selection } = editor.state;
  if (!isNodeSelection(selection)) return null;
  if (selection.node.type.name !== "inlineMath") return null;

  return {
    from: selection.from,
    to: selection.to,
    latex: String(selection.node.attrs["latex"] ?? ""),
    mode: "update",
  };
}

export function resolveInlineMathTarget(editor: Editor): InlineMathTarget {
  const selectedMath = selectedInlineMath(editor);
  if (selectedMath) return selectedMath;

  const { from, to } = editor.state.selection;
  return {
    from,
    to,
    latex: editor.state.doc.textBetween(from, to, " ").trim(),
    mode: "insert",
  };
}

export function applyInlineMathToEditor(
  editor: Editor,
  target: InlineMathTarget,
  latex: string,
): boolean {
  const inlineMath = editor.schema.nodes["inlineMath"];
  if (!inlineMath) return false;

  if (target.mode === "update") {
    if (!isValidEditorDocPos(editor, target.from)) return false;
    const node = editor.state.doc.nodeAt(target.from);
    if (!node || node.type.name !== "inlineMath") return false;

    const tr = editor.state.tr.setNodeMarkup(target.from, undefined, {
      ...node.attrs,
      latex,
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

  const node = inlineMath.create({ latex });
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

export function activateInlineMathInEditor(editor: Editor): boolean {
  const target = resolveInlineMathTarget(editor);
  return applyInlineMathToEditor(editor, target, cleanMathLiveLatex(target.latex));
}

export interface InlineIconTarget {
  from: number;
  to: number;
  mode: "insert" | "update";
  size: IconSize;
  value: IconValue | null;
}

export function selectedInlineIcon(editor: Editor): InlineIconTarget | null {
  const { selection } = editor.state;
  if (!isNodeSelection(selection)) return null;
  if (selection.node.type.name !== INLINE_ICON_NODE_NAME) return null;

  return {
    from: selection.from,
    to: selection.to,
    mode: "update",
    size: readInlineIconSize(selection.node.attrs["size"]),
    value: readInlineIconValue(selection.node.attrs["value"]),
  };
}

export function resolveInlineIconTarget(editor: Editor): InlineIconTarget {
  const selectedIcon = selectedInlineIcon(editor);
  if (selectedIcon) return selectedIcon;

  const { from, to } = editor.state.selection;
  return {
    from,
    to,
    mode: "insert",
    size: DEFAULT_INLINE_ICON_SIZE,
    value: null,
  };
}

export function canApplyInlineIconToEditor(
  editor: Editor,
  target: InlineIconTarget = resolveInlineIconTarget(editor),
): boolean {
  const inlineIcon = editor.schema.nodes[INLINE_ICON_NODE_NAME];
  if (!inlineIcon) return false;

  if (target.mode === "update") {
    if (!isValidEditorDocPos(editor, target.from)) return false;
    return editor.state.doc.nodeAt(target.from)?.type.name === INLINE_ICON_NODE_NAME;
  }

  if (
    !isValidEditorDocPos(editor, target.from) ||
    !isValidEditorDocPos(editor, target.to) ||
    !isInlineReplacementRange(editor, target.from, target.to)
  ) {
    return false;
  }

  const node = inlineIcon.create({
    size: target.size,
    value: target.value ?? DEFAULT_INLINE_ICON_VALUE,
  });
  const result = replaceRangeWithNodeChecked({
    tr: editor.state.tr,
    from: target.from,
    to: target.to,
    node,
  });

  return result.ok && setNodeSelectionInTransaction(result.tr, target.from);
}

export function applyInlineIconToEditor(
  editor: Editor,
  target: InlineIconTarget,
  value: IconValue,
  size: IconSize = target.size,
): boolean {
  const inlineIcon = editor.schema.nodes[INLINE_ICON_NODE_NAME];
  if (!inlineIcon) return false;

  if (target.mode === "update") {
    if (!isValidEditorDocPos(editor, target.from)) return false;
    const node = editor.state.doc.nodeAt(target.from);
    if (!node || node.type.name !== INLINE_ICON_NODE_NAME) return false;

    const tr = editor.state.tr.setNodeMarkup(target.from, undefined, {
      ...node.attrs,
      size,
      value,
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

  const node = inlineIcon.create({ size, value });
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

export function setInlineIconSizeInEditor(
  editor: Editor,
  target: InlineIconTarget,
  size: IconSize,
): boolean {
  if (target.mode !== "update") return false;
  if (!isValidEditorDocPos(editor, target.from)) return false;

  const node = editor.state.doc.nodeAt(target.from);
  if (!node || node.type.name !== INLINE_ICON_NODE_NAME) return false;

  const tr = editor.state.tr.setNodeMarkup(target.from, undefined, {
    ...node.attrs,
    size,
  });
  if (!setNodeSelectionInTransaction(tr, target.from)) return false;

  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export function clearInlineIconFromEditor(editor: Editor, target: InlineIconTarget): boolean {
  if (target.mode !== "update") return false;
  if (!isValidEditorDocPos(editor, target.from)) return false;
  const node = editor.state.doc.nodeAt(target.from);
  if (!node || node.type.name !== INLINE_ICON_NODE_NAME) return false;

  const result = deleteNodeChecked({
    tr: editor.state.tr,
    pos: target.from,
  });
  if (!result.ok) return false;
  editor.view.dispatch(result.tr.scrollIntoView());
  return true;
}
