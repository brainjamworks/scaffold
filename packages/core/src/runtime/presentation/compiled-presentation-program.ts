import type { EmbeddedDataId, EmbeddedNodeId } from "@scaffold/contracts";

import type {
  ControlEventType,
  ControlStateKey,
  ControlValue,
} from "@/document/control-binding/control-definition";

import type { PresentationTargetCommand } from "./presentation-cue-executor";

export type PresentationWaitId = EmbeddedDataId;

export type CompiledLearnerRequirement =
  | {
      readonly kind: "event";
      readonly ownerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly type: ControlEventType;
    }
  | {
      readonly kind: "state";
      readonly ownerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly key: ControlStateKey;
      readonly equals: ControlValue;
    };

export type CompiledPresentationWait =
  | {
      readonly kind: "manual-wait";
      readonly id: PresentationWaitId;
      readonly atMs: number;
    }
  | {
      readonly kind: "learner-wait";
      readonly id: PresentationWaitId;
      readonly atMs: number;
      readonly requirement: CompiledLearnerRequirement;
    };

export interface CompiledPresentationCue {
  readonly id: string;
  readonly atMs: number;
  readonly command: PresentationTargetCommand;
}

export interface CompiledInternalClockSurfaceTimeline {
  readonly surfaceId: string;
  readonly durationMs: number;
  readonly cues: readonly CompiledPresentationCue[];
  readonly waits: readonly CompiledPresentationWait[];
}
