import type { EmbeddedNodeId, ScaffoldDocumentContent } from "@scaffold/contracts";
import type { Result as ResultType } from "better-result";

import type { PresentationCompilationError } from "./presentation-compiler";

export interface PresentationPreviewDocument {
  readonly document: ScaffoldDocumentContent;
  readonly surfaceId: EmbeddedNodeId;
}

export type PresentationPreviewPhase =
  | "awaiting-start"
  | "playing"
  | "paused"
  | "held"
  | "completed"
  | "stopped";

export type PresentationPreviewSnapshot =
  | { readonly status: "idle" }
  | {
      readonly status: "loading";
      readonly surfaceId: EmbeddedNodeId;
    }
  | {
      readonly status: "ready";
      readonly surfaceId: EmbeddedNodeId;
      readonly phase: PresentationPreviewPhase;
      readonly currentTimeMs: number;
      readonly durationMs: number;
    }
  | {
      readonly status: "error";
      readonly surfaceId: EmbeddedNodeId;
      readonly error: PresentationPreviewLoadError;
    };

export type PresentationPreviewLoadError =
  | PresentationCompilationError
  | {
      readonly reason: "preview-load-superseded";
      readonly surfaceId: EmbeddedNodeId;
    }
  | {
      readonly reason: "preview-not-slideshow";
      readonly mode: "page";
    }
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
  | {
      readonly reason: "preview-projection-warning";
      readonly warningCount: number;
    }
  | { readonly reason: "preview-payload-too-large" }
  | { readonly reason: "preview-runtime-unavailable"; readonly cause: unknown }
  | { readonly reason: "preview-services-unavailable"; readonly cause: unknown };

export type PresentationPreviewOperationError =
  | {
      readonly reason: "preview-not-ready";
      readonly operation: "play" | "pause" | "seek";
      readonly status: Exclude<PresentationPreviewSnapshot["status"], "ready">;
    }
  | {
      readonly reason: "preview-surface-mismatch";
      readonly operation: "pause";
      readonly requestedSurfaceId: EmbeddedNodeId;
      readonly liveSurfaceId: EmbeddedNodeId;
    };

export type PresentationPreviewSeekError =
  | PresentationPreviewOperationError
  | {
      readonly reason: "seek-out-of-range";
      readonly requestedTimeMs: number;
      readonly durationMs: number;
    };

export interface PresentationPreviewSeekReport {
  readonly kind: "applied" | "superseded";
  readonly timeMs: number;
}

export type PresentationPreviewLoadResult = ResultType<void, PresentationPreviewLoadError>;
export type PresentationPreviewOperationResult = ResultType<
  void,
  PresentationPreviewOperationError
>;
export type PresentationPreviewSeekResult = ResultType<
  PresentationPreviewSeekReport,
  PresentationPreviewSeekError
>;

export interface PresentationPreviewPlaybackPort {
  getSnapshot(): PresentationPreviewSnapshot;
  subscribe(listener: () => void): () => void;
  play(): PresentationPreviewOperationResult;
  pause(): PresentationPreviewOperationResult;
  seek(timeMs: number): Promise<PresentationPreviewSeekResult>;
}

/** Framework-neutral author-preview boundary. */
export interface PresentationPreviewPort extends PresentationPreviewPlaybackPort {
  loadCurrentDocument(input: PresentationPreviewDocument): Promise<PresentationPreviewLoadResult>;
}
