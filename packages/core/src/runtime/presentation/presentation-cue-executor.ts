import type { EmbeddedNodeId } from "@scaffold/contracts";

import type {
  ControlBindingRegistry,
  ControlCommandError,
} from "@/document/control-binding/control-binding";
import type { ControlValue } from "@/document/control-binding/control-definition";
import type {
  SemanticTargetInteractionCoordinator,
  SemanticTargetInteractionResult,
} from "@/document/semantic-target-interaction/semantic-target-interaction-coordinator";
import type { SemanticInteractionOrigin } from "@/document/semantic-target-interaction/semantic-target-interaction";

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

export function createPresentationCueExecutor({
  semanticTargets,
  controlBindings,
  origin,
}: {
  readonly semanticTargets: Pick<SemanticTargetInteractionCoordinator, "activate">;
  readonly controlBindings: Pick<ControlBindingRegistry, "get">;
  readonly origin: SemanticInteractionOrigin;
}): PresentationCueExecutor {
  const executor: PresentationCueExecutor = {
    async execute({ command, signal }) {
      const targetResult = await semanticTargets.activate(command.targetId, { origin, signal });
      if (targetResult.kind !== "reached") {
        return { kind: "target-not-reached", result: targetResult };
      }
      if (targetResult.requestedId !== command.targetId) {
        throw new Error(
          `Presentation reached target identity does not match "${command.targetId}".`,
        );
      }

      const binding = controlBindings.get(command.ownerId);
      if (!binding) {
        throw new Error(`Presentation owner "${command.ownerId}" has no current Control Binding.`);
      }
      const commandExecutor = binding.commandExecutor;
      if (!commandExecutor) {
        throw new Error(`Presentation owner "${command.ownerId}" has no Command Executor.`);
      }
      const commandResult = await commandExecutor.execute({
        targetId: command.targetId,
        type: command.type,
        ...(Object.hasOwn(command, "input") ? { input: command.input } : {}),
        signal,
      });
      if (commandResult.isErr()) {
        return { kind: "control-command-error", error: commandResult.error };
      }
      return { kind: "succeeded" };
    },
  };
  return Object.freeze(executor);
}
