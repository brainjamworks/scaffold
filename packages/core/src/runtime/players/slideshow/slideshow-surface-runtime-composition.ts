import { Result, type Result as ResultType } from "better-result";

import type { ControlBindingRegistry } from "@/document/control-binding/control-binding";
import type { SurfaceId } from "@/document/model/course-structure";
import type { SemanticTargetInteractionCoordinator } from "@/document/semantic-target-interaction/semantic-target-interaction-coordinator";
import type {
  CompiledSurfacePresentationTimeline,
  PresentationMotionMode,
} from "@/presentation/model";
import type { CompiledSurfaceLearnerInteractionProgram } from "@/runtime/learner-interaction/compiled-learner-interaction-program";
import {
  createSurfaceLearnerInteractionRuntime,
  type SurfaceLearnerInteractionRuntime,
} from "@/runtime/learner-interaction/surface-learner-interaction-runtime";
import { projectInternalClockSurfaceTimeline } from "@/runtime/presentation/compiled-presentation-program";
import { createPresentationCueExecutor } from "@/runtime/presentation/presentation-cue-executor";
import {
  createPresentationPlaybackSession,
  type PresentationPlaybackSession,
  type PresentationSeekError,
} from "@/runtime/presentation/presentation-playback-session";
import {
  createPresentationSurfaceRepositioner,
  type PresentationFeatureViewBaselinePort,
  type PresentationRepositionReport,
  type PresentationSurfaceRepositioner,
} from "@/runtime/presentation/presentation-surface-repositioner";
import { createAnimeVisualAnimationDriver } from "@/runtime/presentation/visual/anime-visual-animation-driver";
import {
  createPresentationVisualRuntime,
  type PresentationVisualRuntime,
} from "@/runtime/presentation/visual/presentation-visual-runtime";
import { createPresentationVisualStateRenderer } from "@/runtime/presentation/visual/presentation-visual-state-renderer";
import { createVisualTargetResolver } from "@/runtime/presentation/visual/visual-target-resolver";

import type { RequestSurfaceChange } from "./slideshow-surface-change";
import { createPresentationWaitSurfaceExitGuard } from "./presentation-wait-surface-exit-guard";
import type { SurfaceExitGuard } from "./surface-exit-environment";

export interface SlideshowSurfaceRuntimeProgram {
  readonly presentation?: {
    readonly timeline: CompiledSurfacePresentationTimeline;
    readonly autoAdvance: boolean;
  };
  readonly learnerInteractions?: CompiledSurfaceLearnerInteractionProgram;
}

export type SlideshowSurfaceRuntimeProgramSource = (
  surfaceId: SurfaceId,
) => SlideshowSurfaceRuntimeProgram | undefined;

export interface CreateSlideshowSurfaceRuntimeCompositionInput {
  readonly surfaceId: SurfaceId;
  readonly program: SlideshowSurfaceRuntimeProgram;
  readonly controlBindings: Pick<ControlBindingRegistry, "get">;
  readonly semanticTargets: SemanticTargetInteractionCoordinator;
  readonly featureViewBaseline: PresentationFeatureViewBaselinePort;
  readonly requestSurfaceChange: RequestSurfaceChange;
  readonly surfaceRoot?: HTMLElement;
  readonly getPresentationMotionMode?: () => PresentationMotionMode;
}

export type SlideshowPresentationControls = Pick<
  PresentationPlaybackSession,
  | "getSnapshot"
  | "subscribe"
  | "subscribeCueReports"
  | "play"
  | "pause"
  | "advance"
  | "restart"
  | "stop"
>;

export type SlideshowPresentationSeekResult = ResultType<
  PresentationRepositionReport,
  PresentationSeekError
>;

export interface SlideshowSurfaceRuntimeComposition {
  readonly surfaceId: SurfaceId;
  readonly learnerRuntime: SurfaceLearnerInteractionRuntime;
  readonly presentationControls?: SlideshowPresentationControls;
  readonly presentationSurfaceExitGuard?: SurfaceExitGuard;
  readonly presentationVisualRuntime?: PresentationVisualRuntime;
  seek?(timeMs: number): Promise<SlideshowPresentationSeekResult>;
  dispose(): void;
}

export function createSlideshowSurfaceRuntimeComposition({
  surfaceId,
  program,
  controlBindings,
  semanticTargets,
  featureViewBaseline,
  requestSurfaceChange,
  surfaceRoot,
  getPresentationMotionMode,
}: CreateSlideshowSurfaceRuntimeCompositionInput): SlideshowSurfaceRuntimeComposition {
  assertSlideshowSurfaceRuntimeProgramIdentity(surfaceId, program);
  const learnerRuntime = createSurfaceLearnerInteractionRuntime({
    program: program.learnerInteractions ?? createEmptyLearnerProgram(surfaceId),
    controlBindings,
    semanticTargets,
    surfaceNavigation: {
      async navigate(targetSurfaceId, signal, context) {
        signal.throwIfAborted();
        const result = context.satisfiesActiveLearnerRequirement
          ? requestSurfaceChange(targetSurfaceId, { kind: "satisfied-learner-rule-branch" })
          : requestSurfaceChange(targetSurfaceId);
        if (result.isOk()) return Result.ok();
        switch (result.error.reason) {
          case "surface-exit-blocked":
            return Result.err(Object.freeze({ reason: "cancelled" as const }));
        }
        return unexpectedSurfaceChangeError(result.error);
      },
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  let presentationSession: PresentationPlaybackSession | undefined;
  let presentationControls: SlideshowPresentationControls | undefined;
  let presentationSurfaceExitGuard: SurfaceExitGuard | undefined;
  let presentationRepositioner: PresentationSurfaceRepositioner | undefined;
  let presentationVisualRuntime: PresentationVisualRuntime | undefined;
  try {
    if (program.presentation) {
      const timeline = projectInternalClockSurfaceTimeline(program.presentation.timeline);
      const cueExecutor = createPresentationCueExecutor({
        semanticTargets,
        controlBindings,
        origin: "configured-presentation",
      });
      presentationSession = createPresentationPlaybackSession({
        timeline,
        cueExecutor,
        gatePort: learnerRuntime,
        autoAdvance: program.presentation.autoAdvance,
      });
      presentationControls = createSlideshowPresentationControls(presentationSession);
      presentationSurfaceExitGuard = createPresentationWaitSurfaceExitGuard({
        surfaceId,
        session: presentationSession,
      });
      presentationRepositioner = createPresentationSurfaceRepositioner({
        timeline,
        featureViewBaseline,
        cueExecutor,
      });
    }
    if (program.presentation && presentationSession && surfaceRoot) {
      presentationVisualRuntime = createPresentationVisualRuntime({
        visualProgram: program.presentation.timeline.visualProgram,
        session: presentationSession,
        renderer: createPresentationVisualStateRenderer({
          resolver: createVisualTargetResolver(surfaceRoot),
          driver: createAnimeVisualAnimationDriver(),
        }),
        getMotionMode:
          getPresentationMotionMode ?? (() => resolvePresentationMotionMode(surfaceRoot)),
      });
    }
  } catch (error) {
    let firstDefect: unknown = error;
    try {
      presentationSession?.dispose();
    } catch (disposeError) {
      firstDefect ??= disposeError;
    }
    try {
      learnerRuntime.dispose();
    } catch (disposeError) {
      firstDefect ??= disposeError;
    }
    throw firstDefect;
  }
  let disposed = false;

  return Object.freeze({
    surfaceId,
    learnerRuntime,
    ...(presentationControls ? { presentationControls } : {}),
    ...(presentationSurfaceExitGuard ? { presentationSurfaceExitGuard } : {}),
    ...(presentationVisualRuntime ? { presentationVisualRuntime } : {}),
    ...(presentationSession && presentationRepositioner
      ? {
          async seek(timeMs: number): Promise<SlideshowPresentationSeekResult> {
            assertPresentationSeekTime(timeMs);
            const snapshot = presentationSession.getSnapshot();
            if (timeMs < 0 || timeMs > snapshot.durationMs) {
              return Result.err(
                Object.freeze({
                  reason: "seek-out-of-range" as const,
                  requestedTimeMs: timeMs,
                  durationMs: snapshot.durationMs,
                }),
              );
            }

            presentationSession.pause();
            const report = await presentationRepositioner.reposition(timeMs);
            if (report.kind === "applied") {
              const sessionResult = presentationSession.seek(timeMs);
              if (sessionResult.isErr()) {
                throw new Error("Validated Slideshow seek was refused by its Presentation Session.");
              }
            }
            return Result.ok(report);
          },
        }
      : {}),
    dispose() {
      if (disposed) return;
      disposed = true;
      let firstDefect: unknown;
      try {
        presentationSession?.dispose();
      } catch (error) {
        firstDefect = error;
      }
      try {
        presentationVisualRuntime?.dispose();
      } catch (error) {
        firstDefect ??= error;
      }
      try {
        learnerRuntime.dispose();
      } catch (error) {
        firstDefect ??= error;
      }
      if (firstDefect !== undefined) throw firstDefect;
    },
  });
}

function createSlideshowPresentationControls(
  session: PresentationPlaybackSession,
): SlideshowPresentationControls {
  return Object.freeze({
    getSnapshot: () => session.getSnapshot(),
    subscribe: (listener: () => void) => session.subscribe(listener),
    subscribeCueReports: (
      listener: Parameters<PresentationPlaybackSession["subscribeCueReports"]>[0],
    ) => session.subscribeCueReports(listener),
    play: () => session.play(),
    pause: () => session.pause(),
    advance: () => session.advance(),
    restart: () => session.restart(),
    stop: () => session.stop(),
  });
}

function assertPresentationSeekTime(timeMs: number): void {
  if (!Number.isSafeInteger(timeMs)) {
    throw new Error("Presentation Seek time must be an integer number of milliseconds.");
  }
}

function resolvePresentationMotionMode(surfaceRoot: HTMLElement): PresentationMotionMode {
  return surfaceRoot.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)")
    .matches
    ? "reduced-motion"
    : "normal";
}

function unexpectedSurfaceChangeError(error: unknown): never {
  const reason = (error as { readonly reason?: unknown }).reason;
  throw new Error(`Unexpected Slideshow Surface change error "${String(reason)}".`);
}

export function assertSlideshowSurfaceRuntimeProgramIdentity(
  surfaceId: SurfaceId,
  program: SlideshowSurfaceRuntimeProgram,
): void {
  if (program.learnerInteractions && program.learnerInteractions.surfaceId !== surfaceId) {
    throw new Error(
      `Slideshow learner program Surface "${program.learnerInteractions.surfaceId}" does not match active Surface "${surfaceId}".`,
    );
  }
  if (program.presentation && program.presentation.timeline.surfaceId !== surfaceId) {
    throw new Error(
      `Slideshow Presentation Timeline Surface "${program.presentation.timeline.surfaceId}" does not match active Surface "${surfaceId}".`,
    );
  }
}

function createEmptyLearnerProgram(surfaceId: SurfaceId): CompiledSurfaceLearnerInteractionProgram {
  return Object.freeze({ surfaceId, rulesByEvent: new Map() });
}
