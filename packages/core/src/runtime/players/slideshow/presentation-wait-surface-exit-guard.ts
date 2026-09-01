import type { SurfaceId } from "@/document/model/course-structure";
import type { PresentationPlaybackSession } from "@/runtime/presentation/presentation-playback-session";

import type { SurfaceExitGuard, SurfaceExitGuardSnapshot } from "./surface-exit-environment";

export interface CreatePresentationWaitSurfaceExitGuardInput {
  readonly surfaceId: SurfaceId;
  readonly session: PresentationPlaybackSession;
}

const ALLOWED_SNAPSHOT = Object.freeze({ status: "allowed" as const });

export function createPresentationWaitSurfaceExitGuard({
  surfaceId,
  session,
}: CreatePresentationWaitSurfaceExitGuardInput): SurfaceExitGuard {
  const ownerId = `presentation-wait:${surfaceId}`;

  return Object.freeze({
    ownerId,
    surfaceId,
    getSnapshot(): SurfaceExitGuardSnapshot {
      const snapshot = session.getSnapshot();
      if (snapshot.surfaceId !== surfaceId) {
        throw new Error(
          `Presentation Wait Surface Exit Guard for "${surfaceId}" received Session snapshot for "${snapshot.surfaceId}".`,
        );
      }
      const outstandingWait = snapshot.outstandingLearnerWait;
      if (outstandingWait === null) return ALLOWED_SNAPSHOT;
      return Object.freeze({
        status: "blocked",
        blocker: Object.freeze({
          reason: "presentation-learner-wait",
          ownerId,
          surfaceId,
          waitId: outstandingWait.waitId,
        }),
      });
    },
    subscribe(listener: () => void) {
      return session.subscribe(listener);
    },
  });
}
