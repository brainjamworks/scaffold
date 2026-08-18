import type { EmbeddedNodeId } from "@scaffold/contracts";
import { PluginKey, type Transaction } from "@tiptap/pm/state";

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
  return transaction.getMeta(semanticSelectionTransactionKey) ?? null;
}
