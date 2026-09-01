import type {
  CompiledSurfacePresentationVisualProgram,
  PresentationMotionMode,
} from "@/presentation/model";
import { sceneAt } from "@/presentation/model";
import type {
  PresentationPlaybackSession,
  PresentationPlaybackSnapshot,
} from "@/runtime/presentation/presentation-playback-session";

import type { PresentationVisualStateRenderer } from "./presentation-visual-state-renderer";

export interface PresentationVisualRuntime {
  dispose(): void;
}

export function createPresentationVisualRuntime({
  visualProgram,
  session,
  renderer,
  getMotionMode,
}: {
  readonly visualProgram: CompiledSurfacePresentationVisualProgram;
  readonly session: Pick<PresentationPlaybackSession, "getSnapshot" | "subscribe">;
  readonly renderer: PresentationVisualStateRenderer;
  readonly getMotionMode: () => PresentationMotionMode;
}): PresentationVisualRuntime {
  let disposed = false;

  function applySnapshot(snapshot: PresentationPlaybackSnapshot): void {
    if (snapshot.surfaceId !== visualProgram.surfaceId) {
      throw new Error(
        `Presentation visual program Surface "${visualProgram.surfaceId}" does not match Session Surface "${snapshot.surfaceId}".`,
      );
    }
    renderer.apply(sceneAt(visualProgram, snapshot.currentTimeMs, getMotionMode()));
  }

  try {
    applySnapshot(session.getSnapshot());
  } catch (error) {
    renderer.dispose();
    throw error;
  }
  const unsubscribe = session.subscribe(() => applySnapshot(session.getSnapshot()));

  return Object.freeze({
    dispose(): void {
      if (disposed) return;
      disposed = true;
      let firstDefect: unknown;
      try {
        unsubscribe();
      } catch (error) {
        firstDefect = error;
      }
      try {
        renderer.dispose();
      } catch (error) {
        firstDefect ??= error;
      }
      if (firstDefect !== undefined) throw firstDefect;
    },
  });
}
