import { Result } from "better-result";

import type { ControlBindingRegistry } from "@/document/control-binding/control-binding";
import type { SurfaceId } from "@/document/model/course-structure";
import type { SemanticTargetInteractionCoordinator } from "@/document/semantic-target-interaction/semantic-target-interaction-coordinator";
import type { CompiledSurfaceLearnerInteractionProgram } from "@/runtime/learner-interaction/compiled-learner-interaction-program";
import {
  createSurfaceLearnerInteractionRuntime,
  type SurfaceLearnerInteractionRuntime,
} from "@/runtime/learner-interaction/surface-learner-interaction-runtime";
import type { CompiledInternalClockSurfaceTimeline } from "@/runtime/presentation/compiled-presentation-program";
import { createPresentationCueExecutor } from "@/runtime/presentation/presentation-cue-executor";
import {
  createPresentationPlaybackSession,
  type PresentationPlaybackSession,
} from "@/runtime/presentation/presentation-playback-session";

import type { RequestSurfaceChange } from "./slideshow-surface-change";

export interface SlideshowSurfaceRuntimeProgram {
  readonly presentation?: {
    readonly timeline: CompiledInternalClockSurfaceTimeline;
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
  readonly requestSurfaceChange: RequestSurfaceChange;
}

export interface SlideshowSurfaceRuntimeComposition {
  readonly surfaceId: SurfaceId;
  readonly learnerRuntime: SurfaceLearnerInteractionRuntime;
  readonly presentationSession?: PresentationPlaybackSession;
  dispose(): void;
}

export function createSlideshowSurfaceRuntimeComposition({
  surfaceId,
  program,
  controlBindings,
  semanticTargets,
  requestSurfaceChange,
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
  try {
    presentationSession = program.presentation
      ? createPresentationPlaybackSession({
          timeline: program.presentation.timeline,
          cueExecutor: createPresentationCueExecutor({
            semanticTargets,
            controlBindings,
            origin: "configured-presentation",
          }),
          gatePort: learnerRuntime,
          autoAdvance: program.presentation.autoAdvance,
        })
      : undefined;
  } catch (error) {
    learnerRuntime.dispose();
    throw error;
  }
  let disposed = false;

  return Object.freeze({
    surfaceId,
    learnerRuntime,
    ...(presentationSession ? { presentationSession } : {}),
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
        learnerRuntime.dispose();
      } catch (error) {
        firstDefect ??= error;
      }
      if (firstDefect !== undefined) throw firstDefect;
    },
  });
}

function unexpectedSurfaceChangeError(error: unknown): never {
  const reason = (error as { readonly reason?: unknown }).reason;
  throw new Error(`Unexpected Slideshow Surface change error "${String(reason)}".`);
}

export function assertSlideshowSurfaceRuntimeProgramIdentity(
  surfaceId: SurfaceId,
  program: SlideshowSurfaceRuntimeProgram,
): void {
  if (
    program.learnerInteractions &&
    program.learnerInteractions.surfaceId !== surfaceId
  ) {
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

function createEmptyLearnerProgram(
  surfaceId: SurfaceId,
): CompiledSurfaceLearnerInteractionProgram {
  return Object.freeze({ surfaceId, rulesByEvent: new Map() });
}
