import type { EmbeddedNodeId } from "@scaffold/contracts";

import type { LearnerInteractionTurnReport } from "./learner-interaction-turn-report";

export type LearnerInteractionPreviewSnapshot =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly surfaceId: EmbeddedNodeId }
  | { readonly status: "ready"; readonly surfaceId: EmbeddedNodeId };

export interface LearnerInteractionPreviewReportsPort {
  subscribeReports(listener: (report: LearnerInteractionTurnReport) => void): () => void;
}
