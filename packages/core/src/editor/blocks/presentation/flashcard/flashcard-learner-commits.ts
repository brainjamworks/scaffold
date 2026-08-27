import type { Editor } from "@tiptap/core";

export type FlashcardLearnerCommit =
  | Readonly<{ type: "selected" | "flipped" | "rated"; targetId: string }>
  | Readonly<{ type: "completed" }>;

type FlashcardLearnerCommitListener = (commit: FlashcardLearnerCommit) => void;

const listenersByEditor = new WeakMap<Editor, Map<string, Set<FlashcardLearnerCommitListener>>>();

export function publishFlashcardLearnerCommits(
  editor: Editor | undefined,
  blockId: string,
  commits: readonly FlashcardLearnerCommit[],
): void {
  if (!editor || commits.length === 0) return;
  const listeners = listenersByEditor.get(editor)?.get(blockId);
  if (!listeners) return;
  for (const commit of commits) {
    for (const listener of [...listeners]) listener(commit);
  }
}

export function subscribeToFlashcardLearnerCommits(
  editor: Editor,
  blockId: string,
  listener: FlashcardLearnerCommitListener,
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
