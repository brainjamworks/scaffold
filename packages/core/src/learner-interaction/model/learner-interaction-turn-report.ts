import type { LearnerInteractionRuleId } from "@scaffold/contracts";

import type { ControlCommandError, ControlEvent } from "@/document/control-binding/control-binding";
import type { ControlValue } from "@/document/control-binding/control-definition";
import type { SemanticTargetInteractionResult } from "@/document/semantic-target-interaction/semantic-target-interaction-coordinator";

export type LearnerInteractionTurnNumber = number;

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
