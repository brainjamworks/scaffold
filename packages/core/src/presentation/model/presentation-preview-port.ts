import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Result as ResultType } from "better-result";

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
    };

export type PresentationPreviewOperationError =
  | {
      readonly reason: "preview-not-ready";
      readonly operation: "play" | "pause" | "seek";
      readonly status: "idle" | "loading" | "error";
    }
  | {
      readonly reason: "preview-surface-mismatch";
      readonly operation: "play" | "pause" | "seek";
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
