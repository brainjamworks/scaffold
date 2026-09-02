import type { LearnerInteractionRuleId, ScaffoldDocumentContent } from "@scaffold/contracts";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
  validateLearnerInteractionRuleDraft,
  type LearnerInteractionAuthoringCommandError,
  type LearnerInteractionAuthoringCommandResult,
  type LearnerInteractionAuthoringProjection,
  type ProjectedLearnerInteractionRule,
} from "../model";
import {
  projectLearnerInteractionPreviewReport,
  type LearnerInteractionPreviewController,
} from "../preview";
import type {
  LearnerInteractionPreviewLoadError,
  LearnerInteractionTurnReport,
} from "@/learner-interaction/model";
import type {
  LearnerInteractionContextChange,
  LearnerInteractionWorkspaceController,
} from "./learner-interaction-workspace-controller";
import { LearnerInteractionRuleEditor } from "./LearnerInteractionRuleEditor";
import { AppDialog } from "@/ui/components/app/AppDialog/AppDialog";
import "./LearnerInteractionWorkspace.css";

export interface LearnerInteractionWorkspaceProps {
  readonly controller: LearnerInteractionWorkspaceController;
  readonly projection: LearnerInteractionAuthoringProjection;
  readonly previewController: LearnerInteractionPreviewController;
  readonly previewDocument: ScaffoldDocumentContent;
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
  readonly onResolveContextChange?: (decision: "save" | "discard" | "cancel") => void;
}

export function LearnerInteractionWorkspace({
  controller,
  projection,
  previewController,
  previewDocument,
  onSetRuleEnabled,
  onReorderRule,
  onRemoveRule,
  onResolveContextChange,
}: LearnerInteractionWorkspaceProps) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const previewSnapshot = useSyncExternalStore(
    previewController.subscribe,
    previewController.getSnapshot,
    previewController.getSnapshot,
  );
  const [latestReport, setLatestReport] = useState<LearnerInteractionTurnReport | null>(null);
  const [commandError, setCommandError] = useState<LearnerInteractionAuthoringCommandError | null>(
    null,
  );
  const [focusSource, setFocusSource] = useState<string | null>(null);
  const saveDecisionRef = useRef<HTMLButtonElement>(null);
  const decisionOpenerRef = useRef<HTMLElement | null>(null);
  const focusedRule =
    snapshot.status === "idle" || snapshot.draft.ruleId === null
      ? null
      : (projection.rules.find(({ rule }) => rule.id === snapshot.draft.ruleId) ?? null);
  const projectedReport = useMemo(
    () => (latestReport ? projectLearnerInteractionPreviewReport(latestReport, projection) : null),
    [latestReport, projection],
  );
  const draftBlocksPreview =
    snapshot.status !== "idle" &&
    (snapshot.status !== "focused-clean" ||
      validateLearnerInteractionRuleDraft(snapshot.draft).length > 0);
  const previewDisabled = projection.rules.length === 0 || draftBlocksPreview;

  useEffect(
    () => previewController.subscribeReports((report) => setLatestReport(report)),
    [previewController, previewSnapshot.status],
  );
  useEffect(() => {
    if (previewSnapshot.status === "idle" || previewSnapshot.status === "loading") {
      setLatestReport(null);
    }
  }, [previewSnapshot.status]);

  const applyResult = (result: LearnerInteractionAuthoringCommandResult) => {
    setCommandError(result.isErr() ? result.error : null);
  };
  const resolveContextChange = (decision: "save" | "discard" | "cancel") => {
    if (onResolveContextChange) onResolveContextChange(decision);
    else controller.resolveContextChange(decision);
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
        <div>
          {previewSnapshot.status === "idle" || previewSnapshot.status === "error" ? (
            <button
              type="button"
              disabled={previewDisabled}
              onClick={() => {
                void previewController.loadCurrentDocument({
                  document: previewDocument,
                  surfaceId: projection.surfaceId,
                });
              }}
            >
              Preview interactions
            </button>
          ) : (
            <button
              type="button"
              aria-label="Close interactions preview"
              onClick={() => previewController.close()}
            >
              {previewSnapshot.status === "loading" ? "Cancel preview" : "Close preview"}
            </button>
          )}
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
        </div>
      </header>

      {previewSnapshot.status === "loading" ? <p role="status">Preparing preview…</p> : null}
      {previewSnapshot.status === "error" ? (
        <p role="alert">{previewErrorCopy(previewSnapshot.error)}</p>
      ) : null}

      {projectedReport ? (
        <section aria-label="Latest interaction turn">
          <h3>Turn {projectedReport.turnNumber}</h3>
          <p>{projectedReport.eventSummary}</p>
          <p>{projectedReport.endSummary}</p>
          <ul>
            {projectedReport.rules.map((row) => (
              <li key={row.ruleId}>
                <button type="button" onClick={() => focusReportSource(row.source)}>
                  Inspect {row.label} event
                </button>{" "}
                {row.summary}
                {row.predicates.map((predicate) => (
                  <div key={predicate.conditionIndex}>
                    <button type="button" onClick={() => focusReportSource(predicate.source)}>
                      Inspect {row.label} condition {predicate.conditionIndex + 1}
                    </button>{" "}
                    {predicate.summary}
                  </div>
                ))}
              </li>
            ))}
            {projectedReport.commands.map((row) => {
              const ruleIndex = projection.rules.findIndex(({ rule }) => rule.id === row.ruleId);
              return (
                <li key={`${row.ruleId}:${row.commandIndex}`}>
                  <button type="button" onClick={() => focusReportSource(row.source)}>
                    Inspect Rule {ruleIndex + 1} command {row.commandIndex + 1}
                  </button>{" "}
                  {row.summary}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {projection.capabilityState === "empty" ? (
        <p role="status">This Surface has no learner interaction capabilities.</p>
      ) : null}

      <div className="sc-learner-interactions-body">
        <ol className="sc-learner-interactions-list" aria-label="Interaction rules">
          {projection.rules.map((row, index) => {
            const label = `Rule ${index + 1}`;
            const selected = snapshot.status !== "idle" && snapshot.draft.ruleId === row.rule.id;
            const isEnabled = selected ? snapshot.draft.isEnabled : row.rule.isEnabled;
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
                  aria-label={`${isEnabled ? "Disable" : "Enable"} ${label}`}
                  onClick={() => {
                    if (selected) {
                      controller.updateDraft({ ...snapshot.draft, isEnabled: !isEnabled });
                      return;
                    }
                    applyResult(onSetRuleEnabled(row.rule.id, !isEnabled));
                  }}
                >
                  {isEnabled ? "Disable" : "Enable"}
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
            errorCopy={authoringErrorCopy}
          />
        ) : (
          <p className="sc-learner-interactions-editor-empty">Choose a rule to edit.</p>
        )}
      </div>

      {commandError ? <p role="alert">{authoringErrorCopy(commandError)}</p> : null}
      <AppDialog.Root
        open={snapshot.status === "decision-required"}
        onOpenChange={(open) => {
          if (!open) resolveContextChange("cancel");
        }}
      >
        <AppDialog.Content
          role="alertdialog"
          intent="warning"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (decisionOpenerRef.current?.isConnected) decisionOpenerRef.current.focus();
            decisionOpenerRef.current = null;
          }}
          onOpenAutoFocus={(event) => {
            const activeElement = saveDecisionRef.current?.ownerDocument.activeElement;
            event.preventDefault();
            decisionOpenerRef.current = activeElement instanceof HTMLElement ? activeElement : null;
            saveDecisionRef.current?.focus();
          }}
        >
          <AppDialog.Header>
            <AppDialog.Title>Unsaved rule changes</AppDialog.Title>
            <AppDialog.Description>
              Save or discard this draft before changing context.
            </AppDialog.Description>
          </AppDialog.Header>
          {snapshot.status === "decision-required" && snapshot.saveError ? (
            <AppDialog.Body>{authoringErrorCopy(snapshot.saveError)}</AppDialog.Body>
          ) : null}
          <AppDialog.Actions>
            <button
              ref={saveDecisionRef}
              type="button"
              onClick={() => resolveContextChange("save")}
            >
              Save changes
            </button>
            <button type="button" onClick={() => resolveContextChange("discard")}>
              Discard changes
            </button>
            <button type="button" onClick={() => resolveContextChange("cancel")}>
              Cancel change
            </button>
          </AppDialog.Actions>
        </AppDialog.Content>
      </AppDialog.Root>
    </section>
  );

  function focusReportSource(source: {
    readonly ruleId: LearnerInteractionRuleId;
    readonly location: {
      readonly kind: string;
      readonly conditionIndex?: number;
      readonly commandIndex?: number;
    };
  }) {
    const row = projection.rules.find(({ rule }) => rule.id === source.ruleId);
    if (!row) {
      throw new Error(`Learner Interaction report rule "${source.ruleId}" is no longer saved.`);
    }
    requestFocus(row, sourceKey(source.location));
  }
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

function previewErrorCopy(error: LearnerInteractionPreviewLoadError): string {
  switch (error.reason) {
    case "preview-load-superseded":
      return "A newer interactions preview replaced this request.";
    case "preview-not-slideshow":
      return "Interactions preview is available only for Slideshows.";
    case "preview-surface-not-current":
      return "The selected Surface is no longer available.";
    case "preview-surface-not-configured":
      return "This Surface has no saved interaction rules.";
    case "preview-document-invalid":
      return "Repair the document before previewing interactions.";
    case "preview-requires-scaffold-plus":
      return "Interactions preview requires Scaffold Plus.";
    case "preview-unsupported-core-format":
      return "This document format cannot be previewed here.";
    case "preview-unavailable-content":
      return "Some course content is unavailable for preview.";
    case "preview-projection-warning":
      return "Resolve publication warnings before previewing interactions.";
    case "preview-payload-too-large":
      return "This course is too large to preview.";
    case "preview-runtime-unavailable":
      return "The learner preview could not be loaded.";
    case "preview-services-unavailable":
      return "The learner preview services could not be prepared.";
  }
}

export { validateLearnerInteractionRuleDraft };
