import type {
  EmbeddedDataId,
  EmbeddedNodeId,
  PresentationConfigurationV1,
  PresentationVisualIntentV1,
  SurfacePresentationNarrationV1,
  SurfaceTransitionV1,
} from "@scaffold/contracts";

export type PresentationMotionMode = "normal" | "reduced-motion";

export type PresentationCueSeekBehavior = "reconstruct-state" | "consume";

export type CompiledPresentationCommand =
  | {
      readonly kind: "target-command";
      readonly ownerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly type: string;
      readonly input?: boolean | string | number;
    }
  | {
      readonly kind: "navigate-surface";
      readonly surfaceId: EmbeddedNodeId;
    };

export interface CompiledPresentationCue {
  readonly id: EmbeddedDataId;
  readonly atMs: number;
  readonly command: CompiledPresentationCommand;
  readonly seekBehavior: PresentationCueSeekBehavior;
}

export type CompiledLearnerRequirement =
  | {
      readonly kind: "event";
      readonly ownerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly type: string;
    }
  | {
      readonly kind: "state";
      readonly ownerId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly key: string;
      readonly equals: boolean | string | number;
    };

export type CompiledPresentationWait =
  | {
      readonly kind: "manual-wait";
      readonly id: EmbeddedDataId;
      readonly atMs: number;
    }
  | {
      readonly kind: "learner-wait";
      readonly id: EmbeddedDataId;
      readonly atMs: number;
      readonly requirement: CompiledLearnerRequirement;
    };

export interface CompiledVisualTarget {
  readonly targetId: EmbeddedNodeId;
  readonly initialVisibility: "visible" | "withheld";
}

export type CompiledVisualIntent = PresentationVisualIntentV1;

export interface CompiledVisualSegment {
  readonly id: EmbeddedDataId;
  readonly targetId: EmbeddedNodeId;
  readonly startMs: number;
  readonly endMs: number;
  readonly visual: CompiledVisualIntent;
}

export interface CompiledSurfacePresentationVisualProgram {
  readonly surfaceId: EmbeddedNodeId;
  readonly durationMs: number;
  readonly targetById: ReadonlyMap<EmbeddedNodeId, CompiledVisualTarget>;
  readonly segments: readonly CompiledVisualSegment[];
}

export interface CompiledSurfacePresentationTimeline {
  readonly surfaceId: EmbeddedNodeId;
  readonly durationMs: number;
  readonly narration?: SurfacePresentationNarrationV1;
  /** How this incoming Surface enters after an approved Surface change; `null` means Cut. */
  readonly transition: SurfaceTransitionV1 | null;
  readonly cues: readonly CompiledPresentationCue[];
  readonly waits: readonly CompiledPresentationWait[];
  readonly visualProgram: CompiledSurfacePresentationVisualProgram;
}

export interface CompiledPresentationPlaybackProgram {
  readonly schemaVersion: PresentationConfigurationV1["schemaVersion"];
  readonly autoAdvance: boolean;
  readonly allowPrevious: boolean;
  readonly surfaces: readonly CompiledSurfacePresentationTimeline[];
  readonly surfaceById: ReadonlyMap<EmbeddedNodeId, CompiledSurfacePresentationTimeline>;
}
