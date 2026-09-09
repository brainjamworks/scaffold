import { Result, type Result as ResultType } from "better-result";

import type { ControlBindingRegistry } from "@/document/control-binding/control-binding";
import type { SurfaceId } from "@/document/model/course-structure";
import type { SemanticTargetInteractionCoordinator } from "@/document/semantic-target-interaction/semantic-target-interaction-coordinator";
import type { MediaPort } from "@/host/ports/media";
import type {
  CompiledSurfacePresentationTimeline,
  PresentationPlaybackPosition,
  PresentationMotionMode,
} from "@/presentation/model";
import { createPresentationPlaybackPosition } from "@/presentation/model";
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
  readonly mediaPort?: Pick<MediaPort, "resolve"> | null;
  readonly createNarrationAudioElement?: () => HTMLAudioElement;
  readonly executionEnabled?: boolean;
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

export interface SlideshowPresentationReturnError {
  readonly reason: "no-outstanding-learner-wait";
  readonly surfaceId: SurfaceId;
}

export type SlideshowPresentationReturnResult = ResultType<
  PresentationRepositionReport,
  PresentationSeekError | SlideshowPresentationNarrationError | SlideshowPresentationReturnError
>;

export interface SlideshowPresentationControls {
  getSnapshot: PresentationPlaybackSessionWithReplaceableClock["getSnapshot"];
  getNarrationSnapshot(): SlideshowPresentationNarrationSnapshot | null;
  subscribe: PresentationPlaybackSessionWithReplaceableClock["subscribe"];
  subscribeCueReports: PresentationPlaybackSessionWithReplaceableClock["subscribeCueReports"];
  play(): Promise<
    ResultType<
      void,
      | PresentationSurfaceNarrationLoadError
      | PresentationSurfaceNarrationPlayError
      | PresentationSurfaceNarrationSeekError
    >
  >;
  pause(): void;
  advance(): Promise<
    ResultType<
      void,
      | PresentationAdvanceError
      | PresentationSurfaceNarrationLoadError
      | PresentationSurfaceNarrationPlayError
      | PresentationSurfaceNarrationSeekError
    >
  >;
  continueWithoutNarration(): void;
  restart(): Promise<SlideshowPresentationSeekResult>;
  returnToOutstandingCheckpoint(): Promise<SlideshowPresentationReturnResult>;
  stop(): void;
}

export interface SlideshowSurfaceRuntimeComposition {
  readonly surfaceId: SurfaceId;
  readonly learnerRuntime: SurfaceLearnerInteractionRuntime;
  readonly presentationControls?: SlideshowPresentationControls;
  readonly presentationSurfaceExitGuard?: SurfaceExitGuard;
  readonly presentationVisualRuntime?: PresentationVisualRuntime;
  setExecutionEnabled(enabled: boolean): void;
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
  mediaPort = null,
  createNarrationAudioElement,
  executionEnabled: initialExecutionEnabled = true,
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
    executionEnabled: initialExecutionEnabled,
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
        featureStateReconstructor: cueExecutor,
      });
    }
    if (program.presentation && presentationSession && surfaceRoot) {
      presentationVisualRuntime = createPresentationVisualRuntime({
        visualProgram: program.presentation.timeline.visualProgram,
        layerTracks: program.presentation.timeline.layerTracks,
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
  let executionEnabled = initialExecutionEnabled;
  let presentationOperationGeneration = 0;
  let seekPresentation: SlideshowSurfaceRuntimeComposition["seek"];
  let disposePresentationCoordination: () => void = () => undefined;
  let cancelPresentationCoordinationOperations: () => void = () => undefined;

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
    let suspensionAlignment:
      | {
          readonly runNumber: number;
          readonly position: PresentationPlaybackPosition;
          readonly promise: Promise<ResultType<void, PresentationSurfaceNarrationSeekError>>;
        }
      | undefined;
    const coordinationWaiters = new Set<() => void>();

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
    const pauseNarration = (cancelPendingStart = false) => {
      if (!narration) return;
      const status = narration.getSnapshot().status;
      if (status === "idle" || status === "loading") return;
      if (cancelPendingStart || status === "playing" || status === "buffering") {
        narration.pause();
      }
    };
    const isCurrentOperation = (generation: number) =>
      !disposed && executionEnabled && generation === presentationOperationGeneration;
    const cancelCoordinationWaiters = () => {
      for (const cancel of [...coordinationWaiters]) cancel();
      coordinationWaiters.clear();
    };
    cancelPresentationCoordinationOperations = cancelCoordinationWaiters;
    const invalidatePresentationOperations = () => {
      presentationOperationGeneration += 1;
      cancelCoordinationWaiters();
    };
    const ensureNarrationLoaded = async () => {
      if (!narration || !narrationLoad) return Result.ok();
      const result = await narrationLoad;
      if (result.isErr() && !disposed) rememberNarrationError(result.error);
      return result;
    };
    const alignNarrationToPosition = (
      position: PresentationPlaybackPosition,
      runNumber: number,
    ): Promise<ResultType<void, PresentationSurfaceNarrationSeekError>> => {
      if (!narration || usingInternalClock) return Promise.resolve(Result.ok());
      if (
        suspensionAlignment?.runNumber === runNumber &&
        suspensionAlignment.position.timeMs === position.timeMs &&
        suspensionAlignment.position.side === position.side
      ) {
        return suspensionAlignment.promise;
      }
      if (narration.getSnapshot().currentTimeMs === position.timeMs) {
        const promise = Promise.resolve(Result.ok());
        suspensionAlignment = { runNumber, position, promise };
        return promise;
      }
      const promise = narration.seek(position.timeMs).then((result) => {
        if (result.isErr() && suspensionAlignment?.promise === promise) {
          suspensionAlignment = undefined;
        }
        if (result.isErr() && !disposed && result.error.reason !== "cancelled") {
          rememberNarrationError(result.error);
        }
        return result;
      });
      suspensionAlignment = { runNumber, position, promise };
      return promise;
    };
    const waitForMediaStartBoundary = async (
      generation: number,
    ): Promise<ReturnType<typeof session.getSnapshot> | null> => {
      const ready = () => {
        if (!isCurrentOperation(generation)) return null;
        const current = session.getSnapshot();
        return current.advancement === "suspended" && current.phase === "playing"
          ? undefined
          : current;
      };
      const current = ready();
      if (current !== undefined) return current;
      return new Promise((resolve) => {
        let settled = false;
        let unsubscribe: () => void = () => undefined;
        const finish = (snapshot: ReturnType<typeof session.getSnapshot> | null) => {
          if (settled) return;
          settled = true;
          coordinationWaiters.delete(cancel);
          unsubscribe();
          resolve(snapshot);
        };
        const cancel = () => finish(null);
        coordinationWaiters.add(cancel);
        unsubscribe = session.subscribe(() => {
          const next = ready();
          if (next !== undefined) finish(next);
        });
      });
    };
    const ownsMediaStart = (
      generation: number,
      expected: ReturnType<typeof session.getSnapshot>,
    ): boolean => {
      if (!isCurrentOperation(generation)) return false;
      const current = session.getSnapshot();
      return (
        current.phase === "playing" &&
        current.advancement === "awaiting-media-start" &&
        current.runNumber === expected.runNumber &&
        current.position.timeMs === expected.position.timeMs &&
        current.position.side === expected.position.side &&
        current.outstandingLearnerWait?.waitId === expected.outstandingLearnerWait?.waitId
      );
    };
    const confirmCurrentNarrationStart = async (
      generation: number,
      expected: ReturnType<typeof session.getSnapshot>,
    ): Promise<ResultType<void, PresentationSurfaceNarrationPlayError>> => {
      if (!ownsMediaStart(generation, expected)) {
        return Result.err(cancelledNarrationOperation(surfaceId, "play"));
      }
      if (!narration) throw new Error("Narrated playback has no narration controller.");
      const played = await narration.play();
      if (!ownsMediaStart(generation, expected)) {
        return Result.err(cancelledNarrationOperation(surfaceId, "play"));
      }
      if (played.isErr()) {
        session.cancelMediaStart();
        rememberNarrationError(played.error);
        return played;
      }
      narrationError = null;
      session.confirmMediaStart();
      refreshNarrationSnapshot();
      return Result.ok();
    };
    const playPresentation = async (): ReturnType<SlideshowPresentationControls["play"]> => {
      assertCompositionNotDisposed(disposed, "play");
      if (!executionEnabled) return Result.ok();
      if (!narration || usingInternalClock) {
        session.play();
        return Result.ok();
      }
      const current = session.getSnapshot();
      if (current.phase !== "awaiting-start" && current.phase !== "paused") {
        session.play();
        return Result.ok();
      }
      repositioner.cancel();
      invalidatePresentationOperations();
      const generation = presentationOperationGeneration;
      session.beginMediaStart();
      const loaded = await ensureNarrationLoaded();
      if (!isCurrentOperation(generation)) {
        return Result.err(cancelledNarrationOperation(surfaceId, "play"));
      }
      if (loaded.isErr()) {
        session.cancelMediaStart();
        return loaded;
      }
      const aligned = await alignNarrationToPosition(current.position, current.runNumber);
      if (!isCurrentOperation(generation)) {
        return Result.err(cancelledNarrationOperation(surfaceId, "play"));
      }
      if (aligned.isErr()) {
        session.cancelMediaStart();
        return aligned;
      }
      session.useNarrationClock(createPresentationNarrationClockSource(narration));
      session.play();
      const startBoundary = await waitForMediaStartBoundary(generation);
      if (!startBoundary) {
        return Result.err(cancelledNarrationOperation(surfaceId, "play"));
      }
      if (!isCurrentOperation(generation)) {
        return Result.err(cancelledNarrationOperation(surfaceId, "play"));
      }
      if (startBoundary.advancement !== "awaiting-media-start") {
        session.cancelMediaStart();
        return Result.ok();
      }
      return confirmCurrentNarrationStart(generation, startBoundary);
    };
    const advancePresentation = async (): ReturnType<SlideshowPresentationControls["advance"]> => {
      assertCompositionNotDisposed(disposed, "advance");
      if (!executionEnabled) return Result.ok();
      if (!narration || usingInternalClock) return session.advance();
      const eligible = session.beginAdvanceMediaStart();
      if (eligible.isErr()) return eligible;
      repositioner.cancel();
      invalidatePresentationOperations();
      const generation = presentationOperationGeneration;
      const loaded = await ensureNarrationLoaded();
      if (!isCurrentOperation(generation)) {
        return Result.err(cancelledNarrationOperation(surfaceId, "play"));
      }
      if (loaded.isErr()) {
        session.cancelMediaStart();
        return loaded;
      }
      const held = session.getSnapshot();
      const aligned = await alignNarrationToPosition(held.position, held.runNumber);
      if (!isCurrentOperation(generation)) {
        return Result.err(cancelledNarrationOperation(surfaceId, "play"));
      }
      if (aligned.isErr()) {
        session.cancelMediaStart();
        return aligned;
      }
      session.useNarrationClock(createPresentationNarrationClockSource(narration));
      const result = session.advance();
      if (result.isErr()) {
        session.cancelMediaStart();
        return result;
      }
      const startBoundary = await waitForMediaStartBoundary(generation);
      if (!startBoundary) {
        return Result.err(cancelledNarrationOperation(surfaceId, "play"));
      }
      if (!isCurrentOperation(generation)) {
        return Result.err(cancelledNarrationOperation(surfaceId, "play"));
      }
      if (startBoundary.advancement !== "awaiting-media-start") {
        session.cancelMediaStart();
        return Result.ok();
      }
      return confirmCurrentNarrationStart(generation, startBoundary);
    };

    const repositionPresentation = async (
      position: PresentationPlaybackPosition,
      restart: boolean,
      activateCheckpoint = false,
    ): Promise<SlideshowPresentationSeekResult> => {
      assertCompositionNotDisposed(disposed, restart ? "restart" : "seek");
      const snapshot = session.getSnapshot();

      const resumeAfterSeek =
        !restart && snapshot.phase === "playing" && snapshot.advancement === "advancing";
      invalidatePresentationOperations();
      suspensionAlignment = undefined;
      const generation = presentationOperationGeneration;
      repositioner.cancel();
      if (snapshot.phase !== "stopped") {
        session.beginReposition(restart ? "restart" : "seek");
        session.pause();
        session.cancelMediaStart();
      }
      pauseNarration(true);

      if (narration && !usingInternalClock) {
        const loaded = await ensureNarrationLoaded();
        if (disposed || generation !== presentationOperationGeneration) {
          return Result.ok(supersededReport(position));
        }
        if (loaded.isErr()) return loaded;
        if (narration.getSnapshot().currentTimeMs !== position.timeMs) {
          const mediaSeek = await narration.seek(position.timeMs);
          if (disposed || generation !== presentationOperationGeneration) {
            return Result.ok(supersededReport(position));
          }
          if (mediaSeek.isErr()) {
            rememberNarrationError(mediaSeek.error);
            return mediaSeek;
          }
        }
      }

      const report = await repositioner.reposition(position);
      if (disposed || generation !== presentationOperationGeneration) {
        return Result.ok(asSupersededReport(report));
      }
      if (report.kind === "applied") {
        if (restart) session.restart();
        else session.seek(position);
      }

      const enterCheckpoint =
        report.kind === "applied" &&
        !restart &&
        (activateCheckpoint ||
          (resumeAfterSeek &&
            program.presentation!.timeline.waits.some(
              (wait) => wait.atMs === position.timeMs && wait.boundary === position.side,
            )));
      if (enterCheckpoint) {
        session.play();
      } else if (resumeAfterSeek && report.kind === "applied" && narration && !usingInternalClock) {
        session.beginMediaStart();
        session.useNarrationClock(createPresentationNarrationClockSource(narration));
        session.play();
        const startBoundary = await waitForMediaStartBoundary(generation);
        if (disposed || generation !== presentationOperationGeneration) {
          return Result.ok(asSupersededReport(report));
        }
        if (!startBoundary) return Result.ok(asSupersededReport(report));
        if (startBoundary.advancement === "awaiting-media-start") {
          const played = await confirmCurrentNarrationStart(generation, startBoundary);
          if (disposed || generation !== presentationOperationGeneration) {
            return Result.ok(asSupersededReport(report));
          }
          if (played.isErr()) return played;
        } else {
          session.cancelMediaStart();
        }
      } else if (resumeAfterSeek && report.kind === "applied") {
        session.play();
      }
      return Result.ok(report);
    };

    seekPresentation = async (timeMs) => {
      assertPresentationSeekTime(timeMs);
      const position = session.resolveSeekPosition(timeMs);
      if (position.isErr()) return position;
      return repositionPresentation(position.value, false);
    };
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
        invalidatePresentationOperations();
        suspensionAlignment = undefined;
        repositioner.cancel();
        if (session.getSnapshot().phase !== "stopped") session.pause();
        session.cancelMediaStart();
        pauseNarration(true);
      },
      advance: advancePresentation,
      continueWithoutNarration() {
        assertCompositionNotDisposed(disposed, "continue without narration in");
        if (!executionEnabled) return;
        invalidatePresentationOperations();
        suspensionAlignment = undefined;
        repositioner.cancel();
        pauseNarration(true);
        session.cancelMediaStart();
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
      restart: () =>
        repositionPresentation(createPresentationPlaybackPosition(0, "before-actions"), true),
      async returnToOutstandingCheckpoint() {
        assertCompositionNotDisposed(disposed, "return to an outstanding checkpoint in");
        const outstanding = session.getSnapshot().outstandingLearnerWait;
        if (!outstanding) {
          return Result.err(
            Object.freeze({ reason: "no-outstanding-learner-wait" as const, surfaceId }),
          );
        }
        return repositionPresentation(outstanding.position, false, true);
      },
      stop() {
        assertCompositionNotDisposed(disposed, "stop");
        invalidatePresentationOperations();
        suspensionAlignment = undefined;
        repositioner.cancel();
        pauseNarration(true);
        session.stop();
      },
    });

    const unsubscribeSession = session.subscribe(() => {
      const next = session.getSnapshot();
      if (next.advancement === "suspended") {
        pauseNarration();
        const narrationStatus = narration?.getSnapshot().status;
        if (
          narration &&
          !usingInternalClock &&
          (next.phase === "playing" || next.phase === "held") &&
          narrationStatus !== "idle" &&
          narrationStatus !== "loading" &&
          narrationStatus !== "failed"
        ) {
          void alignNarrationToPosition(next.position, next.runNumber);
        }
      }
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
      narration?.subscribe(() => {
        const next = narration.getSnapshot();
        if (
          next.status === "ended" &&
          !usingInternalClock &&
          next.currentTimeMs < session.getSnapshot().durationMs
        ) {
          session.useInternalClock();
          usingInternalClock = true;
          narrationError = null;
        }
        refreshNarrationSnapshot();
      }) ?? (() => undefined);
    disposePresentationCoordination = () => {
      cancelCoordinationWaiters();
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
    setExecutionEnabled(enabled: boolean) {
      assertCompositionNotDisposed(disposed, "change execution for");
      if (executionEnabled === enabled) return;
      executionEnabled = enabled;
      if (!enabled) presentationControls?.pause();
      learnerRuntime.setExecutionEnabled(enabled);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      presentationOperationGeneration += 1;
      cancelPresentationCoordinationOperations();
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

function cancelledNarrationOperation(
  surfaceId: SurfaceId,
  operation: "play",
): PresentationSurfaceNarrationPlayError {
  return Object.freeze({ reason: "cancelled", surfaceId, operation });
}

function assertCompositionNotDisposed(disposed: boolean, operation: string): void {
  if (disposed) throw new Error(`Cannot ${operation} a disposed Slideshow Surface runtime.`);
}

function asSupersededReport(report: PresentationRepositionReport): PresentationRepositionReport {
  if (report.kind === "superseded") return report;
  return Object.freeze({
    kind: "superseded",
    position: report.position,
    cueReports: report.cueReports,
  });
}

function supersededReport(position: PresentationPlaybackPosition): PresentationRepositionReport {
  return Object.freeze({ kind: "superseded", position, cueReports: Object.freeze([]) });
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
