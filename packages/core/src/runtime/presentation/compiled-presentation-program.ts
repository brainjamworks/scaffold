import type { EmbeddedDataId } from "@scaffold/contracts";

import type {
  CompiledLearnerRequirement as NeutralCompiledLearnerRequirement,
  CompiledPresentationCue as NeutralCompiledPresentationCue,
  CompiledPresentationWait as NeutralCompiledPresentationWait,
  CompiledSurfacePresentationTimeline,
} from "@/presentation/model";

import type { PresentationTargetCommand } from "./presentation-cue-executor";

export type PresentationWaitId = EmbeddedDataId;

export type CompiledLearnerRequirement = NeutralCompiledLearnerRequirement;

export type CompiledPresentationWait = NeutralCompiledPresentationWait;

export interface CompiledPresentationCue {
  readonly id: NeutralCompiledPresentationCue["id"];
  readonly atMs: number;
  readonly command: PresentationTargetCommand;
}

export interface CompiledInternalClockSurfaceTimeline {
  readonly surfaceId: string;
  readonly durationMs: number;
  readonly cues: readonly CompiledPresentationCue[];
  readonly waits: readonly CompiledPresentationWait[];
}

export function projectInternalClockSurfaceTimeline(
  program: CompiledSurfacePresentationTimeline,
): CompiledInternalClockSurfaceTimeline {
  const cues = program.cues.map((cue): CompiledPresentationCue => {
    if (cue.command.kind !== "target-command") {
      throw new Error(
        `Presentation Session cue "${cue.id}" uses unsupported command "${cue.command.kind}".`,
      );
    }
    return cue;
  });
  return Object.freeze({
    surfaceId: program.surfaceId,
    durationMs: program.durationMs,
    cues: Object.freeze(cues),
    waits: program.waits,
  });
}
