import type { PresentationTargetCommand } from "./presentation-cue-executor";

export interface CompiledPresentationCue {
  readonly id: string;
  readonly atMs: number;
  readonly command: PresentationTargetCommand;
}

export interface CompiledInternalClockSurfaceTimeline {
  readonly surfaceId: string;
  readonly durationMs: number;
  readonly cues: readonly CompiledPresentationCue[];
}
