import type { ControlStatePredicateV1, LearnerInteractionCommandV1 } from "@scaffold/contracts";
import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from "@phosphor-icons/react";
import { IconButton } from "@/ui/components/IconButton/IconButton";

import type {
  LearnerInteractionAuthoringCommandError,
  LearnerInteractionAuthoringProjection,
  LearnerInteractionRuleDraft,
  ProjectedLearnerInteractionRule,
} from "../model";
import type {
  ControlCommandInputDefinition,
  ControlStateValueTypeDefinition,
  ControlValue,
} from "@/document/control-binding";
import { isControlValueValid } from "@/document/control-binding";
import type { LearnerInteractionCompileDiagnostic } from "@/learner-interaction/model";
import type { LearnerInteractionWorkspaceController } from "./learner-interaction-workspace-controller";
import { validateLearnerInteractionRuleDraft } from "../model";
import { Button } from "@/ui/components/Button/Button";
import { Checkbox } from "@/ui/components/Checkbox/Checkbox";
import { Input } from "@/ui/components/Input/Input";
import { Select } from "@/ui/components/Select/Select";

export interface LearnerInteractionRuleEditorProps {
  readonly controller: LearnerInteractionWorkspaceController;
  readonly draft: LearnerInteractionRuleDraft;
  readonly projection: LearnerInteractionAuthoringProjection;
  readonly projectedRule: ProjectedLearnerInteractionRule | null;
  readonly focusSource: string | null;
  readonly onFocusComplete: () => void;
  readonly errorCopy: (error: LearnerInteractionAuthoringCommandError) => string;
}

export function LearnerInteractionRuleEditor({
  controller,
  draft,
  projection,
  projectedRule,
  focusSource,
  onFocusComplete,
  errorCopy,
}: LearnerInteractionRuleEditorProps) {
  const regionRef = useRef<HTMLElement>(null);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const structuralDiagnostics = validateLearnerInteractionRuleDraft(draft);
  const saveError = controller.getSnapshot().saveError;
  useLayoutEffect(() => {
    if (!focusSource) return;
    if (focusSource.startsWith("condition-") && !conditionsOpen) {
      setConditionsOpen(true);
      return;
    }
    const source = regionRef.current?.querySelector<HTMLElement>(
      `[data-learner-interaction-source="${focusSource}"]`,
    );
    source?.focus();
    source?.scrollIntoView?.({ block: "nearest" });
    onFocusComplete();
  }, [focusSource, onFocusComplete, conditionsOpen]);

  const update = (patch: Partial<LearnerInteractionRuleDraft>) =>
    controller.updateDraft({ ...draft, ...patch });
  const whenDiagnostics = sameValue(draft.when, projectedRule?.when.reference)
    ? (projectedRule?.when.diagnostics ?? [])
    : [];

  return (
    <section ref={regionRef} className="sc-learner-interactions-editor" aria-label="Rule editor">
      <header>
        <h2>
          {draft.ruleId === null
            ? "New rule"
            : `Rule ${projection.rules.findIndex(({ rule }) => rule.id === draft.ruleId) + 1}`}
        </h2>
        {draft.ruleId === null ? (
          <label>
            <Checkbox
              aria-label="Rule enabled"
              checked={draft.isEnabled}
              onCheckedChange={(checked) => update({ isEnabled: checked === true })}
            />
            Enabled
          </label>
        ) : null}
      </header>

      <div className="sc-learner-interactions-reaction">
        <div className="sc-learner-interactions-trigger-group">
          <label className="sc-learner-interactions-when">
            When
            <Select
              aria-label="When"
              triggerProps={{ "data-learner-interaction-source": "when" }}
              value={draft.when ? eventKey(draft.when.targetId, draft.when.type) : ""}
              placeholder="Choose an event"
              onChange={(next) => {
                const option = projection.whenEvents.find(
                  (candidate) => eventKey(candidate.targetId, candidate.type) === next,
                );
                update({
                  when: option ? { targetId: option.targetId, type: option.type } : null,
                });
              }}
              options={[
                ...(projectedRule?.when.option.availability === "unavailable" &&
                sameValue(draft.when, projectedRule.when.reference)
                  ? [
                      {
                        value: eventKey(
                          projectedRule.when.option.targetId,
                          projectedRule.when.option.type,
                        ),
                        label: `Unavailable: ${projectedRule.when.option.targetLabel} — ${projectedRule.when.option.label}`,
                      },
                    ]
                  : []),
                ...projection.whenEvents.map((option) => ({
                  value: eventKey(option.targetId, option.type),
                  label:
                    option.type === "selected"
                      ? `${option.targetLabel} is selected`
                      : `${option.targetLabel} — ${option.label}`,
                })),
              ]}
            />
          </label>
          <SourceDiagnostics diagnostics={whenDiagnostics} />

          <details
            className="sc-learner-interactions-conditions"
            open={conditionsOpen}
            onToggle={(event) => setConditionsOpen(event.currentTarget.open)}
          >
            <summary>
              {draft.conditions.length > 0
                ? `Only if · ${draft.conditions.length} condition${draft.conditions.length === 1 ? "" : "s"}`
                : "Add condition…"}
            </summary>
            <fieldset>
              <legend>All conditions must match</legend>
              {draft.conditions.map((condition, index) => {
                const saved = projectedRule?.conditions[index];
                const option =
                  projection.conditionStates.find(
                    (candidate) =>
                      candidate.targetId === condition.targetId && candidate.key === condition.key,
                  ) ??
                  (sameConditionValue(condition, saved?.predicate) ? saved?.option : undefined);
                const diagnostics = sameConditionValue(condition, saved?.predicate)
                  ? (saved?.diagnostics ?? [])
                  : [];
                return (
                  <fieldset key={index} aria-label={`Condition ${index + 1}`}>
                    <Select
                      aria-label={`Condition ${index + 1} state`}
                      triggerProps={{ "data-learner-interaction-source": `condition-${index}` }}
                      value={stateKey(condition.targetId, condition.key)}
                      onChange={(next) => {
                        const selected = projection.conditionStates.find(
                          (candidate) => stateKey(candidate.targetId, candidate.key) === next,
                        );
                        if (!selected?.valueType) return;
                        replaceCondition(controller, draft, index, {
                          targetId: selected.targetId,
                          key: selected.key,
                          operator: "equals",
                          value: defaultValue(selected.valueType),
                        });
                      }}
                      options={[
                        ...(option?.availability === "unavailable"
                          ? [
                              {
                                value: stateKey(option.targetId, option.key),
                                label: `Unavailable: ${option.targetLabel} — ${option.label}`,
                              },
                            ]
                          : []),
                        ...projection.conditionStates.map((candidate) => ({
                          value: stateKey(candidate.targetId, candidate.key),
                          label: `${candidate.targetLabel} — ${candidate.label}`,
                        })),
                      ]}
                    />
                    <Select
                      aria-label={`Condition ${index + 1} comparison`}
                      value={condition.operator}
                      onChange={(next) =>
                        replaceCondition(controller, draft, index, {
                          ...condition,
                          operator: next as "equals" | "not-equals",
                        })
                      }
                      options={[
                        { value: "equals", label: "equals" },
                        { value: "not-equals", label: "does not equal" },
                      ]}
                    />
                    {option?.valueType ? (
                      <ControlValueField
                        label={`Condition ${index + 1} value`}
                        definition={option.valueType}
                        value={condition.value}
                        onChange={(value) =>
                          replaceCondition(controller, draft, index, { ...condition, value })
                        }
                      />
                    ) : (
                      <output aria-label={`Condition ${index + 1} unavailable value`}>
                        {String(condition.value)}
                      </output>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove condition ${index + 1}`}
                      onClick={() =>
                        update({
                          conditions: draft.conditions.filter(
                            (_, candidate) => candidate !== index,
                          ),
                        })
                      }
                    >
                      Remove
                    </Button>
                    <SourceDiagnostics diagnostics={diagnostics} />
                  </fieldset>
                );
              })}
              <Button
                size="sm"
                variant="ghost"
                disabled={projection.conditionStates.length === 0}
                onClick={() => {
                  const option = projection.conditionStates[0];
                  if (!option?.valueType) return;
                  update({
                    conditions: [
                      ...draft.conditions,
                      {
                        targetId: option.targetId,
                        key: option.key,
                        operator: "equals",
                        value: defaultValue(option.valueType),
                      },
                    ],
                  });
                }}
              >
                Add condition
              </Button>
            </fieldset>
          </details>
        </div>

        <div className="sc-learner-interactions-response-group">
          <fieldset className="sc-learner-interactions-responses">
            <legend>Then</legend>
            {draft.commands.map((command, index) => (
              <CommandRow
                key={index}
                command={command}
                index={index}
                draft={draft}
                projection={projection}
                projectedRule={projectedRule}
                controller={controller}
              />
            ))}
          </fieldset>
          <div className="sc-learner-interactions-add-command">
            <Select
              aria-label="Add response"
              value=""
              placeholder="+ Add response"
              options={[
                {
                  value: "reveal",
                  label: "Reveal content",
                  disabled: projection.revealTargets.length === 0,
                },
                {
                  value: "command",
                  label: "Control a block",
                  disabled: projection.targetCommands.length === 0,
                },
                {
                  value: "navigate",
                  label: "Go to a slide",
                  disabled: projection.navigationSurfaces.length === 0,
                },
              ]}
              onChange={(next) => {
                if (next === "reveal") {
                  const option = projection.revealTargets[0];
                  if (option)
                    update({
                      commands: [
                        ...draft.commands,
                        { kind: "reveal-target", targetId: option.targetId },
                      ],
                    });
                } else if (next === "command") {
                  const option = projection.targetCommands[0];
                  if (option) update({ commands: [...draft.commands, targetCommand(option)] });
                } else if (next === "navigate") {
                  const option = projection.navigationSurfaces[0];
                  if (option)
                    update({
                      commands: [
                        ...draft.commands,
                        { kind: "navigate-surface", surfaceId: option.surfaceId },
                      ],
                    });
                } else {
                  throw new Error(`Unknown interaction response: ${next}`);
                }
              }}
            />
          </div>
        </div>
      </div>

      {saveError ? <p role="alert">{errorCopy(saveError)}</p> : null}
      <div className="sc-learner-interactions-editor-actions">
        <Button
          size="sm"
          variant="primary"
          disabled={structuralDiagnostics.length > 0}
          onClick={() => controller.save()}
        >
          Save rule
        </Button>
        <Button size="sm" variant="ghost" onClick={() => controller.discard()}>
          Discard draft
        </Button>
      </div>
    </section>
  );
}

function CommandRow({
  command,
  index,
  draft,
  projection,
  projectedRule,
  controller,
}: {
  readonly command: LearnerInteractionCommandV1;
  readonly index: number;
  readonly draft: LearnerInteractionRuleDraft;
  readonly projection: LearnerInteractionAuthoringProjection;
  readonly projectedRule: ProjectedLearnerInteractionRule | null;
  readonly controller: LearnerInteractionWorkspaceController;
}) {
  const saved = projectedRule?.commands.find((candidate) => sameValue(command, candidate.command));
  const diagnostics = saved?.diagnostics ?? [];
  const replace = (next: LearnerInteractionCommandV1) =>
    replaceCommand(controller, draft, index, next);
  let field;
  if (command.kind === "reveal-target") {
    const savedOption = saved?.kind === "reveal-target" ? saved.option : undefined;
    field = (
      <Select
        aria-label={`Command ${index + 1} reveal target`}
        triggerProps={{ "data-learner-interaction-source": `command-${index}` }}
        value={command.targetId}
        onChange={(next) =>
          replace({
            kind: "reveal-target",
            targetId: next as typeof command.targetId,
          })
        }
        options={[
          ...(savedOption?.availability === "unavailable"
            ? [
                {
                  value: savedOption.targetId,
                  label: `Unavailable: ${savedOption.label}`,
                },
              ]
            : []),
          ...projection.revealTargets.map((option) => ({
            value: option.targetId,
            label: `Reveal ${option.label}`,
          })),
        ]}
      />
    );
  } else if (command.kind === "navigate-surface") {
    const savedOption = saved?.kind === "navigate-surface" ? saved.option : undefined;
    field = (
      <Select
        aria-label={`Command ${index + 1} navigation target`}
        triggerProps={{ "data-learner-interaction-source": `command-${index}` }}
        value={command.surfaceId}
        onChange={(next) =>
          replace({
            kind: "navigate-surface",
            surfaceId: next as typeof command.surfaceId,
          })
        }
        options={[
          ...(savedOption?.availability === "unavailable"
            ? [
                {
                  value: savedOption.surfaceId,
                  label: `Unavailable: ${savedOption.label}`,
                },
              ]
            : []),
          ...projection.navigationSurfaces.map((option) => ({
            value: option.surfaceId,
            label: `Go to ${option.label}`,
          })),
        ]}
      />
    );
  } else {
    const savedOption = saved?.kind === "target-command" ? saved.option : undefined;
    const option =
      projection.targetCommands.find(
        (candidate) =>
          candidate.targetId === command.command.targetId &&
          candidate.type === command.command.type,
      ) ?? savedOption;
    field = (
      <>
        <Select
          aria-label={`Command ${index + 1} target command`}
          triggerProps={{ "data-learner-interaction-source": `command-${index}` }}
          value={targetCommandKey(command.command.targetId, command.command.type)}
          onChange={(next) => {
            const selected = projection.targetCommands.find(
              (candidate) => targetCommandKey(candidate.targetId, candidate.type) === next,
            );
            if (selected) replace(targetCommand(selected));
          }}
          options={[
            ...(option?.availability === "unavailable"
              ? [
                  {
                    value: targetCommandKey(option.targetId, option.type),
                    label: `Unavailable: ${option.targetLabel} — ${option.label}`,
                  },
                ]
              : []),
            ...projection.targetCommands.map((candidate) => ({
              value: targetCommandKey(candidate.targetId, candidate.type),
              label: `${candidate.label} ${candidate.targetLabel}`,
            })),
          ]}
        />
        {option?.input ? (
          <ControlValueField
            label={`Command ${index + 1} input`}
            definition={option.input}
            value={command.command.input}
            onChange={(input) => replace({ ...command, command: { ...command.command, input } })}
          />
        ) : command.command.input !== undefined ? (
          <output aria-label={`Command ${index + 1} unavailable input`}>
            {String(command.command.input)}
          </output>
        ) : null}
      </>
    );
  }
  return (
    <div
      role="group"
      className="sc-learner-interactions-command"
      aria-label={`Then command ${index + 1}`}
    >
      {field}
      <div className="sc-learner-interactions-command-actions">
        {draft.commands.length > 1 ? (
          <>
            <IconButton
              size="sm"
              aria-label={`Move command ${index + 1} earlier`}
              disabled={index === 0}
              onClick={() => moveCommand(controller, draft, index, -1)}
            >
              <ArrowUpIcon size={14} aria-hidden />
            </IconButton>
            <IconButton
              size="sm"
              aria-label={`Move command ${index + 1} later`}
              disabled={index === draft.commands.length - 1}
              onClick={() => moveCommand(controller, draft, index, 1)}
            >
              <ArrowDownIcon size={14} aria-hidden />
            </IconButton>
          </>
        ) : null}
        <IconButton
          size="sm"
          aria-label={`Remove command ${index + 1}`}
          onClick={() =>
            controller.updateDraft({
              ...draft,
              commands: draft.commands.filter((_, candidate) => candidate !== index),
            })
          }
        >
          <TrashIcon size={14} aria-hidden />
        </IconButton>
      </div>
      <SourceDiagnostics diagnostics={diagnostics} />
    </div>
  );
}

function ControlValueField({
  label,
  definition,
  value,
  onChange,
}: {
  readonly label: string;
  readonly definition: ControlCommandInputDefinition | ControlStateValueTypeDefinition;
  readonly value: ControlValue | undefined;
  readonly onChange: (value: ControlValue) => void;
}) {
  const isValid = isControlValueValid(value, definition);
  const invalidValue = isValid ? null : value === undefined ? "No value" : String(value);
  if (definition.kind === "boolean")
    return (
      <>
        <label>
          {label}
          <Select
            aria-label={label}
            value={isValid ? String(value) : ""}
            placeholder="Choose a replacement"
            onChange={(next) => onChange(next === "true")}
            options={[
              { value: "false", label: "False" },
              { value: "true", label: "True" },
            ]}
          />
        </label>
        {invalidValue === null ? null : (
          <output aria-label={`${controlSourceLabel(label)} invalid saved value`}>
            {invalidValue}
          </output>
        )}
      </>
    );
  if (definition.kind === "enum")
    return (
      <>
        <label>
          {label}
          <Select
            aria-label={label}
            value={isValid ? String(value) : ""}
            placeholder="Choose a replacement"
            onChange={onChange}
            options={definition.options.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
        </label>
        {invalidValue === null ? null : (
          <output aria-label={`${controlSourceLabel(label)} invalid saved value`}>
            {invalidValue}
          </output>
        )}
      </>
    );
  return (
    <>
      <label>
        {label}
        <Input
          aria-label={label}
          type="number"
          min={definition.min}
          {...(definition.kind === "number" ? { max: definition.max } : {})}
          step={definition.step}
          value={typeof value === "number" ? value : ""}
          onChange={(event) => {
            const parsed = Number(event.currentTarget.value);
            if (Number.isFinite(parsed)) onChange(parsed);
          }}
        />
        <span>{definition.unitLabel}</span>
      </label>
      {invalidValue === null ? null : (
        <output aria-label={`${controlSourceLabel(label)} invalid saved value`}>
          {invalidValue}
        </output>
      )}
    </>
  );
}

function sameConditionValue(
  condition: ControlStatePredicateV1,
  saved: ControlStatePredicateV1 | undefined,
): boolean {
  return (
    saved !== undefined &&
    condition.targetId === saved.targetId &&
    condition.key === saved.key &&
    sameValue(condition.value, saved.value)
  );
}

function controlSourceLabel(label: string): string {
  return label.replace(/ (?:input|value)$/, "");
}

function SourceDiagnostics({
  diagnostics,
}: {
  readonly diagnostics: readonly LearnerInteractionCompileDiagnostic[];
}) {
  return diagnostics.map((diagnostic, index) => (
    <p key={`${diagnostic.reason}-${index}`} role="alert">
      {diagnosticCopy(diagnostic)}
    </p>
  ));
}

function diagnosticCopy(diagnostic: LearnerInteractionCompileDiagnostic): string {
  switch (diagnostic.reason) {
    case "target-not-public":
      return "This target is no longer available.";
    case "target-outside-rule-surface":
      return "This target belongs to another Surface.";
    case "event-not-declared":
      return "This event is no longer available.";
    case "state-not-declared":
      return "This state is no longer available.";
    case "state-value-invalid":
      return "Choose a valid state value.";
    case "command-not-declared":
      return "This command is no longer available.";
    case "command-input-invalid":
      return "Choose a valid command value.";
    case "surface-not-found":
      return "This navigation Surface is no longer available.";
    case "navigation-target-is-rule-surface":
      return "Choose a different navigation Surface.";
  }
}

function replaceCondition(
  controller: LearnerInteractionWorkspaceController,
  draft: LearnerInteractionRuleDraft,
  index: number,
  condition: ControlStatePredicateV1,
) {
  controller.updateDraft({
    ...draft,
    conditions: draft.conditions.map((candidate, candidateIndex) =>
      candidateIndex === index ? condition : candidate,
    ),
  });
}
function replaceCommand(
  controller: LearnerInteractionWorkspaceController,
  draft: LearnerInteractionRuleDraft,
  index: number,
  command: LearnerInteractionCommandV1,
) {
  controller.updateDraft({
    ...draft,
    commands: draft.commands.map((candidate, candidateIndex) =>
      candidateIndex === index ? command : candidate,
    ),
  });
}
function moveCommand(
  controller: LearnerInteractionWorkspaceController,
  draft: LearnerInteractionRuleDraft,
  index: number,
  offset: -1 | 1,
) {
  const commands = [...draft.commands];
  const adjacent = commands[index + offset];
  if (!adjacent) return;
  commands[index + offset] = commands[index]!;
  commands[index] = adjacent;
  controller.updateDraft({ ...draft, commands });
}
function targetCommand(
  option: LearnerInteractionAuthoringProjection["targetCommands"][number],
): LearnerInteractionCommandV1 {
  return {
    kind: "target-command",
    command: {
      targetId: option.targetId,
      type: option.type,
      ...(option.input ? { input: defaultValue(option.input) } : {}),
    },
  };
}
function defaultValue(
  definition: ControlCommandInputDefinition | ControlStateValueTypeDefinition,
): ControlValue {
  if (definition.kind === "boolean") return false;
  if (definition.kind === "enum") return definition.options[0].value;
  return definition.min;
}
function eventKey(targetId: string, type: string) {
  return `${targetId}:${type}`;
}
function stateKey(targetId: string, key: string) {
  return `${targetId}:${key}`;
}
function targetCommandKey(targetId: string, type: string) {
  return `${targetId}:${type}`;
}
function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}
