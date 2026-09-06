import type { EmbeddedNodeId } from "@scaffold/contracts";
import { PluginKey, Transaction } from "@tiptap/pm/state";

export type EditorSelectionOrigin =
  | "editor"
  | "component"
  | "document-outline"
  | "presentation-timeline";

export interface EditorSelectionTransactionMeta {
  readonly intendedId: EmbeddedNodeId;
  readonly origin: "editor" | "document-outline" | "presentation-timeline";
}

const editorSelectionTransactionKey = new PluginKey<EditorSelectionTransactionMeta>(
  "editorSelectionOrigin",
);

export function setEditorSelectionTransactionMeta(
  transaction: Transaction,
  meta: EditorSelectionTransactionMeta,
): Transaction {
  return transaction.setMeta(editorSelectionTransactionKey, Object.freeze({ ...meta }));
}

export function readEditorSelectionTransactionMeta(
  transaction: Transaction,
): EditorSelectionTransactionMeta | null {
  const visited = new Set<Transaction>();
  let current = transaction;

  while (!visited.has(current)) {
    visited.add(current);
    const directMeta = current.getMeta(editorSelectionTransactionKey);
    if (directMeta) return directMeta;

    const appendedTransaction: unknown = current.getMeta("appendedTransaction");
    if (!(appendedTransaction instanceof Transaction)) return null;
    current = appendedTransaction;
  }

  return null;
}
