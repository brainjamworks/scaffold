import type { EmbeddedNodeId } from "@scaffold/contracts";

export type SemanticProjectionDiagnosticCode =
  | "definition-callback-failed"
  | "invalid-definition-description"
  | "invalid-published-candidate"
  | "duplicate-published-candidate"
  | "invalid-activation-relationship"
  | "missing-mounted-definition";

/** A payload-safe diagnostic: node identities and code-defined node types only. */
export interface SemanticProjectionDiagnostic {
  readonly code: SemanticProjectionDiagnosticCode;
  readonly ownerId: EmbeddedNodeId;
  readonly candidateId: EmbeddedNodeId | null;
  readonly ownerNodeType: string;
  readonly candidateNodeType: string | null;
}
