import { Result } from "better-result";

import type { SurfaceId } from "@/document/model/course-structure";
import type {
  PresentationPreviewPlaybackPort,
  PresentationPreviewSnapshot,
} from "@/presentation/model";
import type { PresentationPlaybackSnapshot } from "@/runtime/presentation/presentation-playback-session";

import type {
  SlideshowPresentationControls,
  SlideshowPresentationSeekResult,
} from "./slideshow-surface-runtime-composition";

export interface CreatePresentationPreviewPlaybackPortInput {
  readonly controls: SlideshowPresentationControls;
  readonly seek: (timeMs: number) => Promise<SlideshowPresentationSeekResult>;
  readonly surfaceId: SurfaceId;
}

/**
 * Exposes a mounted Slideshow Surface runtime as the neutral Author Preview playback port.
 *
 * `getSnapshot` is read by `useSyncExternalStore`, which demands a referentially stable value
 * while the store has not changed, so the projection is cached against the playback session
 * snapshot it was derived from.
 */
export function createPresentationPreviewPlaybackPort({
  controls,
  seek,
  surfaceId,
}: CreatePresentationPreviewPlaybackPortInput): PresentationPreviewPlaybackPort {
  let lastPlaybackSnapshot: PresentationPlaybackSnapshot | null = null;
  let lastPreviewSnapshot: PresentationPreviewSnapshot | null = null;

  return Object.freeze({
    getSnapshot: (): PresentationPreviewSnapshot => {
      const snapshot = controls.getSnapshot();
      if (lastPreviewSnapshot && lastPlaybackSnapshot === snapshot) return lastPreviewSnapshot;
      lastPlaybackSnapshot = snapshot;
      lastPreviewSnapshot = Object.freeze({
        status: "ready" as const,
        surfaceId,
        phase: snapshot.phase,
        currentTimeMs: snapshot.position.timeMs,
        durationMs: snapshot.durationMs,
      });
      return lastPreviewSnapshot;
    },
    subscribe: (listener: () => void) => controls.subscribe(listener),
    play: () => {
      void controls.play();
      return Result.ok();
    },
    pause: () => {
      controls.pause();
      return Result.ok();
    },
    async seek(timeMs: number) {
      controls.pause();
      const result = await seek(timeMs);
      if (result.isErr()) {
        if (result.error.reason === "seek-out-of-range") return Result.err(result.error);
        return Result.err(
          Object.freeze({
            reason: "preview-not-ready" as const,
            operation: "seek" as const,
            status: "error" as const,
          }),
        );
      }
      return Result.ok(
        Object.freeze({ kind: result.value.kind, timeMs: result.value.position.timeMs }),
      );
    },
  });
}
