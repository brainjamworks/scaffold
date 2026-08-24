import type { EmbeddedNodeId } from "@scaffold/contracts";
import { PluginKey, Transaction } from "@tiptap/pm/state";

export type SemanticSelectionOrigin =
  | "editor"
  | "component"
  | "content-layout"
  | "document-outline"
  | "presentation-timeline";

export interface SemanticSelectionTransactionMeta {
  readonly intendedId: EmbeddedNodeId;
  readonly origin: "editor" | "content-layout" | "document-outline" | "presentation-timeline";
}

const semanticSelectionTransactionKey = new PluginKey<SemanticSelectionTransactionMeta>(
  "semanticSelectionOrigin",
);

export function setSemanticSelectionTransactionMeta(
  transaction: Transaction,
  meta: SemanticSelectionTransactionMeta,
): Transaction {
  return transaction.setMeta(semanticSelectionTransactionKey, Object.freeze({ ...meta }));
}

export function readSemanticSelectionTransactionMeta(
  transaction: Transaction,
): SemanticSelectionTransactionMeta | null {
  const visited = new Set<Transaction>();
  let current = transaction;

  while (!visited.has(current)) {
    visited.add(current);
    const directMeta = current.getMeta(semanticSelectionTransactionKey);
    if (directMeta) return directMeta;

    const appendedTransaction: unknown = current.getMeta("appendedTransaction");
    if (!(appendedTransaction instanceof Transaction)) return null;
    current = appendedTransaction;
  }

  return null;
}
