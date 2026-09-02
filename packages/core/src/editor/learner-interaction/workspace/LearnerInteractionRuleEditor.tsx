import type { ControlStatePredicateV1, LearnerInteractionCommandV1 } from "@scaffold/contracts";
import { useEffect, useRef } from "react";

import type {
  LearnerInteractionAuthoringProjection,
  LearnerInteractionRuleDraft,
  ProjectedLearnerInteractionRule,
} from "../model";
import type {
  ControlCommandInputDefinition,
  ControlStateValueTypeDefinition,
  ControlValue,
} from "@/document/control-binding";
import type { LearnerInteractionCompileDiagnostic } from "@/learner-interaction/model";
import type { LearnerInteractionWorkspaceController } from "./learner-interaction-workspace-controller";
import { validateLearnerInteractionRuleDraft } from "../model";

export interface LearnerInteractionRuleEditorProps {
  readonly controller: LearnerInteractionWorkspaceController;
  readonly draft: LearnerInteractionRuleDraft;
  readonly projection: LearnerInteractionAuthoringProjection;
  readonly projectedRule: ProjectedLearnerInteractionRule | null;
  readonly focusSource: string | null;
  readonly onFocusComplete: () => void;
}

export function LearnerInteractionRuleEditor({
  controller,
  draft,
  projection,
  projectedRule,
  focusSource,
  onFocusComplete,
}: LearnerInteractionRuleEditorProps) {
  const regionRef = useRef<HTMLElement>(null);
  const structuralDiagnostics = validateLearnerInteractionRuleDraft(draft);
  useEffect(() => {
    if (!focusSource) return;
    regionRef.current
      ?.querySelector<HTMLElement>(`[data-learner-interaction-source="${focusSource}"]`)
      ?.focus();
    onFocusComplete();
  }, [focusSource, onFocusComplete]);

  const update = (patch: Partial<LearnerInteractionRuleDraft>) =>
    controller.updateDraft({ ...draft, ...patch });
  const whenDiagnostics = sameValue(draft.when, projectedRule?.when.reference)
    ? (projectedRule?.when.diagnostics ?? [])
    : [];

  return (
    <section ref={regionRef} className="sc-learner-interactions-editor" aria-label="Rule editor">
      <header>
        <h3>
          {draft.ruleId === null
            ? "New rule"
            : `Rule ${projection.rules.findIndex(({ rule }) => rule.id === draft.ruleId) + 1}`}
        </h3>
        <label>
          <input
            aria-label="Rule enabled"
            type="checkbox"
            checked={draft.isEnabled}
            onChange={(event) => update({ isEnabled: event.currentTarget.checked })}
          />
          Enabled
        </label>
      </header>

      <label>
        When
        <select
          data-learner-interaction-source="when"
          value={draft.when ? eventKey(draft.when.targetId, draft.when.type) : ""}
          onChange={(event) => {
            const option = projection.whenEvents.find(
              (candidate) =>
                eventKey(candidate.targetId, candidate.type) === event.currentTarget.value,
            );
            update({
              when: option ? { targetId: option.targetId, type: option.type } : null,
            });
          }}
        >
          <option value="">Choose an event</option>
          {projectedRule?.when.option.availability === "unavailable" &&
          sameValue(draft.when, projectedRule.when.reference) ? (
            <option
              value={eventKey(projectedRule.when.option.targetId, projectedRule.when.option.type)}
            >
              Unavailable: {projectedRule.when.option.targetLabel} —{" "}
              {projectedRule.when.option.label}
            </option>
          ) : null}
          {projection.whenEvents.map((option) => (
            <option
              key={eventKey(option.targetId, option.type)}
              value={eventKey(option.targetId, option.type)}
            >
              {option.targetLabel} — {option.label}
            </option>
          ))}
        </select>
      </label>
      <SourceDiagnostics diagnostics={whenDiagnostics} />

      <fieldset>
        <legend>If all</legend>
        {draft.conditions.map((condition, index) => {
          const saved = projectedRule?.conditions[index];
          const option =
            projection.conditionStates.find(
              (candidate) =>
                candidate.targetId === condition.targetId && candidate.key === condition.key,
            ) ?? (sameValue(condition, saved?.predicate) ? saved?.option : undefined);
          const diagnostics = sameValue(condition, saved?.predicate)
            ? (saved?.diagnostics ?? [])
            : [];
          return (
            <fieldset key={index} aria-label={`Condition ${index + 1}`}>
              <select
                aria-label={`Condition ${index + 1} state`}
                data-learner-interaction-source={`condition-${index}`}
                value={stateKey(condition.targetId, condition.key)}
                onChange={(event) => {
                  const selected = projection.conditionStates.find(
                    (candidate) =>
                      stateKey(candidate.targetId, candidate.key) === event.currentTarget.value,
                  );
                  if (!selected?.valueType) return;
                  replaceCondition(controller, draft, index, {
                    targetId: selected.targetId,
                    key: selected.key,
                    operator: "equals",
                    value: defaultValue(selected.valueType),
                  });
                }}
              >
                {option?.availability === "unavailable" ? (
                  <option value={stateKey(option.targetId, option.key)}>
                    Unavailable: {option.targetLabel} — {option.label}
                  </option>
                ) : null}
                {projection.conditionStates.map((candidate) => (
                  <option
                    key={stateKey(candidate.targetId, candidate.key)}
                    value={stateKey(candidate.targetId, candidate.key)}
                  >
                    {candidate.targetLabel} — {candidate.label}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Condition ${index + 1} comparison`}
                value={condition.operator}
                onChange={(event) =>
                  replaceCondition(controller, draft, index, {
                    ...condition,
                    operator: event.currentTarget.value as "equals" | "not-equals",
                  })
                }
              >
                <option value="equals">equals</option>
                <option value="not-equals">does not equal</option>
              </select>
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
              <button
                type="button"
                aria-label={`Remove condition ${index + 1}`}
                onClick={() =>
                  update({
                    conditions: draft.conditions.filter((_, candidate) => candidate !== index),
                  })
                }
              >
                Remove
              </button>
              <SourceDiagnostics diagnostics={diagnostics} />
            </fieldset>
          );
        })}
        <button
          type="button"
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
        </button>
      </fieldset>

      <fieldset>
        <legend>Then in order</legend>
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
        <div className="sc-learner-interactions-add-command">
          <button
            type="button"
            disabled={projection.revealTargets.length === 0}
            onClick={() => {
              const option = projection.revealTargets[0];
              if (option)
                update({
                  commands: [
                    ...draft.commands,
                    { kind: "reveal-target", targetId: option.targetId },
                  ],
                });
            }}
          >
            Add reveal
          </button>
          <button
            type="button"
            disabled={projection.targetCommands.length === 0}
            onClick={() => {
              const option = projection.targetCommands[0];
              if (option) update({ commands: [...draft.commands, targetCommand(option)] });
            }}
          >
            Add target command
          </button>
          <button
            type="button"
            disabled={projection.navigationSurfaces.length === 0}
            onClick={() => {
              const option = projection.navigationSurfaces[0];
              if (option)
                update({
                  commands: [
                    ...draft.commands,
                    { kind: "navigate-surface", surfaceId: option.surfaceId },
                  ],
                });
            }}
          >
            Add navigation
          </button>
        </div>
      </fieldset>

      {structuralDiagnostics.map((diagnostic) => (
        <p key={diagnostic.reason} role="status">
          {diagnostic.reason === "when-required"
            ? "Choose a When event."
            : "Add at least one Then command."}
        </p>
      ))}
      {controller.getSnapshot().saveError ? <p role="alert">The rule could not be saved.</p> : null}
      <div className="sc-learner-interactions-editor-actions">
        <button
          type="button"
          disabled={structuralDiagnostics.length > 0}
          onClick={() => controller.save()}
        >
          Save rule
        </button>
        <button type="button" onClick={() => controller.discard()}>
          Discard draft
        </button>
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
  const saved = projectedRule?.commands[index];
  const diagnostics = sameValue(command, saved?.command) ? (saved?.diagnostics ?? []) : [];
  const replace = (next: LearnerInteractionCommandV1) =>
    replaceCommand(controller, draft, index, next);
  let field;
  if (command.kind === "reveal-target") {
    const savedOption = saved?.kind === "reveal-target" ? saved.option : undefined;
    field = (
      <select
        aria-label={`Command ${index + 1} reveal target`}
        data-learner-interaction-source={`command-${index}`}
        value={command.targetId}
        onChange={(event) =>
          replace({
            kind: "reveal-target",
            targetId: event.currentTarget.value as typeof command.targetId,
          })
        }
      >
        {savedOption?.availability === "unavailable" ? (
          <option value={savedOption.targetId}>Unavailable: {savedOption.label}</option>
        ) : null}
        {projection.revealTargets.map((option) => (
          <option key={option.targetId} value={option.targetId}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (command.kind === "navigate-surface") {
    const savedOption = saved?.kind === "navigate-surface" ? saved.option : undefined;
    field = (
      <select
        aria-label={`Command ${index + 1} navigation target`}
        data-learner-interaction-source={`command-${index}`}
        value={command.surfaceId}
        onChange={(event) =>
          replace({
            kind: "navigate-surface",
            surfaceId: event.currentTarget.value as typeof command.surfaceId,
          })
        }
      >
        {savedOption?.availability === "unavailable" ? (
          <option value={savedOption.surfaceId}>Unavailable: {savedOption.label}</option>
        ) : null}
        {projection.navigationSurfaces.map((option) => (
          <option key={option.surfaceId} value={option.surfaceId}>
            {option.label}
          </option>
        ))}
      </select>
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
        <select
          aria-label={`Command ${index + 1} target command`}
          data-learner-interaction-source={`command-${index}`}
          value={targetCommandKey(command.command.targetId, command.command.type)}
          onChange={(event) => {
            const selected = projection.targetCommands.find(
              (candidate) =>
                targetCommandKey(candidate.targetId, candidate.type) === event.currentTarget.value,
            );
            if (selected) replace(targetCommand(selected));
          }}
        >
          {option?.availability === "unavailable" ? (
            <option value={targetCommandKey(option.targetId, option.type)}>
              Unavailable: {option.targetLabel} — {option.label}
            </option>
          ) : null}
          {projection.targetCommands.map((candidate) => (
            <option
              key={targetCommandKey(candidate.targetId, candidate.type)}
              value={targetCommandKey(candidate.targetId, candidate.type)}
            >
              {candidate.targetLabel} — {candidate.label}
            </option>
          ))}
        </select>
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
    <fieldset aria-label={`Then command ${index + 1}`}>
      <legend>Then {index + 1}</legend>
      {field}
      <button
        type="button"
        aria-label={`Move command ${index + 1} earlier`}
        disabled={index === 0}
        onClick={() => moveCommand(controller, draft, index, -1)}
      >
        Earlier
      </button>
      <button
        type="button"
        aria-label={`Move command ${index + 1} later`}
        disabled={index === draft.commands.length - 1}
        onClick={() => moveCommand(controller, draft, index, 1)}
      >
        Later
      </button>
      <button
        type="button"
        aria-label={`Remove command ${index + 1}`}
        onClick={() =>
          controller.updateDraft({
            ...draft,
            commands: draft.commands.filter((_, candidate) => candidate !== index),
          })
        }
      >
        Remove
      </button>
      <SourceDiagnostics diagnostics={diagnostics} />
    </fieldset>
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
  if (definition.kind === "boolean")
    return (
      <label>
        {label}
        <select
          aria-label={label}
          value={String(value === true)}
          onChange={(event) => onChange(event.currentTarget.value === "true")}
        >
          <option value="false">False</option>
          <option value="true">True</option>
        </select>
      </label>
    );
  if (definition.kind === "enum")
    return (
      <label>
        {label}
        <select
          aria-label={label}
          value={typeof value === "string" ? value : definition.options[0].value}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          {definition.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        min={definition.min}
        {...(definition.kind === "number" ? { max: definition.max } : {})}
        step={definition.step}
        value={typeof value === "number" ? value : definition.min}
        onChange={(event) => {
          const parsed = Number(event.currentTarget.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
      <span>{definition.unitLabel}</span>
    </label>
  );
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
