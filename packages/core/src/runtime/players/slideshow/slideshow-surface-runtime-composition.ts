import { Result, type Result as ResultType } from "better-result";

import type { ControlBindingRegistry } from "@/document/control-binding/control-binding";
import type { SurfaceId } from "@/document/model/course-structure";
import type { SemanticTargetInteractionCoordinator } from "@/document/semantic-target-interaction/semantic-target-interaction-coordinator";
import type { MediaPort } from "@/host/ports/media";
import type {
  CompiledSurfacePresentationTimeline,
  PresentationMotionMode,
} from "@/presentation/model";
import type { CompiledSurfaceLearnerInteractionProgram } from "@/learner-interaction/model";
import {
  createSurfaceLearnerInteractionRuntime,
  type SurfaceLearnerInteractionRuntime,
} from "@/runtime/learner-interaction/surface-learner-interaction-runtime";
import { projectInternalClockSurfaceTimeline } from "@/runtime/presentation/compiled-presentation-program";
import { createPresentationCueExecutor } from "@/runtime/presentation/presentation-cue-executor";
import { createPresentationNarrationClockSource } from "@/runtime/presentation/presentation-monotonic-clock";
import {
  createPresentationSurfaceNarrationController,
  type PresentationSurfaceNarrationController,
  type PresentationSurfaceNarrationLoadError,
  type PresentationSurfaceNarrationPlayError,
  type PresentationSurfaceNarrationSeekError,
  type PresentationSurfaceNarrationSnapshot,
} from "@/runtime/presentation/narration";
import {
  createPresentationPlaybackSession,
  type PresentationAdvanceError,
  type PresentationPlaybackSessionWithReplaceableClock,
  type PresentationSeekError,
} from "@/runtime/presentation/presentation-playback-session";
import {
  createPresentationSurfaceRepositioner,
  type PresentationFeatureViewBaselinePort,
  type PresentationRepositionReport,
  type PresentationSurfaceRepositioner,
} from "@/runtime/presentation/presentation-surface-repositioner";
import { createAnimeVisualAnimationDriver } from "@/runtime/presentation/visual/anime-visual-animation-driver";
import type { PresentationContentLayoutPort } from "@/runtime/presentation/visual/presentation-content-layout-port";
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
  readonly contentLayoutPort?: PresentationContentLayoutPort;
  readonly mediaPort?: Pick<MediaPort, "resolve"> | null;
  readonly createNarrationAudioElement?: () => HTMLAudioElement;
}

export type SlideshowPresentationNarrationError =
  | PresentationSurfaceNarrationLoadError
  | PresentationSurfaceNarrationPlayError
  | PresentationSurfaceNarrationSeekError;

export interface SlideshowPresentationNarrationSnapshot extends Omit<
  PresentationSurfaceNarrationSnapshot,
  "error"
> {
  readonly error: SlideshowPresentationNarrationError | null;
  readonly usingInternalClock: boolean;
}

export type SlideshowPresentationSeekResult = ResultType<
  PresentationRepositionReport,
  PresentationSeekError | SlideshowPresentationNarrationError
>;

export interface SlideshowPresentationControls {
  getSnapshot: PresentationPlaybackSessionWithReplaceableClock["getSnapshot"];
  getNarrationSnapshot(): SlideshowPresentationNarrationSnapshot | null;
  subscribe: PresentationPlaybackSessionWithReplaceableClock["subscribe"];
  subscribeCueReports: PresentationPlaybackSessionWithReplaceableClock["subscribeCueReports"];
  play(): Promise<
    ResultType<void, PresentationSurfaceNarrationLoadError | PresentationSurfaceNarrationPlayError>
  >;
  pause(): void;
  advance(): Promise<
    ResultType<
      void,
      | PresentationAdvanceError
      | PresentationSurfaceNarrationLoadError
      | PresentationSurfaceNarrationPlayError
    >
  >;
  continueWithoutNarration(): void;
  restart(): Promise<SlideshowPresentationSeekResult>;
  stop(): void;
}

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
  contentLayoutPort,
  mediaPort = null,
  createNarrationAudioElement,
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
  let presentationSession: PresentationPlaybackSessionWithReplaceableClock | undefined;
  let narrationController: PresentationSurfaceNarrationController | undefined;
  let presentationControls: SlideshowPresentationControls | undefined;
  let presentationSurfaceExitGuard: SurfaceExitGuard | undefined;
  let presentationRepositioner: PresentationSurfaceRepositioner | undefined;
  let presentationVisualRuntime: PresentationVisualRuntime | undefined;
  let narrationLoad: Promise<ResultType<void, PresentationSurfaceNarrationLoadError>> | undefined;
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
        autoAdvance:
          program.presentation.autoAdvance && program.presentation.timeline.narration === undefined,
      });
      if (program.presentation.timeline.narration) {
        narrationController = createPresentationSurfaceNarrationController({
          surfaceId,
          mediaPort,
          ...(createNarrationAudioElement
            ? { createAudioElement: createNarrationAudioElement }
            : {}),
        });
        narrationLoad = narrationController.load(program.presentation.timeline.narration);
      }
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
          ...(contentLayoutPort ? { contentLayoutPort } : {}),
        }),
        getMotionMode:
          getPresentationMotionMode ?? (() => resolvePresentationMotionMode(surfaceRoot)),
      });
    }
  } catch (error) {
    let firstDefect: unknown = error;
    try {
      narrationController?.dispose();
    } catch (disposeError) {
      firstDefect ??= disposeError;
    }
    try {
      presentationRepositioner?.dispose();
    } catch (disposeError) {
      firstDefect ??= disposeError;
    }
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
  let presentationOperationGeneration = 0;
  let seekPresentation: SlideshowSurfaceRuntimeComposition["seek"];
  let disposePresentationCoordination = () => undefined;

  if (presentationSession && presentationRepositioner) {
    const session = presentationSession;
    const repositioner = presentationRepositioner;
    const narration = narrationController;
    const listeners = new Set<() => void>();
    let narrationError: SlideshowPresentationNarrationError | null = null;
    let usingInternalClock = false;
    let narrationSnapshot: SlideshowPresentationNarrationSnapshot | null = narration
      ? freezeNarrationSnapshot(narration.getSnapshot(), narrationError, usingInternalClock)
      : null;
    let autoAdvancePending = false;

    const publish = () => {
      for (const listener of [...listeners]) listener();
    };
    const refreshNarrationSnapshot = () => {
      const sourceSnapshot = narration?.getSnapshot();
      const narrationSource = program.presentation?.timeline.narration?.source;
      if (
        sourceSnapshot?.status === "failed" &&
        sourceSnapshot.error?.reason === "narration-unavailable" &&
        narrationSource &&
        !usingInternalClock &&
        narrationError === null
      ) {
        narrationError = Object.freeze({
          reason: "narration-unavailable",
          surfaceId,
          source: narrationSource,
          mediaErrorCode: sourceSnapshot.error.mediaErrorCode,
          cause: null,
        });
      }
      narrationSnapshot = narration
        ? freezeNarrationSnapshot(sourceSnapshot!, narrationError, usingInternalClock)
        : null;
      publish();
    };
    const getNarrationSnapshot = () => narrationSnapshot;
    const rememberNarrationError = (error: SlideshowPresentationNarrationError | null) => {
      narrationError = error;
      refreshNarrationSnapshot();
    };
    const pauseNarration = () => {
      if (!narration) return;
      const status = narration.getSnapshot().status;
      if (status === "playing" || status === "buffering" || status === "seeking") {
        narration.pause();
      }
    };
    const ensureNarrationLoaded = async () => {
      if (!narration || !narrationLoad) return Result.ok();
      const result = await narrationLoad;
      if (result.isErr() && !disposed) rememberNarrationError(result.error);
      return result;
    };
    const playPresentation = async (): ReturnType<SlideshowPresentationControls["play"]> => {
      assertCompositionNotDisposed(disposed, "play");
      if (!narration || usingInternalClock) {
        session.play();
        return Result.ok();
      }
      const generation = ++presentationOperationGeneration;
      const loaded = await ensureNarrationLoaded();
      if (loaded.isErr()) return loaded;
      const played = await narration.play();
      if (disposed || generation !== presentationOperationGeneration) return played;
      if (played.isErr()) {
        rememberNarrationError(played.error);
        return played;
      }
      narrationError = null;
      session.useNarrationClock(createPresentationNarrationClockSource(narration));
      session.play();
      refreshNarrationSnapshot();
      return Result.ok();
    };
    const advancePresentation = async (): ReturnType<SlideshowPresentationControls["advance"]> => {
      assertCompositionNotDisposed(disposed, "advance");
      if (!narration || usingInternalClock) return session.advance();
      const generation = ++presentationOperationGeneration;
      const loaded = await ensureNarrationLoaded();
      if (loaded.isErr()) return loaded;
      const played = await narration.play();
      if (disposed || generation !== presentationOperationGeneration) return played;
      if (played.isErr()) {
        rememberNarrationError(played.error);
        return played;
      }
      narrationError = null;
      session.useNarrationClock(createPresentationNarrationClockSource(narration));
      const result = session.advance();
      if (result.isErr()) pauseNarration();
      refreshNarrationSnapshot();
      return result;
    };

    const repositionPresentation = async (
      timeMs: number,
      restart: boolean,
    ): Promise<SlideshowPresentationSeekResult> => {
      assertCompositionNotDisposed(disposed, restart ? "restart" : "seek");
      assertPresentationSeekTime(timeMs);
      const snapshot = session.getSnapshot();
      if (timeMs < 0 || timeMs > snapshot.durationMs) {
        return Result.err(
          Object.freeze({
            reason: "seek-out-of-range" as const,
            requestedTimeMs: timeMs,
            durationMs: snapshot.durationMs,
          }),
        );
      }

      const resumeAfterSeek = !restart && snapshot.phase === "playing";
      const generation = ++presentationOperationGeneration;
      if (snapshot.phase !== "stopped") session.pause();
      pauseNarration();

      if (narration && !usingInternalClock) {
        const loaded = await ensureNarrationLoaded();
        if (disposed || generation !== presentationOperationGeneration) {
          return Result.ok(supersededReport(timeMs));
        }
        if (loaded.isErr()) return loaded;
        if (narration.getSnapshot().currentTimeMs !== timeMs) {
          const mediaSeek = await narration.seek(timeMs);
          if (disposed || generation !== presentationOperationGeneration) {
            return Result.ok(supersededReport(timeMs));
          }
          if (mediaSeek.isErr()) {
            rememberNarrationError(mediaSeek.error);
            return mediaSeek;
          }
        }
      }

      const report = await repositioner.reposition(timeMs);
      if (disposed || generation !== presentationOperationGeneration) {
        return Result.ok(asSupersededReport(report));
      }
      if (report.kind === "applied") {
        if (restart) session.restart();
        const sessionResult = session.seek(timeMs);
        if (sessionResult.isErr()) {
          throw new Error(
            "Validated Slideshow reposition was refused by its Presentation Session.",
          );
        }
      }

      if (resumeAfterSeek && report.kind === "applied" && narration && !usingInternalClock) {
        const played = await narration.play();
        if (disposed || generation !== presentationOperationGeneration) {
          pauseNarration();
          return Result.ok(asSupersededReport(report));
        }
        if (played.isErr()) {
          rememberNarrationError(played.error);
          return played;
        }
        narrationError = null;
        session.useNarrationClock(createPresentationNarrationClockSource(narration));
        session.play();
        refreshNarrationSnapshot();
      } else if (resumeAfterSeek && report.kind === "applied") {
        session.play();
      }
      return Result.ok(report);
    };

    seekPresentation = (timeMs) => repositionPresentation(timeMs, false);
    presentationControls = Object.freeze({
      getSnapshot: () => session.getSnapshot(),
      getNarrationSnapshot,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      subscribeCueReports: (
        listener: Parameters<
          PresentationPlaybackSessionWithReplaceableClock["subscribeCueReports"]
        >[0],
      ) => session.subscribeCueReports(listener),
      play: playPresentation,
      pause() {
        assertCompositionNotDisposed(disposed, "pause");
        presentationOperationGeneration += 1;
        if (session.getSnapshot().phase !== "stopped") session.pause();
        pauseNarration();
      },
      advance: advancePresentation,
      continueWithoutNarration() {
        assertCompositionNotDisposed(disposed, "continue without narration in");
        presentationOperationGeneration += 1;
        pauseNarration();
        session.useInternalClock();
        usingInternalClock = true;
        narrationError = null;
        const current = session.getSnapshot();
        if (current.phase === "held") {
          if (current.hold.kind === "manual" || current.hold.status === "ready") {
            const advanced = session.advance();
            if (advanced.isErr()) {
              throw new Error("Ready Presentation hold refused narration fallback.");
            }
          }
        } else if (current.phase === "awaiting-start" || current.phase === "paused") {
          session.play();
        }
        refreshNarrationSnapshot();
      },
      restart: () => repositionPresentation(0, true),
      stop() {
        assertCompositionNotDisposed(disposed, "stop");
        presentationOperationGeneration += 1;
        pauseNarration();
        session.stop();
      },
    });

    const unsubscribeSession = session.subscribe(() => {
      const next = session.getSnapshot();
      if (next.phase !== "playing") pauseNarration();
      publish();
      if (
        narration &&
        !usingInternalClock &&
        program.presentation?.autoAdvance &&
        next.phase === "held" &&
        next.hold.kind === "learner" &&
        next.hold.status === "ready" &&
        !autoAdvancePending
      ) {
        autoAdvancePending = true;
        void advancePresentation().finally(() => {
          autoAdvancePending = false;
        });
      }
    });
    const unsubscribeNarration =
      narration?.subscribe(refreshNarrationSnapshot) ?? (() => undefined);
    disposePresentationCoordination = () => {
      unsubscribeNarration();
      unsubscribeSession();
      listeners.clear();
    };
  }

  return Object.freeze({
    surfaceId,
    learnerRuntime,
    ...(presentationControls ? { presentationControls } : {}),
    ...(presentationSurfaceExitGuard ? { presentationSurfaceExitGuard } : {}),
    ...(presentationVisualRuntime ? { presentationVisualRuntime } : {}),
    ...(seekPresentation ? { seek: seekPresentation } : {}),
    dispose() {
      if (disposed) return;
      disposed = true;
      presentationOperationGeneration += 1;
      let firstDefect: unknown;
      try {
        narrationController?.dispose();
      } catch (error) {
        firstDefect = error;
      }
      try {
        disposePresentationCoordination();
      } catch (error) {
        firstDefect ??= error;
      }
      try {
        presentationRepositioner?.dispose();
      } catch (error) {
        firstDefect ??= error;
      }
      try {
        presentationSession?.dispose();
      } catch (error) {
        firstDefect ??= error;
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

function assertCompositionNotDisposed(disposed: boolean, operation: string): void {
  if (disposed) throw new Error(`Cannot ${operation} a disposed Slideshow Surface runtime.`);
}

function asSupersededReport(report: PresentationRepositionReport): PresentationRepositionReport {
  if (report.kind === "superseded") return report;
  return Object.freeze({
    kind: "superseded",
    timeMs: report.timeMs,
    cueReports: report.cueReports,
  });
}

function supersededReport(timeMs: number): PresentationRepositionReport {
  return Object.freeze({ kind: "superseded", timeMs, cueReports: Object.freeze([]) });
}

function freezeNarrationSnapshot(
  snapshot: PresentationSurfaceNarrationSnapshot,
  error: SlideshowPresentationNarrationError | null,
  usingInternalClock: boolean,
): SlideshowPresentationNarrationSnapshot {
  return Object.freeze({ ...snapshot, error, usingInternalClock });
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
