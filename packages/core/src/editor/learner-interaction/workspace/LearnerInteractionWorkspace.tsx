import type { LearnerInteractionRuleId } from "@scaffold/contracts";
import { useState, useSyncExternalStore } from "react";

import {
  validateLearnerInteractionRuleDraft,
  type LearnerInteractionAuthoringCommandError,
  type LearnerInteractionAuthoringCommandResult,
  type LearnerInteractionAuthoringProjection,
  type ProjectedLearnerInteractionRule,
} from "../model";
import type {
  LearnerInteractionContextChange,
  LearnerInteractionWorkspaceController,
} from "./learner-interaction-workspace-controller";
import { LearnerInteractionRuleEditor } from "./LearnerInteractionRuleEditor";
import "./LearnerInteractionWorkspace.css";

export interface LearnerInteractionWorkspaceProps {
  readonly controller: LearnerInteractionWorkspaceController;
  readonly projection: LearnerInteractionAuthoringProjection;
  readonly onSetRuleEnabled: (
    ruleId: LearnerInteractionRuleId,
    isEnabled: boolean,
  ) => LearnerInteractionAuthoringCommandResult;
  readonly onReorderRule: (
    ruleId: LearnerInteractionRuleId,
    direction: "earlier" | "later",
  ) => LearnerInteractionAuthoringCommandResult;
  readonly onRemoveRule: (
    ruleId: LearnerInteractionRuleId,
  ) => LearnerInteractionAuthoringCommandResult;
}

export function LearnerInteractionWorkspace({
  controller,
  projection,
  onSetRuleEnabled,
  onReorderRule,
  onRemoveRule,
}: LearnerInteractionWorkspaceProps) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [commandError, setCommandError] = useState<LearnerInteractionAuthoringCommandError | null>(
    null,
  );
  const [focusSource, setFocusSource] = useState<string | null>(null);
  const focusedRule =
    snapshot.status === "idle" || snapshot.draft.ruleId === null
      ? null
      : (projection.rules.find(({ rule }) => rule.id === snapshot.draft.ruleId) ?? null);

  const applyResult = (result: LearnerInteractionAuthoringCommandResult) => {
    setCommandError(result.isErr() ? result.error : null);
  };
  const requestFocus = (row: ProjectedLearnerInteractionRule, source?: string) => {
    const request: LearnerInteractionContextChange = { kind: "rule", ruleId: row.rule.id };
    controller.requestContextChange(request, () => {
      controller.focusRule(toDraft(row));
      setFocusSource(source ?? null);
    });
  };

  return (
    <section className="sc-learner-interactions" aria-labelledby="learner-interactions-heading">
      <header className="sc-learner-interactions-header">
        <div>
          <h2 id="learner-interactions-heading">Interactions</h2>
          <p>Rules for the selected Surface.</p>
        </div>
        <button
          type="button"
          disabled={projection.capabilityState === "empty"}
          onClick={() =>
            controller.requestContextChange({ kind: "rule", ruleId: null }, () =>
              controller.startNewRule(),
            )
          }
        >
          Add rule
        </button>
      </header>

      {projection.capabilityState === "empty" ? (
        <p role="status">This Surface has no learner interaction capabilities.</p>
      ) : null}

      <div className="sc-learner-interactions-body">
        <ol className="sc-learner-interactions-list" aria-label="Interaction rules">
          {projection.rules.map((row, index) => {
            const label = `Rule ${index + 1}`;
            const selected = snapshot.status !== "idle" && snapshot.draft.ruleId === row.rule.id;
            const firstDiagnostic = row.diagnostics[0];
            return (
              <li key={row.rule.id} data-diagnostic={row.diagnostics.length > 0 || undefined}>
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={`Edit ${label}`}
                  onClick={() => requestFocus(row)}
                >
                  <strong>{label}</strong>
                  <span>{row.when.option.label}</span>
                </button>
                {firstDiagnostic ? (
                  <button
                    type="button"
                    aria-label={`Repair ${label} (${row.diagnostics.length} issue${row.diagnostics.length === 1 ? "" : "s"})`}
                    onClick={() => requestFocus(row, sourceKey(firstDiagnostic.source.location))}
                  >
                    {row.diagnostics.length} issue{row.diagnostics.length === 1 ? "" : "s"}
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label={`${row.rule.isEnabled ? "Disable" : "Enable"} ${label}`}
                  onClick={() => applyResult(onSetRuleEnabled(row.rule.id, !row.rule.isEnabled))}
                >
                  {row.rule.isEnabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  aria-label={`Move ${label} earlier`}
                  disabled={index === 0}
                  onClick={() => applyResult(onReorderRule(row.rule.id, "earlier"))}
                >
                  Earlier
                </button>
                <button
                  type="button"
                  aria-label={`Move ${label} later`}
                  disabled={index === projection.rules.length - 1}
                  onClick={() => applyResult(onReorderRule(row.rule.id, "later"))}
                >
                  Later
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  onClick={() =>
                    controller.requestContextChange({ kind: "rule", ruleId: null }, () =>
                      applyResult(onRemoveRule(row.rule.id)),
                    )
                  }
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ol>

        {snapshot.status !== "idle" && (snapshot.draft.ruleId === null || focusedRule !== null) ? (
          <LearnerInteractionRuleEditor
            controller={controller}
            draft={snapshot.draft}
            projection={projection}
            projectedRule={focusedRule}
            focusSource={focusSource}
            onFocusComplete={() => setFocusSource(null)}
          />
        ) : (
          <p className="sc-learner-interactions-editor-empty">Choose a rule to edit.</p>
        )}
      </div>

      {commandError ? <p role="alert">{authoringErrorCopy(commandError)}</p> : null}
      {snapshot.status === "decision-required" ? (
        <div
          className="sc-learner-interactions-exit-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="learner-interactions-exit-title"
          aria-describedby="learner-interactions-exit-description"
        >
          <h3 id="learner-interactions-exit-title">Unsaved rule changes</h3>
          <p id="learner-interactions-exit-description">
            Save or discard this draft before changing context.
          </p>
          {snapshot.saveError ? <p>{authoringErrorCopy(snapshot.saveError)}</p> : null}
          <div>
            <button type="button" autoFocus onClick={() => controller.resolveContextChange("save")}>
              Save changes
            </button>
            <button type="button" onClick={() => controller.resolveContextChange("discard")}>
              Discard changes
            </button>
            <button type="button" onClick={() => controller.resolveContextChange("cancel")}>
              Cancel change
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function toDraft({ rule }: ProjectedLearnerInteractionRule) {
  return {
    ruleId: rule.id,
    isEnabled: rule.isEnabled,
    when: rule.when,
    conditions: rule.conditions,
    commands: rule.commands,
  };
}

function sourceKey(location: {
  readonly kind: string;
  readonly conditionIndex?: number;
  readonly commandIndex?: number;
}) {
  if (location.kind === "condition") return `condition-${location.conditionIndex}`;
  if (location.kind === "command") return `command-${location.commandIndex}`;
  return "when";
}

export function authoringErrorCopy(error: LearnerInteractionAuthoringCommandError): string {
  switch (error.reason) {
    case "editor-destroyed":
      return "This editor is no longer available.";
    case "editor-read-only":
      return "This document is read-only.";
    case "surface-not-current":
      return "The selected Surface is no longer available.";
    case "rule-not-current":
      return "This rule is no longer available on the selected Surface.";
    case "rule-belongs-to-another-surface":
      return "This rule now belongs to another Surface.";
    case "invalid-rule-draft":
      return "Choose a When event and add at least one Then command.";
    case "rule-unresolved":
      return "Repair every unavailable rule source before saving.";
    case "rule-reorder-boundary":
      return `This rule cannot move ${error.direction}.`;
  }
}

export { validateLearnerInteractionRuleDraft };
