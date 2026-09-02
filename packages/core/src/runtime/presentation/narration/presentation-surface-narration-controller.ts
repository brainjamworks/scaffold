import type {
  EmbeddedNodeId,
  MediaSource,
  SurfacePresentationNarrationV1,
} from "@scaffold/contracts";
import { Result, type Result as ResultType } from "better-result";

import type { MediaPort } from "@/host/ports/media";

export type PresentationSurfaceNarrationStatus =
  | "idle"
  | "loading"
  | "paused"
  | "playing"
  | "buffering"
  | "seeking"
  | "ended"
  | "failed";

export type PresentationSurfaceNarrationSnapshotError =
  | { readonly reason: "playback-not-allowed" }
  | { readonly reason: "narration-unavailable"; readonly mediaErrorCode: number | null }
  | {
      readonly reason: "seek-out-of-range";
      readonly requestedTimeMs: number;
      readonly durationMs: number;
    }
  | {
      readonly reason: "seek-unsupported";
      readonly requestedTimeMs: number;
      readonly durationMs: number | null;
    };

export interface PresentationSurfaceNarrationSnapshot {
  readonly status: PresentationSurfaceNarrationStatus;
  readonly currentTimeMs: number;
  readonly durationMs: number | null;
  readonly error: PresentationSurfaceNarrationSnapshotError | null;
}

export interface PresentationSurfaceNarrationUnavailableError {
  readonly reason: "narration-unavailable";
  readonly surfaceId: EmbeddedNodeId;
  readonly source: MediaSource;
  readonly mediaErrorCode: number | null;
  readonly cause: unknown;
}

export interface PresentationSurfaceNarrationCancelledError {
  readonly reason: "cancelled";
  readonly surfaceId: EmbeddedNodeId;
  readonly operation: "load" | "play" | "seek";
}

export type PresentationSurfaceNarrationLoadError =
  | PresentationSurfaceNarrationUnavailableError
  | PresentationSurfaceNarrationCancelledError;

export type PresentationSurfaceNarrationPlayError =
  | {
      readonly reason: "playback-not-allowed";
      readonly surfaceId: EmbeddedNodeId;
      readonly cause: unknown;
    }
  | PresentationSurfaceNarrationUnavailableError
  | PresentationSurfaceNarrationCancelledError;

export type PresentationSurfaceNarrationSeekError =
  | {
      readonly reason: "seek-out-of-range";
      readonly surfaceId: EmbeddedNodeId;
      readonly requestedTimeMs: number;
      readonly durationMs: number;
    }
  | {
      readonly reason: "seek-unsupported";
      readonly surfaceId: EmbeddedNodeId;
      readonly requestedTimeMs: number;
      readonly durationMs: number | null;
      readonly cause: unknown;
    }
  | PresentationSurfaceNarrationUnavailableError
  | PresentationSurfaceNarrationCancelledError;

export interface PresentationSurfaceNarrationController {
  readonly surfaceId: EmbeddedNodeId;
  getSnapshot(): PresentationSurfaceNarrationSnapshot;
  getClockTimeMs(): number;
  subscribe(listener: () => void): () => void;
  load(
    narration: SurfacePresentationNarrationV1,
  ): Promise<ResultType<void, PresentationSurfaceNarrationLoadError>>;
  play(): Promise<ResultType<void, PresentationSurfaceNarrationPlayError>>;
  pause(): void;
  seek(timeMs: number): Promise<ResultType<void, PresentationSurfaceNarrationSeekError>>;
  dispose(): void;
}

export interface CreatePresentationSurfaceNarrationControllerInput {
  readonly surfaceId: EmbeddedNodeId;
  readonly mediaPort: Pick<MediaPort, "resolve"> | null;
  readonly createAudioElement?: () => HTMLAudioElement;
}

interface ActiveAudio {
  readonly audio: HTMLAudioElement;
  readonly source: MediaSource;
  readonly removeListeners: () => void;
}

const INITIAL_SNAPSHOT = freezeSnapshot({
  status: "idle",
  currentTimeMs: 0,
  durationMs: null,
  error: null,
});

export function createPresentationSurfaceNarrationController({
  surfaceId,
  mediaPort,
  createAudioElement = () => new Audio(),
}: CreatePresentationSurfaceNarrationControllerInput): PresentationSurfaceNarrationController {
  let active: ActiveAudio | null = null;
  let disposed = false;
  let snapshot = INITIAL_SNAPSHOT;
  let latestUnavailableError: PresentationSurfaceNarrationUnavailableError | null = null;
  let operationNumber = 0;
  let cancelPendingOperation: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const publish = (next: PresentationSurfaceNarrationSnapshot) => {
    if (disposed) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };

  const cleanupActive = () => {
    const current = active;
    if (!current) return;
    active = null;
    current.removeListeners();
    if (!current.audio.paused) current.audio.pause();
    current.audio.removeAttribute("src");
    current.audio.load();
  };

  const requireActive = () => {
    assertNotDisposed();
    if (!active || snapshot.status === "idle" || snapshot.status === "loading") {
      throw new Error("Surface narration is not loaded.");
    }
    return active;
  };

  const assertNotDisposed = () => {
    if (disposed) throw new Error("Surface narration controller is disposed.");
  };

  function startOperation<E>(cancellationError: E) {
    cancelPendingOperation?.();
    const number = ++operationNumber;
    let closed = false;
    let cancel!: () => void;
    const cancellation = new Promise<ResultType<void, E>>((resolve) => {
      cancel = () => {
        if (closed) return;
        closed = true;
        resolve(Result.err(cancellationError));
      };
    });
    cancelPendingOperation = cancel;
    return {
      cancellation,
      isCurrent: () => !closed && !disposed && operationNumber === number,
      finish() {
        if (cancelPendingOperation === cancel) cancelPendingOperation = null;
        closed = true;
      },
    };
  }

  function mountAudio(
    audio: HTMLAudioElement,
    source: MediaSource,
    settleLoad: (result: ResultType<void, PresentationSurfaceNarrationLoadError>) => void,
  ): ActiveAudio {
    const belongsToActiveSource = () => active?.audio === audio;
    const updateFromMedia = (
      status: PresentationSurfaceNarrationStatus,
      error = snapshot.error,
    ) => {
      if (!belongsToActiveSource()) return;
      publish(
        freezeSnapshot({
          status,
          currentTimeMs: readCurrentTimeMs(audio),
          durationMs: readDurationMs(audio),
          error,
        }),
      );
    };
    const handleMetadata = () => {
      latestUnavailableError = null;
      updateFromMedia(audio.paused ? "paused" : "playing", null);
      settleLoad(Result.ok());
    };
    const handlePlay = () => updateFromMedia("playing", null);
    const handlePause = () => updateFromMedia(audio.ended ? "ended" : "paused");
    const handlePlaying = () => updateFromMedia("playing", null);
    const handleWaiting = () => updateFromMedia("buffering");
    const handleTimeUpdate = () => updateFromMedia(snapshot.status);
    const handleEnded = () => updateFromMedia("ended");
    const handleDurationChange = () => updateFromMedia(snapshot.status);
    const handleError = () => {
      const error = unavailableError(source, audio.error?.code ?? null, null);
      publishUnavailable(error);
      settleLoad(Result.err(error));
    };
    const eventListeners = [
      ["loadedmetadata", handleMetadata],
      ["play", handlePlay],
      ["playing", handlePlaying],
      ["pause", handlePause],
      ["waiting", handleWaiting],
      ["timeupdate", handleTimeUpdate],
      ["ended", handleEnded],
      ["durationchange", handleDurationChange],
      ["error", handleError],
    ] as const;
    for (const [event, listener] of eventListeners) audio.addEventListener(event, listener);
    return {
      audio,
      source,
      removeListeners() {
        for (const [event, listener] of eventListeners) audio.removeEventListener(event, listener);
      },
    };
  }

  function unavailableError(
    source: MediaSource,
    mediaErrorCode: number | null,
    cause: unknown,
  ): PresentationSurfaceNarrationUnavailableError {
    return Object.freeze({
      reason: "narration-unavailable",
      surfaceId,
      source,
      mediaErrorCode,
      cause,
    });
  }

  function publishUnavailable(error: PresentationSurfaceNarrationUnavailableError): void {
    latestUnavailableError = error;
    publish(failedSnapshot(error));
  }

  function requireUnavailableError(): PresentationSurfaceNarrationUnavailableError {
    if (!latestUnavailableError) {
      throw new Error("Failed Surface narration has no unavailable error.");
    }
    return latestUnavailableError;
  }

  const controller: PresentationSurfaceNarrationController = {
    surfaceId,
    getSnapshot: () => snapshot,
    getClockTimeMs() {
      assertNotDisposed();
      return snapshot.status === "playing"
        ? readCurrentTimeMs(requireActive().audio)
        : snapshot.currentTimeMs;
    },
    subscribe(listener) {
      assertNotDisposed();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load({ source }) {
      assertNotDisposed();
      const cancellationError = Object.freeze({
        reason: "cancelled" as const,
        surfaceId,
        operation: "load" as const,
      });
      const operation = startOperation<PresentationSurfaceNarrationLoadError>(cancellationError);
      cleanupActive();
      latestUnavailableError = null;
      publish(
        freezeSnapshot({ status: "loading", currentTimeMs: 0, durationMs: null, error: null }),
      );

      const work = (async (): Promise<ResultType<void, PresentationSurfaceNarrationLoadError>> => {
        let resolvedUrl: string;
        try {
          resolvedUrl = await resolveSource(source, mediaPort);
        } catch (cause) {
          if (!operation.isCurrent()) return Result.err(cancellationError);
          const error = unavailableError(source, null, cause);
          publishUnavailable(error);
          return Result.err(error);
        }
        if (!resolvedUrl.trim()) throw new Error("Media Port resolved an empty narration URL.");
        if (!operation.isCurrent()) return Result.err(cancellationError);

        const audio = createAudioElement();
        let settleLoad!: (result: ResultType<void, PresentationSurfaceNarrationLoadError>) => void;
        const confirmation = new Promise<ResultType<void, PresentationSurfaceNarrationLoadError>>(
          (resolve) => {
            settleLoad = resolve;
          },
        );
        active = mountAudio(audio, source, settleLoad);
        audio.preload = "metadata";
        audio.src = resolvedUrl;
        try {
          audio.load();
        } catch (cause) {
          if (!(cause instanceof DOMException) || cause.name !== "NotSupportedError") throw cause;
          const error = unavailableError(source, audio.error?.code ?? null, cause);
          publishUnavailable(error);
          return Result.err(error);
        }
        return confirmation;
      })();

      return Promise.race([work, operation.cancellation]).finally(() => operation.finish());
    },
    play() {
      assertNotDisposed();
      if (snapshot.status === "failed") {
        return Promise.resolve(Result.err(requireUnavailableError()));
      }
      const current = requireActive();
      if (snapshot.status === "playing" && !current.audio.paused)
        return Promise.resolve(Result.ok());
      const cancellationError = Object.freeze({
        reason: "cancelled" as const,
        surfaceId,
        operation: "play" as const,
      });
      const operation = startOperation<PresentationSurfaceNarrationPlayError>(cancellationError);
      const work = (async (): Promise<ResultType<void, PresentationSurfaceNarrationPlayError>> => {
        try {
          await current.audio.play();
        } catch (cause) {
          if (!operation.isCurrent()) return Result.err(cancellationError);
          if (cause instanceof DOMException && cause.name === "NotAllowedError") {
            publish(
              freezeSnapshot({
                ...snapshot,
                status: "paused",
                error: { reason: "playback-not-allowed" },
              }),
            );
            return Result.err(Object.freeze({ reason: "playback-not-allowed", surfaceId, cause }));
          }
          if (cause instanceof DOMException && cause.name === "AbortError") {
            return Result.err(cancellationError);
          }
          if (cause instanceof DOMException && cause.name === "NotSupportedError") {
            const error = unavailableError(
              current.source,
              current.audio.error?.code ?? null,
              cause,
            );
            publishUnavailable(error);
            return Result.err(error);
          }
          throw cause;
        }
        if (!operation.isCurrent()) return Result.err(cancellationError);
        if (current.audio.paused) {
          throw new Error("Narration play resolved while the audio element remained paused.");
        }
        latestUnavailableError = null;
        publish(
          freezeSnapshot({
            status: "playing",
            currentTimeMs: readCurrentTimeMs(current.audio),
            durationMs: readDurationMs(current.audio),
            error: null,
          }),
        );
        return Result.ok();
      })();
      return Promise.race([work, operation.cancellation]).finally(() => operation.finish());
    },
    pause() {
      assertNotDisposed();
      if (snapshot.status === "failed") {
        active?.audio.pause();
        return;
      }
      const current = requireActive();
      cancelPendingOperation?.();
      current.audio.pause();
      publish(
        freezeSnapshot({
          status: current.audio.ended ? "ended" : "paused",
          currentTimeMs: readCurrentTimeMs(current.audio),
          durationMs: readDurationMs(current.audio),
          error: snapshot.error,
        }),
      );
    },
    seek(timeMs) {
      assertNotDisposed();
      if (!Number.isFinite(timeMs)) throw new RangeError("Narration seek time must be finite.");
      if (snapshot.status === "failed") {
        return Promise.resolve(Result.err(requireUnavailableError()));
      }
      const current = requireActive();
      const durationMs = readDurationMs(current.audio);
      if (durationMs === null) {
        const error = Object.freeze({
          reason: "seek-unsupported" as const,
          surfaceId,
          requestedTimeMs: timeMs,
          durationMs,
          cause: null,
        });
        publish(freezeSnapshot({ ...snapshot, error: snapshotSeekError(error) }));
        return Promise.resolve(Result.err(error));
      }
      if (timeMs < 0 || timeMs > durationMs) {
        const error = Object.freeze({
          reason: "seek-out-of-range" as const,
          surfaceId,
          requestedTimeMs: timeMs,
          durationMs,
        });
        publish(freezeSnapshot({ ...snapshot, error: snapshotSeekError(error) }));
        return Promise.resolve(Result.err(error));
      }
      const cancellationError = Object.freeze({
        reason: "cancelled" as const,
        surfaceId,
        operation: "seek" as const,
      });
      const operation = startOperation<PresentationSurfaceNarrationSeekError>(cancellationError);
      publish(freezeSnapshot({ ...snapshot, status: "seeking", error: null }));

      let removeConfirmationListeners = () => undefined;
      const confirmation = new Promise<ResultType<void, PresentationSurfaceNarrationSeekError>>(
        (resolve, reject) => {
          const handleSeeked = () => {
            try {
              const confirmedTimeMs = readCurrentTimeMs(current.audio);
              if (Math.abs(confirmedTimeMs - timeMs) > 50) {
                throw new Error("Narration confirmed a contradictory seek position.");
              }
              latestUnavailableError = null;
              publish(
                freezeSnapshot({
                  status: current.audio.ended
                    ? "ended"
                    : current.audio.paused
                      ? "paused"
                      : "playing",
                  currentTimeMs: confirmedTimeMs,
                  durationMs: readDurationMs(current.audio),
                  error: null,
                }),
              );
              resolve(Result.ok());
            } catch (error) {
              reject(error);
            }
          };
          const handleError = () =>
            resolve(
              Result.err(unavailableError(current.source, current.audio.error?.code ?? null, null)),
            );
          current.audio.addEventListener("seeked", handleSeeked);
          current.audio.addEventListener("error", handleError);
          removeConfirmationListeners = () => {
            current.audio.removeEventListener("seeked", handleSeeked);
            current.audio.removeEventListener("error", handleError);
          };
        },
      );
      try {
        current.audio.currentTime = timeMs / 1_000;
      } catch (cause) {
        removeConfirmationListeners();
        operation.finish();
        if (
          !(cause instanceof DOMException) ||
          !["InvalidStateError", "NotSupportedError"].includes(cause.name)
        ) {
          throw cause;
        }
        const error = Object.freeze({
          reason: "seek-unsupported" as const,
          surfaceId,
          requestedTimeMs: timeMs,
          durationMs,
          cause,
        });
        publish(freezeSnapshot({ ...snapshot, status: "paused", error: snapshotSeekError(error) }));
        return Promise.resolve(Result.err(error));
      }
      return Promise.race([confirmation, operation.cancellation]).finally(() => {
        removeConfirmationListeners();
        operation.finish();
      });
    },
    dispose() {
      if (disposed) return;
      cancelPendingOperation?.();
      disposed = true;
      cleanupActive();
      listeners.clear();
    },
  };

  function failedSnapshot(
    error: PresentationSurfaceNarrationUnavailableError,
  ): PresentationSurfaceNarrationSnapshot {
    return freezeSnapshot({
      status: "failed",
      currentTimeMs: snapshot.currentTimeMs,
      durationMs: snapshot.durationMs,
      error: { reason: "narration-unavailable", mediaErrorCode: error.mediaErrorCode },
    });
  }

  return Object.freeze(controller);
}

async function resolveSource(
  source: MediaSource,
  mediaPort: Pick<MediaPort, "resolve"> | null,
): Promise<string> {
  if (source.mode === "external") return source.src;
  if (!mediaPort) throw new Error("No Media Port is available to resolve managed narration.");
  return mediaPort.resolve(source.mediaId);
}

function readCurrentTimeMs(audio: HTMLAudioElement): number {
  if (!Number.isFinite(audio.currentTime) || audio.currentTime < 0) {
    throw new Error("Narration media reported an invalid current time.");
  }
  return Math.round(audio.currentTime * 1_000);
}

function readDurationMs(audio: HTMLAudioElement): number | null {
  return Number.isFinite(audio.duration) && audio.duration >= 0
    ? Math.round(audio.duration * 1_000)
    : null;
}

function snapshotSeekError(
  error:
    | Extract<PresentationSurfaceNarrationSeekError, { reason: "seek-out-of-range" }>
    | Extract<PresentationSurfaceNarrationSeekError, { reason: "seek-unsupported" }>,
): PresentationSurfaceNarrationSnapshotError {
  return error.reason === "seek-out-of-range"
    ? Object.freeze({
        reason: error.reason,
        requestedTimeMs: error.requestedTimeMs,
        durationMs: error.durationMs,
      })
    : Object.freeze({
        reason: error.reason,
        requestedTimeMs: error.requestedTimeMs,
        durationMs: error.durationMs,
      });
}

function freezeSnapshot(
  snapshot: PresentationSurfaceNarrationSnapshot,
): PresentationSurfaceNarrationSnapshot {
  return Object.freeze({
    ...snapshot,
    error: snapshot.error === null ? null : Object.freeze(snapshot.error),
  });
}
