import type { EmbeddedNodeId, ScaffoldDocumentContent } from "@scaffold/contracts";
import type { Result as ResultType } from "better-result";

import type { LearnerInteractionTurnReport } from "./learner-interaction-turn-report";

export interface LearnerInteractionPreviewDocument {
  readonly document: ScaffoldDocumentContent;
  readonly surfaceId: EmbeddedNodeId;
}

export type LearnerInteractionPreviewSnapshot =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly surfaceId: EmbeddedNodeId }
  | { readonly status: "ready"; readonly surfaceId: EmbeddedNodeId }
  | {
      readonly status: "error";
      readonly surfaceId: EmbeddedNodeId;
      readonly error: LearnerInteractionPreviewLoadError;
    };

export type LearnerInteractionPreviewLoadError =
  | {
      readonly reason: "preview-load-superseded";
      readonly surfaceId: EmbeddedNodeId;
    }
  | { readonly reason: "preview-not-slideshow"; readonly mode: "page" }
  | {
      readonly reason: "preview-surface-not-current";
      readonly surfaceId: EmbeddedNodeId;
      readonly currentSurfaceIds: readonly EmbeddedNodeId[];
    }
  | {
      readonly reason: "preview-surface-not-configured";
      readonly surfaceId: EmbeddedNodeId;
    }
  | {
      readonly reason: "preview-document-invalid";
      readonly issues: readonly {
        readonly path: readonly (string | number)[];
        readonly message: string;
      }[];
    }
  | { readonly reason: "preview-requires-scaffold-plus" }
  | {
      readonly reason: "preview-unsupported-core-format";
      readonly documentVersion: number;
      readonly supportedVersion: number;
    }
  | {
      readonly reason: "preview-unavailable-content";
      readonly unavailableContent: readonly {
        readonly kind: "block" | "layout" | "surface";
        readonly capabilityId: string;
        readonly stableId: string;
      }[];
    }
  | { readonly reason: "preview-projection-warning"; readonly warningCount: number }
  | { readonly reason: "preview-payload-too-large" }
  | { readonly reason: "preview-runtime-unavailable"; readonly cause: unknown }
  | { readonly reason: "preview-services-unavailable"; readonly cause: unknown };

export type LearnerInteractionPreviewLoadResult = ResultType<
  void,
  LearnerInteractionPreviewLoadError
>;

export interface LearnerInteractionPreviewReportsPort {
  subscribeReports(listener: (report: LearnerInteractionTurnReport) => void): () => void;
}

/** Framework-neutral author-preview boundary. */
export interface LearnerInteractionPreviewPort extends LearnerInteractionPreviewReportsPort {
  getSnapshot(): LearnerInteractionPreviewSnapshot;
  subscribe(listener: () => void): () => void;
  loadCurrentDocument(
    input: LearnerInteractionPreviewDocument,
  ): Promise<LearnerInteractionPreviewLoadResult>;
}
