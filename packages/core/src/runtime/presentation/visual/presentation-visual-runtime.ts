import type {
  CompiledOwnerLayerTrack,
  CompiledSurfacePresentationVisualProgram,
  PresentationMotionMode,
} from "@/presentation/model";
import { sceneAt } from "@/presentation/model";
import type {
  PresentationPlaybackSession,
  PresentationPlaybackSnapshot,
} from "@/runtime/presentation/presentation-playback-session";

import type {
  PresentationVisualStateRenderer,
  VisualSceneApplicationReport,
} from "./presentation-visual-state-renderer";

export interface PresentationVisualRuntime {
  getLatestApplicationReport(): VisualSceneApplicationReport;
  dispose(): void;
}

export function createPresentationVisualRuntime({
  visualProgram,
  layerTracks,
  session,
  renderer,
  getMotionMode,
}: {
  readonly visualProgram: CompiledSurfacePresentationVisualProgram;
  readonly layerTracks: readonly CompiledOwnerLayerTrack[];
  readonly session: Pick<PresentationPlaybackSession, "getSnapshot" | "subscribe">;
  readonly renderer: PresentationVisualStateRenderer;
  readonly getMotionMode: () => PresentationMotionMode;
}): PresentationVisualRuntime {
  let disposed = false;
  let latestApplicationReport: VisualSceneApplicationReport;

  function renderSnapshot(snapshot: PresentationPlaybackSnapshot): VisualSceneApplicationReport {
    if (snapshot.surfaceId !== visualProgram.surfaceId) {
      throw new Error(
        `Presentation visual program Surface "${visualProgram.surfaceId}" does not match Session Surface "${snapshot.surfaceId}".`,
      );
    }
    return renderer.apply(sceneAt(visualProgram, layerTracks, snapshot.position, getMotionMode()));
  }

  try {
    latestApplicationReport = renderSnapshot(session.getSnapshot());
  } catch (error) {
    renderer.dispose();
    throw error;
  }
  const unsubscribe = session.subscribe(() => {
    latestApplicationReport = renderSnapshot(session.getSnapshot());
  });

  return Object.freeze({
    getLatestApplicationReport(): VisualSceneApplicationReport {
      return latestApplicationReport;
    },
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
