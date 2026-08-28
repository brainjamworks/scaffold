import type { EmbeddedNodeId } from "@scaffold/contracts";

import type { ControlCommandError } from "@/document/control-binding/control-binding";
import type { ControlValue } from "@/document/control-binding/control-definition";
import type { SemanticTargetInteractionResult } from "@/document/semantic-target-interaction/semantic-target-interaction-coordinator";

export interface PresentationTargetCommand {
  readonly kind: "target-command";
  readonly ownerId: EmbeddedNodeId;
  readonly targetId: EmbeddedNodeId;
  readonly type: string;
  readonly input?: ControlValue;
}

export type PresentationCueExecutionOutcome =
  | { readonly kind: "succeeded" }
  | {
      readonly kind: "target-not-reached";
      readonly result: Exclude<SemanticTargetInteractionResult, { readonly kind: "reached" }>;
    }
  | {
      readonly kind: "control-command-error";
      readonly error: ControlCommandError;
    };

export type PresentationCueOutcome =
  | PresentationCueExecutionOutcome
  | {
      readonly kind: "session-interrupted";
      readonly reason: "seek" | "restart" | "stop";
    };

export interface PresentationCueReport {
  readonly runNumber: number;
  readonly surfaceId: string;
  readonly cueId: string;
  readonly scheduledAtMs: number;
  readonly outcome: PresentationCueOutcome;
}

export interface PresentationCueExecutor {
  execute(input: {
    readonly command: PresentationTargetCommand;
    readonly signal: AbortSignal;
  }): Promise<PresentationCueExecutionOutcome>;
}
