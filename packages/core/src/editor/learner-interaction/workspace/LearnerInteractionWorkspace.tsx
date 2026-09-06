import type { LearnerInteractionRuleId } from "@scaffold/contracts";
import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import {
  type LearnerInteractionAuthoringCommandError,
  type LearnerInteractionAuthoringCommandResult,
  type LearnerInteractionAuthoringProjection,
  type ProjectedLearnerInteractionRule,
} from "../model";
import { projectLearnerInteractionPreviewReport } from "../preview";
import type { AuthorPreviewReports } from "@/editor/shell/authoring/author-preview-session-controller";
import type { LearnerInteractionTurnReport } from "@/learner-interaction/model";
import type {
  LearnerInteractionContextChange,
  LearnerInteractionWorkspaceController,
} from "./learner-interaction-workspace-controller";
import { LearnerInteractionRuleEditor } from "./LearnerInteractionRuleEditor";
import {
  ArrowDownIcon as ArrowDown,
  ArrowUpIcon as ArrowUp,
  CheckCircleIcon as CheckCircle,
  CircleIcon as Circle,
  CursorClickIcon as CursorClick,
  TrashIcon as Trash,
} from "@phosphor-icons/react";
import { AppDialog } from "@/ui/components/app/AppDialog/AppDialog";
import { Button } from "@/ui/components/Button/Button";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import { Checkbox } from "@/ui/components/Checkbox/Checkbox";
import { BottomPanelSlotsContext } from "@/editor/shell/chrome/EditorBottomPanel";
import { iconXs } from "@/ui/tokens/icon-sizes";
import "./LearnerInteractionWorkspace.css";

export interface LearnerInteractionWorkspaceProps {
  readonly controller: LearnerInteractionWorkspaceController;
  readonly projection: LearnerInteractionAuthoringProjection;
  readonly previewReports: AuthorPreviewReports;
  readonly previewActive?: boolean;
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
  previewReports,
  previewActive = false,
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
  const [latestReport, setLatestReport] = useState<LearnerInteractionTurnReport | null>(null);
  const [commandError, setCommandError] = useState<LearnerInteractionAuthoringCommandError | null>(
    null,
  );
  const [focusSource, setFocusSource] = useState<string | null>(null);
  const [reportExpanded, setReportExpanded] = useState(false);
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
  useEffect(
    () => previewReports.subscribeReports((report) => setLatestReport(report)),
    [previewReports],
  );
  useEffect(() => {
    if (!previewActive) setLatestReport(null);
  }, [previewActive]);

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

  const slots = useContext(BottomPanelSlotsContext);
  const headerActions = (
    <Button
      size="sm"
      variant="secondary"
      disabled={projection.capabilityState === "empty"}
      onClick={() =>
        controller.requestContextChange({ kind: "rule", ruleId: null }, () =>
          controller.startNewRule(),
        )
      }
    >
      Add rule
    </Button>
  );

  return (
    <section className="sc-learner-interactions" aria-label="Interactions">
      {slots ? (
        slots.headerActions ? (
          createPortal(headerActions, slots.headerActions)
        ) : null
      ) : (
        <header className="sc-learner-interactions-header">
          <div>{headerActions}</div>
        </header>
      )}

      {projectedReport ? (
        <section className="sc-learner-interactions-report" aria-label="Latest interaction turn">
          <details
            open={reportExpanded}
            onToggle={(event) => setReportExpanded(event.currentTarget.open)}
          >
            <summary>
              Turn {projectedReport.turnNumber} · {projectedReport.endSummary}
            </summary>
            <p>{projectedReport.eventSummary}</p>
            <p>{projectedReport.endSummary}</p>
          </details>
        </section>
      ) : null}

      {projection.capabilityState === "empty" ? (
        <div role="status" className="sc-learner-interactions-empty">
          <CursorClick aria-hidden />
          <p>This slide has nothing a learner can interact with yet.</p>
          <p>Add a Tabs, Accordion, media or assessment block, then come back to write rules.</p>
        </div>
      ) : null}

      <div className="sc-learner-interactions-body">
        {projection.capabilityState === "empty" ? null : (
          <ol className="sc-learner-interactions-list" aria-label="Interaction rules">
            {projection.rules.map((row, index) => {
              const label = `Rule ${index + 1}`;
              const selected = snapshot.status !== "idle" && snapshot.draft.ruleId === row.rule.id;
              const isEnabled = selected ? snapshot.draft.isEnabled : row.rule.isEnabled;
              const firstDiagnostic = row.diagnostics[0];
              return (
                <li
                  key={row.rule.id}
                  data-selected={selected}
                  data-diagnostic={row.diagnostics.length > 0 || undefined}
                >
                  <div className="sc-learner-interactions-rule-heading">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="sc-learner-interactions-row-edit"
                      aria-pressed={selected}
                      aria-label={`Edit ${label}`}
                      onClick={() => requestFocus(row)}
                    >
                      <strong>{label}</strong>
                    </Button>
                    {firstDiagnostic ? (
                      <Button
                        variant="danger"
                        size="sm"
                        aria-label={`Repair ${label} (${row.diagnostics.length} issue${row.diagnostics.length === 1 ? "" : "s"})`}
                        onClick={() =>
                          requestFocus(row, sourceKey(firstDiagnostic.source.location))
                        }
                      >
                        {row.diagnostics.length} issue{row.diagnostics.length === 1 ? "" : "s"}
                      </Button>
                    ) : null}
                    {selected ? (
                      <label className="sc-learner-interactions-enabled">
                        <Checkbox
                          aria-label="Rule enabled"
                          checked={isEnabled}
                          onCheckedChange={(checked) =>
                            controller.updateDraft({
                              ...snapshot.draft,
                              isEnabled: checked === true,
                            })
                          }
                        />
                        Enabled
                      </label>
                    ) : (
                      <IconButton
                        size="sm"
                        aria-label={`${isEnabled ? "Disable" : "Enable"} ${label}`}
                        onClick={() => {
                          if (selected) {
                            controller.updateDraft({ ...snapshot.draft, isEnabled: !isEnabled });
                            return;
                          }
                          applyResult(onSetRuleEnabled(row.rule.id, !isEnabled));
                        }}
                      >
                        {isEnabled ? (
                          <CheckCircle size={iconXs} aria-hidden />
                        ) : (
                          <Circle size={iconXs} aria-hidden />
                        )}
                      </IconButton>
                    )}
                    {projection.rules.length > 1 ? (
                      <>
                        <IconButton
                          size="sm"
                          aria-label={`Move ${label} earlier`}
                          disabled={index === 0}
                          onClick={() => applyResult(onReorderRule(row.rule.id, "earlier"))}
                        >
                          <ArrowUp size={iconXs} aria-hidden />
                        </IconButton>
                        <IconButton
                          size="sm"
                          aria-label={`Move ${label} later`}
                          disabled={index === projection.rules.length - 1}
                          onClick={() => applyResult(onReorderRule(row.rule.id, "later"))}
                        >
                          <ArrowDown size={iconXs} aria-hidden />
                        </IconButton>
                      </>
                    ) : null}
                    <IconButton
                      size="sm"
                      className="sc-learner-interactions-row-remove"
                      aria-label={`Remove ${label}`}
                      onClick={() =>
                        controller.requestContextChange({ kind: "rule", ruleId: null }, () =>
                          applyResult(onRemoveRule(row.rule.id)),
                        )
                      }
                    >
                      <Trash size={iconXs} aria-hidden />
                    </IconButton>
                  </div>
                  {selected ? (
                    <LearnerInteractionRuleEditor
                      controller={controller}
                      draft={snapshot.draft}
                      projection={projection}
                      projectedRule={row}
                      focusSource={focusSource}
                      onFocusComplete={() => setFocusSource(null)}
                      errorCopy={authoringErrorCopy}
                    />
                  ) : (
                    <button
                      className="sc-learner-interactions-reaction-summary"
                      aria-label={`Edit ${label} responses`}
                      onClick={() => requestFocus(row)}
                    >
                      <span className="sc-learner-interactions-summary-trigger">
                        <small>When</small>
                        <span>
                          {row.when.option.targetLabel}
                          {row.when.option.type === "selected"
                            ? " is selected"
                            : ` — ${row.when.option.label}`}
                        </span>
                        {row.conditions.length > 0 ? (
                          <small>
                            Only if {row.conditions.length} condition
                            {row.conditions.length === 1 ? "" : "s"} match
                          </small>
                        ) : null}
                      </span>
                      <span className="sc-learner-interactions-summary-response">
                        <small>Then</small>
                        <span>
                          {row.commands.map(commandSummary).join(" → ") || "Add a response"}
                        </span>
                      </span>
                    </button>
                  )}
                  {projectedReport?.rules
                    .filter((report) => report.ruleId === row.rule.id)
                    .map((report) => (
                      <div className="sc-learner-interactions-rule-report" key={report.ruleId}>
                        <span>Last run · {report.summary}</span>
                        {reportExpanded ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setReportExpanded(false);
                                focusReportSource(report.source);
                              }}
                            >
                              Inspect {label} event
                            </Button>
                            {report.predicates.map((predicate) => (
                              <span key={predicate.conditionIndex}>
                                {predicate.summary}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setReportExpanded(false);
                                    focusReportSource(predicate.source);
                                  }}
                                >
                                  Inspect {label} condition {predicate.conditionIndex + 1}
                                </Button>
                              </span>
                            ))}
                          </>
                        ) : null}
                      </div>
                    ))}
                  {reportExpanded
                    ? projectedReport?.commands
                        .filter((report) => report.ruleId === row.rule.id)
                        .map((report) => (
                          <div
                            className="sc-learner-interactions-rule-report"
                            key={report.commandIndex}
                          >
                            <span>{report.summary}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setReportExpanded(false);
                                focusReportSource(report.source);
                              }}
                            >
                              Inspect {label} command {report.commandIndex + 1}
                            </Button>
                          </div>
                        ))
                    : null}
                </li>
              );
            })}
          </ol>
        )}

        {snapshot.status !== "idle" && snapshot.draft.ruleId === null ? (
          <LearnerInteractionRuleEditor
            controller={controller}
            draft={snapshot.draft}
            projection={projection}
            projectedRule={focusedRule}
            focusSource={focusSource}
            onFocusComplete={() => setFocusSource(null)}
            errorCopy={authoringErrorCopy}
          />
        ) : projection.capabilityState === "empty" || projection.rules.length > 0 ? null : (
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
            <Button
              ref={saveDecisionRef}
              variant="primary"
              onClick={() => resolveContextChange("save")}
            >
              Save changes
            </Button>
            <Button variant="secondary" onClick={() => resolveContextChange("discard")}>
              Discard changes
            </Button>
            <Button variant="ghost" onClick={() => resolveContextChange("cancel")}>
              Cancel change
            </Button>
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

function commandSummary(command: ProjectedLearnerInteractionRule["commands"][number]): string {
  switch (command.kind) {
    case "reveal-target":
      return `Reveal ${command.option.label}`;
    case "navigate-surface":
      return `Go to ${command.option.label}`;
    case "target-command":
      return `${command.option.label} ${command.option.targetLabel}`;
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

export { validateLearnerInteractionRuleDraft } from "../model";
