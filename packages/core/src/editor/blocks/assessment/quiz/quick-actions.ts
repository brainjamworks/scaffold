import type { Editor as TiptapEditor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Icon } from "@phosphor-icons/react";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";

import { getQuizChildBlock } from "./quiz-authoring";

/**
 * An authoring action resolved against the active embedded child, ready
 * to render into the quiz stage meta row. Only `kind: 'action'` controls
 * are surfaced; path-based settings stay in the settings sheet.
 */
export interface ResolvedQuickAction {
  id: string;
  label: string;
  icon?: Icon;
  /**
   * Evaluated against the live editor (subscribe to selection changes
   * inside the action button — keeps re-renders narrow). Returns true
   * when the action can fire from the current cursor / state.
   */
  canRun: (ctx: { editor: TiptapEditor }) => boolean;
  /** Fires the child block authoring action. */
  run: () => void;
}

/**
 * Pulls the active question's `authoringControls` out of its
 * registered block definition, filtered to content-authoring actions
 * (`kind: 'action'`). Path-based settings controls are deliberately not
 * part of this action set. New content-shape actions declared by
 * question blocks (e.g. "Create blank") light up automatically.
 */
export function resolveActiveQuestionQuickActions({
  activeIndex,
  editor,
  getPos,
  node,
  nodeType,
}: {
  activeIndex: number;
  editor: TiptapEditor;
  getPos: (() => number | undefined) | undefined;
  node: ProseMirrorNode;
  nodeType: string;
}): ResolvedQuickAction[] {
  if (activeIndex < 0) return [];
  const safeGetPosWrapper = getPos ? (): number | undefined => safeGetPos(getPos) : undefined;
  const child = getQuizChildBlock({
    blockDefinitions: builtInBlockRegistry,
    getPos: safeGetPosWrapper,
    index: activeIndex,
    node,
  });
  if (!child) return [];
  const authoringControls = builtInBlockRegistry.getByNodeType(nodeType)?.authoringControls;
  if (!authoringControls) return [];
  const pos = child.pos;
  const id = child.node.attrs["id"];
  const targetId = typeof id === "string" ? id : undefined;

  const actions: ResolvedQuickAction[] = [];
  for (const control of authoringControls.controls({
    editor,
    nodeType,
    pos,
    ...(targetId ? { targetId } : {}),
  })) {
    if (control.kind !== "action") continue;
    actions.push({
      id: control.id,
      label: control.label,
      ...(control.icon ? { icon: control.icon } : {}),
      canRun: () => !control.disabled && Boolean(control.run),
      run: () => control.run?.(),
    });
  }
  return actions;
}
