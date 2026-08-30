import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Result as ResultType } from "better-result";

import type {
  ControlBinding,
  ControlBindingRegistry,
  ControlCommandError,
  ControlEvent,
} from "@/document/control-binding/control-binding";
import type { ControlValue } from "@/document/control-binding/control-definition";
import type { SemanticInteractionOrigin } from "@/document/semantic-target-interaction/semantic-target-interaction";
import type {
  SemanticTargetInteractionCoordinator,
  SemanticTargetInteractionResult,
} from "@/document/semantic-target-interaction/semantic-target-interaction-coordinator";

import type {
  CompiledControlStatePredicate,
  CompiledLearnerInteractionCommand,
  CompiledLearnerInteractionRule,
  CompiledSurfaceLearnerInteractionProgram,
  LearnerInteractionRuleId,
} from "./compiled-learner-interaction-program";
import { createLearnerInteractionEventKey } from "./compiled-learner-interaction-program";

export type LearnerInteractionTurnNumber = number;

export interface LearnerInteractionNavigationError {
  readonly reason: "cancelled";
}

export interface LearnerInteractionSurfaceNavigationPort {
  navigate(
    surfaceId: EmbeddedNodeId,
    signal: AbortSignal,
  ): Promise<ResultType<void, LearnerInteractionNavigationError>>;
}

export interface LearnerInteractionTurnReport {
  readonly turnNumber: LearnerInteractionTurnNumber;
  readonly event: ControlEvent;
  readonly ruleEvaluations: readonly LearnerInteractionRuleEvaluation[];
  readonly commandExecutions: readonly LearnerInteractionCommandExecution[];
  readonly end: "completed" | "surface-navigation-committed";
}

export type LearnerInteractionRuleEvaluation =
  | {
      readonly kind: "matched";
      readonly ruleId: LearnerInteractionRuleId;
      readonly conditions: readonly LearnerInteractionConditionEvaluation[];
    }
  | {
      readonly kind: "not-matched";
      readonly ruleId: LearnerInteractionRuleId;
      readonly conditions: readonly LearnerInteractionConditionEvaluation[];
    };

export interface LearnerInteractionConditionEvaluation {
  readonly conditionIndex: number;
  readonly actualValue: ControlValue;
  readonly matched: boolean;
}

export interface LearnerInteractionCommandAddress {
  readonly ruleId: LearnerInteractionRuleId;
  readonly commandIndex: number;
}

export interface LearnerInteractionCommandExecution {
  readonly address: LearnerInteractionCommandAddress;
  readonly outcome: LearnerInteractionCommandOutcome;
}

export type LearnerInteractionCommandOutcome =
  | { readonly kind: "succeeded" }
  | {
      readonly kind: "control-command-error";
      readonly error: ControlCommandError;
    }
  | {
      readonly kind: "target-not-reached";
      readonly result: Exclude<SemanticTargetInteractionResult, { readonly kind: "reached" }>;
    }
  | { readonly kind: "navigation-cancelled" }
  | {
      readonly kind: "skipped";
      readonly reason: "surface-navigation-committed";
    };

export interface ExecuteLearnerInteractionEventTurnInput {
  readonly turnNumber: LearnerInteractionTurnNumber;
  readonly ownerId: EmbeddedNodeId;
  readonly event: ControlEvent;
  readonly program: CompiledSurfaceLearnerInteractionProgram;
  readonly controlBindings: Pick<ControlBindingRegistry, "get">;
  readonly semanticTargets: Pick<SemanticTargetInteractionCoordinator, "activate">;
  readonly surfaceNavigation: LearnerInteractionSurfaceNavigationPort;
  readonly semanticInteractionOrigin: Extract<
    SemanticInteractionOrigin,
    "author-preview" | "learner-interaction-rule"
  >;
  readonly signal: AbortSignal;
}

export async function executeLearnerInteractionEventTurn({
  turnNumber,
  ownerId,
  event,
  program,
  controlBindings,
  semanticTargets,
  surfaceNavigation,
  semanticInteractionOrigin,
  signal,
}: ExecuteLearnerInteractionEventTurnInput): Promise<LearnerInteractionTurnReport> {
  const rules = program.rulesByEvent.get(
    createLearnerInteractionEventKey({ ownerId, targetId: event.targetId, type: event.type }),
  );
  if (!rules || rules.length === 0) {
    return deepFreeze({
      turnNumber,
      event: { targetId: event.targetId, type: event.type },
      ruleEvaluations: [],
      commandExecutions: [],
      end: "completed",
    });
  }

  const stateView = readConditionState(rules, controlBindings);
  const ruleEvaluations = rules.map((rule) => evaluateRule(rule, stateView));
  const plannedCommands = rules.flatMap((rule, ruleIndex) =>
    ruleEvaluations[ruleIndex]?.kind === "matched" ? planRuleCommands(rule) : [],
  );
  const commandExecutions: LearnerInteractionCommandExecution[] = [];

  for (let plannedIndex = 0; plannedIndex < plannedCommands.length; plannedIndex += 1) {
    const planned = plannedCommands[plannedIndex];
    if (!planned) throw new Error("Learner Interaction planned command is missing.");
    if (planned.command.kind === "target-command") {
      const binding = requireControlBinding(controlBindings, planned.command.ownerId);
      const commandExecutor = binding.commandExecutor;
      if (!commandExecutor) {
        throw new Error(
          `Learner Interaction owner "${planned.command.ownerId}" has no Command Executor.`,
        );
      }
      const result = await commandExecutor.execute({
        targetId: planned.command.targetId,
        type: planned.command.type,
        ...(Object.hasOwn(planned.command, "input") ? { input: planned.command.input } : {}),
        signal,
      });
      if (result.isErr()) {
        commandExecutions.push({
          address: planned.address,
          outcome: { kind: "control-command-error", error: copyControlCommandError(result.error) },
        });
        continue;
      }
      commandExecutions.push({ address: planned.address, outcome: { kind: "succeeded" } });
      continue;
    }
    if (planned.command.kind === "reveal-target") {
      const result = await semanticTargets.activate(planned.command.targetId, {
        origin: semanticInteractionOrigin,
        signal,
      });
      if (result.requestedId !== planned.command.targetId) {
        throw new Error(
          `Learner Interaction semantic target identity does not match "${planned.command.targetId}".`,
        );
      }
      commandExecutions.push({
        address: planned.address,
        outcome:
          result.kind === "reached"
            ? { kind: "succeeded" }
            : { kind: "target-not-reached", result: copySemanticTargetResult(result) },
      });
      continue;
    }
    const result = await surfaceNavigation.navigate(planned.command.surfaceId, signal);
    if (result.isErr()) {
      commandExecutions.push({
        address: planned.address,
        outcome: { kind: "navigation-cancelled" },
      });
      continue;
    }
    commandExecutions.push({
      address: planned.address,
      outcome: { kind: "succeeded" },
    });
    for (const skipped of plannedCommands.slice(plannedIndex + 1)) {
      commandExecutions.push({
        address: skipped.address,
        outcome: { kind: "skipped", reason: "surface-navigation-committed" },
      });
    }
    return deepFreeze({
      turnNumber,
      event: { targetId: event.targetId, type: event.type },
      ruleEvaluations,
      commandExecutions,
      end: "surface-navigation-committed",
    });
  }

  return deepFreeze({
    turnNumber,
    event: { targetId: event.targetId, type: event.type },
    ruleEvaluations,
    commandExecutions,
    end: "completed",
  });
}

function readConditionState(
  rules: readonly CompiledLearnerInteractionRule[],
  controlBindings: Pick<ControlBindingRegistry, "get">,
): ReadonlyMap<string, ControlValue> {
  const stateView = new Map<string, ControlValue>();
  for (const rule of rules) {
    for (const condition of rule.conditions) {
      const key = conditionStateKey(condition);
      if (stateView.has(key)) continue;
      const binding = requireControlBinding(controlBindings, condition.ownerId);
      const stateReader = binding.stateReader;
      if (!stateReader) {
        throw new Error(`Learner Interaction owner "${condition.ownerId}" has no State Reader.`);
      }
      stateView.set(key, stateReader.read({ targetId: condition.targetId, key: condition.key }));
    }
  }
  return stateView;
}

function evaluateRule(
  rule: CompiledLearnerInteractionRule,
  stateView: ReadonlyMap<string, ControlValue>,
): LearnerInteractionRuleEvaluation {
  const conditions = rule.conditions.map((condition, conditionIndex) => {
    const actualValue = stateView.get(conditionStateKey(condition));
    if (actualValue === undefined) {
      throw new Error(`Learner Interaction rule "${rule.id}" has no collected condition state.`);
    }
    const equals = actualValue === condition.value;
    return {
      conditionIndex,
      actualValue,
      matched: condition.operator === "equals" ? equals : !equals,
    };
  });
  return {
    kind: conditions.every(({ matched }) => matched) ? "matched" : "not-matched",
    ruleId: rule.id,
    conditions,
  };
}

function conditionStateKey(condition: CompiledControlStatePredicate): string {
  return JSON.stringify([condition.ownerId, condition.targetId, condition.key]);
}

function requireControlBinding(
  controlBindings: Pick<ControlBindingRegistry, "get">,
  ownerId: EmbeddedNodeId,
): ControlBinding {
  const binding = controlBindings.get(ownerId);
  if (!binding) {
    throw new Error(`Learner Interaction owner "${ownerId}" has no current Control Binding.`);
  }
  return binding;
}

function copySemanticTargetResult(
  result: Exclude<SemanticTargetInteractionResult, { readonly kind: "reached" }>,
): Exclude<SemanticTargetInteractionResult, { readonly kind: "reached" }> {
  if (result.kind === "missing-target" || result.kind === "interrupted") {
    return { kind: result.kind, requestedId: result.requestedId };
  }
  if (result.kind === "unavailable") {
    return {
      kind: result.kind,
      requestedId: result.requestedId,
      ownerId: result.ownerId,
      childId: result.childId,
      nearestReachableOwnerId: result.nearestReachableOwnerId,
      reason: result.reason,
    };
  }
  return {
    kind: result.kind,
    requestedId: result.requestedId,
    ownerId: result.ownerId,
    childId: result.childId,
    nearestReachableOwnerId: result.nearestReachableOwnerId,
    reason: result.reason,
  };
}

function copyControlCommandError(error: ControlCommandError): ControlCommandError {
  switch (error.reason) {
    case "cancelled":
    case "playback-not-allowed":
      return { reason: error.reason };
    case "media-unavailable":
      return { reason: error.reason, mediaErrorCode: error.mediaErrorCode };
    case "seek-out-of-range":
      return {
        reason: error.reason,
        requestedSeconds: error.requestedSeconds,
        durationSeconds: error.durationSeconds,
      };
    case "page-out-of-range":
      return {
        reason: error.reason,
        requestedPage: error.requestedPage,
        pageCount: error.pageCount,
      };
    case "pdf-unavailable":
      return { reason: error.reason, requestedPage: error.requestedPage };
  }
}

interface PlannedLearnerInteractionCommand {
  readonly address: LearnerInteractionCommandAddress;
  readonly command: CompiledLearnerInteractionCommand;
}

function planRuleCommands(
  rule: CompiledLearnerInteractionRule,
): readonly PlannedLearnerInteractionCommand[] {
  return rule.commands.map((command, commandIndex) => ({
    address: { ruleId: rule.id, commandIndex },
    command,
  }));
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
