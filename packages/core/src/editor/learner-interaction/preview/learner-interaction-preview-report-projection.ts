import type { EmbeddedNodeId, LearnerInteractionRuleId } from "@scaffold/contracts";

import type { ControlCommandError } from "@/document/control-binding/control-binding";
import type { ControlValue } from "@/document/control-binding/control-definition";
import type { SemanticTargetInteractionResult } from "@/document/semantic-target-interaction/semantic-target-interaction-coordinator";
import type {
  LearnerInteractionAuthoringProjection,
  ProjectedLearnerInteractionCommandSource,
  ProjectedLearnerInteractionRule,
} from "@/editor/learner-interaction/model/learner-interaction-authoring-projection";
import type {
  LearnerInteractionCommandOutcome,
  LearnerInteractionRuleEvaluation,
  LearnerInteractionTurnReport,
} from "@/learner-interaction/model";

export type LearnerInteractionPreviewReportSourceLocation =
  | { readonly kind: "when" }
  | { readonly kind: "condition"; readonly conditionIndex: number }
  | { readonly kind: "command"; readonly commandIndex: number };

export interface LearnerInteractionPreviewReportSourceAddress {
  readonly surfaceId: EmbeddedNodeId;
  readonly ruleId: LearnerInteractionRuleId;
  readonly location: LearnerInteractionPreviewReportSourceLocation;
}

export interface LearnerInteractionPreviewPredicateRow {
  readonly conditionIndex: number;
  readonly actualValue: ControlValue;
  readonly matched: boolean;
  readonly summary: string;
  readonly source: LearnerInteractionPreviewReportSourceAddress;
}

export interface LearnerInteractionPreviewRuleRow {
  readonly ruleId: LearnerInteractionRuleId;
  readonly label: string;
  readonly evaluation: LearnerInteractionRuleEvaluation["kind"];
  readonly summary: string;
  readonly source: LearnerInteractionPreviewReportSourceAddress;
  readonly predicates: readonly LearnerInteractionPreviewPredicateRow[];
}

export interface LearnerInteractionPreviewCommandRow {
  readonly ruleId: LearnerInteractionRuleId;
  readonly commandIndex: number;
  readonly outcome: LearnerInteractionCommandOutcome;
  readonly summary: string;
  readonly source: LearnerInteractionPreviewReportSourceAddress;
}

export interface LearnerInteractionPreviewReportProjection {
  readonly turnNumber: number;
  readonly event: LearnerInteractionTurnReport["event"];
  readonly eventSummary: string;
  readonly end: LearnerInteractionTurnReport["end"];
  readonly endSummary: string;
  readonly rules: readonly LearnerInteractionPreviewRuleRow[];
  readonly commands: readonly LearnerInteractionPreviewCommandRow[];
}

export function projectLearnerInteractionPreviewReport(
  report: LearnerInteractionTurnReport,
  authoring: LearnerInteractionAuthoringProjection,
): LearnerInteractionPreviewReportProjection {
  const ruleById = new Map(authoring.rules.map((rule, index) => [rule.rule.id, { rule, index }]));
  const rules = report.ruleEvaluations.map((evaluation) => {
    const projected = requireRule(ruleById, evaluation.ruleId);
    const label = `Rule ${projected.index + 1}`;
    const predicates = evaluation.conditions.map((condition) => {
      const source = projected.rule.conditions[condition.conditionIndex];
      if (!source) {
        throw new Error(
          `Learner Interaction report condition ${condition.conditionIndex} is absent from saved rule "${evaluation.ruleId}".`,
        );
      }
      return Object.freeze({
        conditionIndex: condition.conditionIndex,
        actualValue: condition.actualValue,
        matched: condition.matched,
        summary: `${source.option.label} was ${formatValue(condition.actualValue)} and ${condition.matched ? "matched" : "did not match"}.`,
        source: sourceAddress(authoring.surfaceId, evaluation.ruleId, {
          kind: "condition",
          conditionIndex: condition.conditionIndex,
        }),
      });
    });
    return Object.freeze({
      ruleId: evaluation.ruleId,
      label,
      evaluation: evaluation.kind,
      summary: `${label} ${evaluation.kind === "matched" ? "matched" : "did not match"}.`,
      source: sourceAddress(authoring.surfaceId, evaluation.ruleId, { kind: "when" }),
      predicates: Object.freeze(predicates),
    });
  });
  const commands = report.commandExecutions.map(({ address, outcome }) => {
    const projected = requireRule(ruleById, address.ruleId);
    const source = projected.rule.commands[address.commandIndex];
    if (!source) {
      throw new Error(
        `Learner Interaction report command ${address.commandIndex} is absent from saved rule "${address.ruleId}".`,
      );
    }
    return Object.freeze({
      ruleId: address.ruleId,
      commandIndex: address.commandIndex,
      outcome,
      summary: commandSummary(source, outcome),
      source: sourceAddress(authoring.surfaceId, address.ruleId, {
        kind: "command",
        commandIndex: address.commandIndex,
      }),
    });
  });
  const eventSource = authoring.rules.find(
    ({ when }) =>
      when.reference.targetId === report.event.targetId &&
      when.reference.type === report.event.type,
  )?.when.option;

  return Object.freeze({
    turnNumber: report.turnNumber,
    event: report.event,
    eventSummary: eventSource
      ? `${eventSource.targetLabel} — ${eventSource.label}`
      : `${report.event.targetId} — ${report.event.type}`,
    end: report.end,
    endSummary:
      report.end === "completed" ? "Turn completed." : "Turn ended after Surface navigation.",
    rules: Object.freeze(rules),
    commands: Object.freeze(commands),
  });
}

function requireRule(
  ruleById: ReadonlyMap<
    LearnerInteractionRuleId,
    { readonly rule: ProjectedLearnerInteractionRule; readonly index: number }
  >,
  ruleId: LearnerInteractionRuleId,
) {
  const projected = ruleById.get(ruleId);
  if (!projected) {
    throw new Error(
      `Learner Interaction report rule "${ruleId}" is absent from the saved authoring projection.`,
    );
  }
  return projected;
}

function sourceAddress(
  surfaceId: EmbeddedNodeId,
  ruleId: LearnerInteractionRuleId,
  location: LearnerInteractionPreviewReportSourceLocation,
): LearnerInteractionPreviewReportSourceAddress {
  return Object.freeze({ surfaceId, ruleId, location: Object.freeze(location) });
}

function commandSummary(
  source: ProjectedLearnerInteractionCommandSource,
  outcome: LearnerInteractionCommandOutcome,
): string {
  switch (outcome.kind) {
    case "succeeded":
      if (source.kind === "reveal-target") return `Revealed ${source.option.label}.`;
      if (source.kind === "navigate-surface") return `Navigated to ${source.option.label}.`;
      return `${source.option.label} ran on ${source.option.targetLabel}.`;
    case "control-command-error":
      return controlCommandErrorSummary(outcome.error);
    case "target-not-reached":
      return semanticTargetResultSummary(outcome.result);
    case "navigation-cancelled":
      return "Surface navigation was cancelled.";
    case "skipped":
      return "Skipped after Surface navigation.";
    default:
      return assertNever(outcome);
  }
}

function controlCommandErrorSummary(error: ControlCommandError): string {
  switch (error.reason) {
    case "cancelled":
      return "Command was cancelled.";
    case "playback-not-allowed":
      return "Playback was not allowed.";
    case "media-unavailable":
      return error.mediaErrorCode === null
        ? "Media was unavailable."
        : `Media was unavailable (code ${error.mediaErrorCode}).`;
    case "seek-out-of-range":
      return `Could not seek to ${error.requestedSeconds} seconds; the duration is ${error.durationSeconds} seconds.`;
    case "page-out-of-range":
      return `Page ${error.requestedPage} is outside the ${error.pageCount}-page document.`;
    case "pdf-unavailable":
      return `PDF page ${error.requestedPage} was unavailable.`;
    default:
      return assertNever(error);
  }
}

function semanticTargetResultSummary(
  result: Exclude<SemanticTargetInteractionResult, { readonly kind: "reached" }>,
): string {
  switch (result.kind) {
    case "missing-target":
      return `Target ${result.requestedId} no longer exists.`;
    case "unavailable":
      return `Target ${result.requestedId} was unavailable: ${result.reason}.`;
    case "refused":
      return `Target ${result.requestedId} refused activation: ${result.reason}.`;
    case "interrupted":
      return `Target ${result.requestedId} activation was interrupted.`;
    default:
      return assertNever(result);
  }
}

function formatValue(value: ControlValue): string {
  return typeof value === "string" ? `“${value}”` : String(value);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Learner Interaction report variant: ${JSON.stringify(value)}`);
}
