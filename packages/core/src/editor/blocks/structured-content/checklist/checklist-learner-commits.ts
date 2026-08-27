import type { Editor } from "@tiptap/core";

export type ChecklistLearnerCommit =
  | Readonly<{ type: "checked" | "unchecked"; targetId: string }>
  | Readonly<{ type: "completed" }>;

type ChecklistLearnerCommitListener = (commit: ChecklistLearnerCommit) => void;

const listenersByEditor = new WeakMap<Editor, Map<string, Set<ChecklistLearnerCommitListener>>>();

export function publishChecklistLearnerCommits(
  editor: Editor,
  blockId: string,
  commits: readonly ChecklistLearnerCommit[],
): void {
  const listeners = listenersByEditor.get(editor)?.get(blockId);
  if (!listeners) return;
  for (const commit of commits) {
    for (const listener of [...listeners]) listener(commit);
  }
}

export function subscribeToChecklistLearnerCommits(
  editor: Editor,
  blockId: string,
  listener: ChecklistLearnerCommitListener,
): () => void {
  let listenersByBlock = listenersByEditor.get(editor);
  if (!listenersByBlock) {
    listenersByBlock = new Map();
    listenersByEditor.set(editor, listenersByBlock);
  }
  let listeners = listenersByBlock.get(blockId);
  if (!listeners) {
    listeners = new Set();
    listenersByBlock.set(blockId, listeners);
  }
  listeners.add(listener);

  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    listeners?.delete(listener);
    if (listeners?.size === 0) listenersByBlock?.delete(blockId);
    if (listenersByBlock?.size === 0) listenersByEditor.delete(editor);
  };
}
