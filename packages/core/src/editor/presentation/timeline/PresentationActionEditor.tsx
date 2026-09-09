import type {
  PresentationEasingV1,
  PresentationVisualCapabilityId,
  TimelineActionV1,
  VisibilityTransitionV1,
} from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/ui/components/Button/Button";

import {
  createPresentationAction,
  createPresentationActions,
  removePresentationAction,
  reorderPresentationAction,
  setPresentationActionEnabled,
  type NewPresentationTimelineAction,
  type PresentationAuthoringCommandError,
  updatePresentationAction,
} from "@/editor/presentation/model";
import type {
  ControlCapabilitySetDefinition,
  ControlCommandInputDefinition,
  ControlStateValueTypeDefinition,
  ControlValue,
} from "@/document/control-binding";
import { getControlCapabilityCatalogueForEditor } from "@/document/control-binding";
import type { PresentationCompilationDiagnostic } from "@/presentation/model";

import type { PresentationTimelineController } from "./presentation-timeline-controller";
import type { PresentationTimelineProjection } from "./presentation-timeline-projection";

export interface PresentationActionEditorProps {
  readonly editor: Editor;
  readonly controller: PresentationTimelineController;
  readonly projection: PresentationTimelineProjection;
}

export function PresentationActionEditor({
  editor,
  controller,
  projection,
}: PresentationActionEditorProps) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const row = projection.rows.find(({ targetId }) => targetId === snapshot.selectedTargetId);
  if (!row) return null;

  const visualChoices = row.capabilities.visualActionIds;
  const resolvedControl = getControlCapabilityCatalogueForEditor(editor).resolve(row.targetId);
  const control = resolvedControl.isOk() ? resolvedControl.value.capabilities : null;
  const selectedAction = row.actions.find(({ id }) => id === snapshot.selectedActionId) ?? null;
  const defaultChoice = selectedAction
    ? choiceForAction(selectedAction)
    : visualChoices[0]
      ? `animate:${visualChoices[0]}`
      : control?.commands?.[0]
        ? `trigger:${control.commands[0].type}`
        : row.semanticKind === "surface"
          ? "wait:manual"
          : control?.events?.[0]
            ? `wait:event:${control.events[0].type}`
            : control?.states?.[0]
              ? `wait:state:${control.states[0].key}`
              : null;
  if (!defaultChoice) {
    return (
      <div className="sc-presentation-action-editor-empty" role="status">
        No presentation actions are available for {row.label}.
      </div>
    );
  }
  const rowIndex = projection.rows.indexOf(row);
  const replaceTarget = row.capabilities.visualActionIds.includes("hide")
    ? (projection.rows
        .slice(rowIndex + 1)
        .find(
          (candidate) =>
            candidate.parentTargetId === row.parentTargetId &&
            candidate.capabilities.visualActionIds.includes("reveal"),
        ) ?? null)
    : null;

  return (
    <ActionForm
      key={selectedAction ? `${selectedAction.id}:${JSON.stringify(selectedAction)}` : row.targetId}
      editor={editor}
      controller={controller}
      projection={projection}
      targetId={row.targetId}
      targetLabel={row.label}
      visualChoices={visualChoices}
      control={control}
      defaultChoice={defaultChoice}
      allowManualWait={row.semanticKind === "surface"}
      selectedAction={selectedAction}
      replaceTarget={replaceTarget}
    />
  );
}

function ActionForm({
  editor,
  controller,
  projection,
  targetId,
  targetLabel,
  visualChoices,
  control,
  defaultChoice,
  allowManualWait,
  selectedAction,
  replaceTarget,
}: {
  readonly editor: Editor;
  readonly controller: PresentationTimelineController;
  readonly projection: PresentationTimelineProjection;
  readonly targetId: PresentationTimelineProjection["surfaceId"];
  readonly targetLabel: string;
  readonly visualChoices: readonly PresentationVisualCapabilityId[];
  readonly control: ControlCapabilitySetDefinition | null;
  readonly defaultChoice: string;
  readonly allowManualWait: boolean;
  readonly selectedAction: TimelineActionV1 | null;
  readonly replaceTarget: PresentationTimelineProjection["rows"][number] | null;
}) {
  const [error, setError] = useState<PresentationAuthoringCommandError | null>(null);
  const [choice, setChoice] = useState(defaultChoice);
  const [recipe, setRecipe] = useState(
    selectedAction ? recipeForAction(selectedAction) : recipeForChoice(defaultChoice),
  );
  const controlValue = controlValueForAction(selectedAction);
  const selectedCommand = choice.startsWith("trigger:")
    ? control?.commands?.find(({ type }) => type === choice.slice("trigger:".length))
    : null;
  const selectedState = choice.startsWith("wait:state:")
    ? control?.states?.find(({ key }) => key === choice.slice("wait:state:".length))
    : null;
  const orderedActions = orderedProjectionActions(projection);
  const selectedSourceIndex = selectedAction
    ? orderedActions.findIndex(({ id }) => id === selectedAction.id)
    : -1;
  const canMoveEarlier =
    selectedAction !== null &&
    selectedSourceIndex > 0 &&
    orderedActions[selectedSourceIndex - 1]?.atMs === selectedAction.atMs;
  const canMoveLater =
    selectedAction !== null &&
    selectedSourceIndex >= 0 &&
    orderedActions[selectedSourceIndex + 1]?.atMs === selectedAction.atMs;

  function saveAction(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("atMs", String(resolvePlacement(form, projection, selectedAction)));
    const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-intent");
    if (intent === "replace" && replaceTarget) {
      const hide = createAction("animate:hide", targetId, form, null);
      form.set("atMs", String(hide.atMs + durationOfNewAction(hide)));
      const reveal = createAction("animate:reveal", replaceTarget.targetId, form, null);
      const result = createPresentationActions({
        editor,
        surfaceId: projection.surfaceId,
        actions: [hide, reveal],
      });
      if (result.isErr()) setError(result.error);
      else {
        setError(null);
        controller.selectAction(result.value[1]!, replaceTarget.targetId);
      }
      return;
    }
    const action = createAction(choice, targetId, form, selectedAction);
    if (selectedAction) {
      const result = updatePresentationAction({
        editor,
        surfaceId: projection.surfaceId,
        actionId: selectedAction.id,
        action,
      });
      setError(result.isErr() ? result.error : null);
    } else {
      const result = createPresentationAction({ editor, surfaceId: projection.surfaceId, action });
      if (result.isErr()) setError(result.error);
      else {
        setError(null);
        controller.selectAction(result.value, targetId);
      }
    }
  }

  function toggleEnabled(): void {
    if (!selectedAction) return;
    const result = setPresentationActionEnabled({
      editor,
      surfaceId: projection.surfaceId,
      actionId: selectedAction.id,
      isEnabled: !selectedAction.isEnabled,
    });
    setError(result.isErr() ? result.error : null);
  }

  function deleteAction(): void {
    if (!selectedAction) return;
    const result = removePresentationAction({
      editor,
      surfaceId: projection.surfaceId,
      actionId: selectedAction.id,
    });
    if (result.isErr()) setError(result.error);
    else controller.clearActionSelection();
  }

  function reorderAction(direction: "earlier" | "later"): void {
    if (!selectedAction) return;
    const result = reorderPresentationAction({
      editor,
      surfaceId: projection.surfaceId,
      actionId: selectedAction.id,
      direction,
    });
    setError(result.isErr() ? result.error : null);
  }

  return (
    <form
      className="sc-presentation-action-editor"
      aria-label={`${targetLabel} action editor`}
      onSubmit={saveAction}
    >
      <header className="sc-presentation-action-editor-heading">
        <strong>{targetLabel}</strong>
        <span>{selectedAction ? labelForAction(selectedAction) : "New effect"}</span>
      </header>
      <div className="sc-presentation-action-editor-fields">
        {selectedAction ? (
          <strong>{labelForAction(selectedAction)}</strong>
        ) : (
          <label>
            Action
            <select
              name="actionType"
              value={choice}
              onChange={(event) => {
                const nextChoice = event.currentTarget.value;
                setChoice(nextChoice);
                if (nextChoice.startsWith("animate:")) {
                  const nextVisualKind = nextChoice.slice("animate:".length);
                  setRecipe(
                    nextVisualKind === "reveal" || nextVisualKind === "hide"
                      ? "fade"
                      : nextVisualKind,
                  );
                }
              }}
            >
              {visualChoices.length > 0 ? (
                <optgroup label="Animate">
                  {visualChoices.map((kind) => (
                    <option key={kind} value={`animate:${kind}`}>
                      {capitalise(kind)}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {control?.commands?.length ? (
                <optgroup label="Trigger">
                  {control.commands.map((command) => (
                    <option key={command.type} value={`trigger:${command.type}`}>
                      {command.label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {allowManualWait || control?.events?.length || control?.states?.length ? (
                <optgroup label="Wait">
                  {allowManualWait ? <option value="wait:manual">Manual wait</option> : null}
                  {control?.events?.map((event) => (
                    <option key={`event:${event.type}`} value={`wait:event:${event.type}`}>
                      Wait for {event.label}
                    </option>
                  ))}
                  {control?.states?.map((state) => (
                    <option key={`state:${state.key}`} value={`wait:state:${state.key}`}>
                      Wait until {state.label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>
        )}
        {choice.startsWith("animate:") ? (
          <VisualFields
            action={selectedAction}
            visualKind={choice.slice("animate:".length) as PresentationVisualCapabilityId}
            recipe={recipe}
            onRecipeChange={setRecipe}
          />
        ) : null}
        <label>
          Placement
          <select name="placement" defaultValue="exact">
            <option value="exact">Exact</option>
            <option value="with-previous">With previous</option>
            <option value="after-previous">After previous</option>
          </select>
        </label>
        <label>
          Start (ms)
          <input
            name="atMs"
            type="number"
            min={0}
            step={1}
            defaultValue={selectedAction?.atMs ?? 0}
          />
        </label>
        {selectedCommand?.input ? (
          <ControlValueField
            label={selectedCommand.label}
            definition={selectedCommand.input}
            value={controlValue}
          />
        ) : null}
        {selectedState ? (
          <ControlValueField
            label={`Expected ${selectedState.label}`}
            definition={selectedState.valueType}
            value={controlValue}
          />
        ) : null}
      </div>
      <div className="sc-presentation-action-editor-actions">
        <Button size="sm" variant="primary" type="submit">
          {selectedAction ? "Save action" : "Add action"}
        </Button>
        {!selectedAction && replaceTarget ? (
          <Button size="sm" variant="secondary" type="submit" data-intent="replace">
            Replace with {replaceTarget.label}
          </Button>
        ) : null}
        {selectedAction ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => controller.clearActionSelection()}
            >
              Cancel
            </Button>
            <details className="sc-presentation-action-editor-more">
              <summary>More actions</summary>
              <div>
                <Button size="sm" variant="ghost" type="button" onClick={toggleEnabled}>
                  {selectedAction.isEnabled ? "Disable action" : "Enable action"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  disabled={!canMoveEarlier}
                  onClick={() => reorderAction("earlier")}
                >
                  Move earlier
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  disabled={!canMoveLater}
                  onClick={() => reorderAction("later")}
                >
                  Move later
                </Button>
                <Button size="sm" variant="danger" type="button" onClick={deleteAction}>
                  Delete action
                </Button>
              </div>
            </details>
          </>
        ) : null}
      </div>
      {error ? <p role="alert">{presentPresentationAuthoringCommandError(error)}</p> : null}
    </form>
  );
}

function createAction(
  choice: string,
  targetId: PresentationTimelineProjection["surfaceId"],
  form: FormData,
  current: TimelineActionV1 | null,
): NewPresentationTimelineAction {
  const atMs = numberField(form, "atMs");
  if (
    choice === "trigger:navigate-surface" &&
    current?.kind === "trigger" &&
    current.command.kind === "navigate-surface"
  ) {
    return {
      kind: "trigger",
      isEnabled: current.isEnabled,
      atMs,
      command: current.command,
    };
  }
  if (choice === "wait:manual") {
    return {
      kind: "manual-wait",
      isEnabled: current?.isEnabled ?? true,
      atMs,
      boundary: current?.kind === "manual-wait" ? current.boundary : "before-actions",
    };
  }
  if (choice.startsWith("wait:event:")) {
    return {
      kind: "learner-wait",
      isEnabled: current?.isEnabled ?? true,
      atMs,
      boundary: current?.kind === "learner-wait" ? current.boundary : "before-actions",
      requirement: { kind: "event", targetId, type: choice.slice("wait:event:".length) },
    };
  }
  if (choice.startsWith("wait:state:")) {
    return {
      kind: "learner-wait",
      isEnabled: current?.isEnabled ?? true,
      atMs,
      boundary: current?.kind === "learner-wait" ? current.boundary : "before-actions",
      requirement: {
        kind: "state",
        targetId,
        key: choice.slice("wait:state:".length),
        equals: readControlValue(form),
      },
    };
  }
  if (choice.startsWith("trigger:")) {
    const hasInput = form.has("controlValueKind");
    return {
      kind: "trigger",
      isEnabled: current?.isEnabled ?? true,
      atMs,
      command: {
        kind: "target-command",
        targetId,
        type: choice.slice("trigger:".length),
        ...(hasInput ? { input: readControlValue(form) } : {}),
      },
    };
  }
  const visualKind = choice.slice("animate:".length) as PresentationVisualCapabilityId;
  if (visualKind === "emphasize") {
    return {
      kind: "animate",
      targetId,
      isEnabled: current?.isEnabled ?? true,
      atMs,
      visual: {
        kind: "emphasize",
        durationMs: numberField(form, "durationMs"),
        easing: readEasing(form),
        effect: stringField(form, "effect", "outline") as "outline" | "pulse",
      },
    };
  }
  return {
    kind: "animate",
    targetId,
    isEnabled: current?.isEnabled ?? true,
    atMs,
    visual: {
      kind: visualKind,
      transition: visibilityTransition(form),
    },
  };
}

function VisualFields({
  action,
  visualKind,
  recipe,
  onRecipeChange,
}: {
  readonly action: TimelineActionV1 | null;
  readonly visualKind: PresentationVisualCapabilityId;
  readonly recipe: string;
  readonly onRecipeChange: (recipe: string) => void;
}) {
  const visual = action?.kind === "animate" ? action.visual : null;
  const durationMs = visual
    ? visual.kind === "reveal" || visual.kind === "hide"
      ? visual.transition.kind === "instant"
        ? 500
        : visual.transition.durationMs
      : visual.durationMs
    : 500;
  const easing =
    visual && "easing" in visual
      ? visual.easing
      : visual &&
          (visual.kind === "reveal" || visual.kind === "hide") &&
          "easing" in visual.transition
        ? visual.transition.easing
        : null;
  const direction =
    visual &&
    (visual.kind === "reveal" || visual.kind === "hide") &&
    "direction" in visual.transition
      ? visual.transition.direction
      : "right";
  const [easingChoice, setEasingChoice] = useState(
    easing?.kind === "cubic-bezier" ? "cubic-bezier" : (easing?.preset ?? "ease-out"),
  );

  return (
    <>
      {visualKind === "emphasize" ? (
        <label>
          Effect
          <select
            name="effect"
            defaultValue={visual?.kind === "emphasize" ? visual.effect : "outline"}
          >
            <option value="outline">Outline</option>
            <option value="pulse">Pulse</option>
          </select>
        </label>
      ) : visualKind === "reveal" || visualKind === "hide" ? (
        <label>
          Recipe
          <select
            name="recipe"
            value={recipe}
            onChange={(event) => onRecipeChange(event.currentTarget.value)}
          >
            <option value="instant">Instant</option>
            <option value="fade">Fade</option>
            <option value="slide">Slide</option>
            <option value="float">Float</option>
            <option value="scale">Scale</option>
            <option value="wipe">Wipe</option>
          </select>
        </label>
      ) : null}
      {visualKind === "emphasize" || recipe !== "instant" ? (
        <>
          <label>
            Duration (ms)
            <input name="durationMs" type="number" min={1} step={1} defaultValue={durationMs} />
          </label>
          <label>
            Easing
            <select
              name="easing"
              value={easingChoice}
              onChange={(event) => setEasingChoice(event.currentTarget.value)}
            >
              <option value="linear">Linear</option>
              <option value="ease-in">Ease in</option>
              <option value="ease-out">Ease out</option>
              <option value="ease-in-out">Ease in and out</option>
              <option value="cubic-bezier">Custom curve</option>
            </select>
          </label>
          {easingChoice === "cubic-bezier" ? (
            <details className="sc-presentation-action-editor-advanced" open>
              <summary>Curve details</summary>
              <label>
                X1
                <input
                  name="easingX1"
                  type="number"
                  min={0}
                  max={1}
                  step="any"
                  defaultValue={easing?.kind === "cubic-bezier" ? easing.x1 : 0.25}
                />
              </label>
              <label>
                Y1
                <input
                  name="easingY1"
                  type="number"
                  min={-10}
                  max={10}
                  step="any"
                  defaultValue={easing?.kind === "cubic-bezier" ? easing.y1 : 0.1}
                />
              </label>
              <label>
                X2
                <input
                  name="easingX2"
                  type="number"
                  min={0}
                  max={1}
                  step="any"
                  defaultValue={easing?.kind === "cubic-bezier" ? easing.x2 : 0.25}
                />
              </label>
              <label>
                Y2
                <input
                  name="easingY2"
                  type="number"
                  min={-10}
                  max={10}
                  step="any"
                  defaultValue={easing?.kind === "cubic-bezier" ? easing.y2 : 1}
                />
              </label>
            </details>
          ) : null}
        </>
      ) : null}
      {(visualKind === "reveal" || visualKind === "hide") &&
      (recipe === "slide" || recipe === "float" || recipe === "wipe") ? (
        <label>
          Direction
          <select name="direction" defaultValue={direction}>
            <option value="up">Up</option>
            <option value="right">Right</option>
            <option value="down">Down</option>
            <option value="left">Left</option>
          </select>
        </label>
      ) : null}
    </>
  );
}

function ControlValueField({
  label,
  definition,
  value,
}: {
  readonly label: string;
  readonly definition: ControlCommandInputDefinition | ControlStateValueTypeDefinition;
  readonly value: ControlValue | undefined;
}) {
  if (definition.kind === "boolean") {
    return (
      <label>
        <input type="hidden" name="controlValueKind" value="boolean" />
        <input name="controlValue" type="checkbox" value="true" defaultChecked={value === true} />
        {label}
      </label>
    );
  }
  if (definition.kind === "enum") {
    return (
      <label>
        {label}
        <input type="hidden" name="controlValueKind" value="string" />
        <select name="controlValue" defaultValue={typeof value === "string" ? value : undefined}>
          {definition.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label>
      {label}
      <input type="hidden" name="controlValueKind" value="number" />
      <input
        name="controlValue"
        type="number"
        min={definition.min}
        {...(definition.kind === "number" ? { max: definition.max } : {})}
        step={definition.step}
        defaultValue={typeof value === "number" ? value : definition.min}
      />
      <span>{definition.unitLabel}</span>
    </label>
  );
}

function capitalise(value: string): string {
  return `${value[0]?.toUpperCase()}${value.slice(1)}`;
}

function choiceForAction(action: TimelineActionV1): string {
  if (action.kind === "animate") return `animate:${action.visual.kind}`;
  if (action.kind === "trigger") {
    return action.command.kind === "target-command"
      ? `trigger:${action.command.type}`
      : "trigger:navigate-surface";
  }
  if (action.kind === "manual-wait") return "wait:manual";
  return action.requirement.kind === "event"
    ? `wait:event:${action.requirement.type}`
    : `wait:state:${action.requirement.key}`;
}

function controlValueForAction(action: TimelineActionV1 | null): ControlValue | undefined {
  if (action?.kind === "trigger" && action.command.kind === "target-command") {
    return action.command.input;
  }
  if (action?.kind === "learner-wait" && action.requirement.kind === "state") {
    return action.requirement.equals;
  }
  return undefined;
}

function recipeForAction(action: TimelineActionV1 | null): string {
  if (!action || action.kind !== "animate") return "fade";
  if (action.visual.kind === "reveal" || action.visual.kind === "hide") {
    return action.visual.transition.kind;
  }
  return action.visual.kind;
}

function recipeForChoice(choice: string): string {
  const visualKind = choice.slice("animate:".length);
  return visualKind === "reveal" || visualKind === "hide" ? "fade" : visualKind;
}

function labelForAction(action: TimelineActionV1): string {
  if (action.kind === "animate") return capitalise(action.visual.kind);
  if (action.kind === "trigger") return "Trigger";
  return action.kind === "manual-wait" ? "Manual wait" : "Learner wait";
}

function visibilityTransition(form: FormData): VisibilityTransitionV1 {
  const recipe = stringField(form, "recipe", "fade");
  if (recipe === "instant") return { kind: "instant" as const };
  const timed = {
    durationMs: numberField(form, "durationMs"),
    easing: readEasing(form),
  };
  if (recipe === "slide" || recipe === "float" || recipe === "wipe") {
    return {
      ...timed,
      kind: recipe,
      direction: stringField(form, "direction", "right") as "up" | "right" | "down" | "left",
    };
  }
  return { ...timed, kind: recipe as "fade" | "scale" };
}

function readEasing(form: FormData): PresentationEasingV1 {
  const easing = stringField(form, "easing", "ease-out");
  if (easing === "cubic-bezier") {
    return {
      kind: "cubic-bezier",
      x1: numberField(form, "easingX1"),
      y1: numberField(form, "easingY1"),
      x2: numberField(form, "easingX2"),
      y2: numberField(form, "easingY2"),
    };
  }
  return {
    kind: "preset" as const,
    preset: easing as "linear" | "ease-in" | "ease-out" | "ease-in-out",
  };
}

function numberField(form: FormData, name: string): number {
  return Number(form.get(name));
}

function stringField(form: FormData, name: string, fallback = ""): string {
  const value = form.get(name);
  return typeof value === "string" ? value : fallback;
}

function readControlValue(form: FormData): ControlValue {
  const kind = stringField(form, "controlValueKind");
  if (kind === "boolean") return form.get("controlValue") === "true";
  const value = stringField(form, "controlValue");
  return kind === "number" ? Number(value) : value;
}

function resolvePlacement(
  form: FormData,
  projection: PresentationTimelineProjection,
  current: TimelineActionV1 | null,
): number {
  const exact = numberField(form, "atMs");
  const placement = stringField(form, "placement");
  if (placement === "exact") return exact;
  const orderedActions = orderedProjectionActions(projection);
  const currentIndex = current
    ? projection.orderedActionIds.findIndex((actionId) => actionId === current.id)
    : orderedActions.length;
  if (current && currentIndex < 0) {
    throw new Error(`Presentation Timeline action "${current.id}" has no source order.`);
  }
  const previous = orderedActions[currentIndex - 1];
  if (!previous) return exact;
  return placement === "after-previous"
    ? previous.atMs + durationOfAction(previous)
    : previous.atMs;
}

function orderedProjectionActions(
  projection: PresentationTimelineProjection,
): readonly TimelineActionV1[] {
  const actionById = new Map(
    projection.rows.flatMap(({ actions }) => actions).map((action) => [action.id, action]),
  );
  return projection.orderedActionIds.map((actionId) => {
    const action = actionById.get(actionId);
    if (!action) throw new Error(`Presentation Timeline ordered action "${actionId}" is missing.`);
    return action;
  });
}

function durationOfAction(action: TimelineActionV1): number {
  if (action.kind !== "animate") return 0;
  if (action.visual.kind === "reveal" || action.visual.kind === "hide") {
    return action.visual.transition.kind === "instant" ? 0 : action.visual.transition.durationMs;
  }
  return action.visual.durationMs;
}

function durationOfNewAction(action: NewPresentationTimelineAction): number {
  if (action.kind !== "animate") return 0;
  if (action.visual.kind === "reveal" || action.visual.kind === "hide") {
    return action.visual.transition.kind === "instant" ? 0 : action.visual.transition.durationMs;
  }
  return action.visual.durationMs;
}

export function presentPresentationAuthoringCommandError(
  error: PresentationAuthoringCommandError,
): string {
  switch (error.reason) {
    case "editor-read-only":
      return "This document is read-only.";
    case "editor-destroyed":
      return "The editor is no longer available.";
    case "surface-not-current":
      return "This Surface is no longer in the document.";
    case "invalid-surface-duration":
      return "The Surface duration must be a non-negative whole number.";
    case "surface-duration-before-action-end":
      return `The Surface must remain at least ${error.requiredDurationMs} ms long for its actions.`;
    case "surface-duration-before-layer-switch":
      return `The Surface must remain longer than ${error.switchAtMs} ms for its Layer switches.`;
    case "invalid-surface-narration":
    case "invalid-surface-transition":
    case "invalid-new-action":
    case "invalid-action-update":
      return error.issues[0]?.message ?? "The action settings are invalid.";
    case "action-outside-surface-duration":
      return `This action must end by ${error.surfaceDurationMs} ms.`;
    case "wait-time-occupied":
      return `Another Wait already uses ${error.atMs} ms.`;
    case "action-not-current":
      return "This action is no longer in the current Surface.";
    case "action-belongs-to-another-surface":
      return "This action now belongs to another Surface.";
    case "action-reorder-boundary":
      return `This action has no equal-time action ${error.direction === "earlier" ? "before" : "after"} it.`;
    case "surface-coverage-stale":
      return "The Presentation Surface list is out of date.";
    case "action-compilation-invalid":
      return error.diagnostics[0]
        ? presentPresentationCompilationDiagnostic(error.diagnostics[0])
        : "This action conflicts with the current document or Presentation configuration.";
  }
}

function presentPresentationCompilationDiagnostic(
  diagnostic: PresentationCompilationDiagnostic,
): string {
  switch (diagnostic.reason) {
    case "navigation-destination-not-current":
      return "The destination Surface is no longer in the document.";
    case "referenced-target-missing":
      return "The action target is no longer in the document.";
    case "target-moved-surface":
      return "The action target moved to another Surface.";
    case "visual-capability-unavailable":
      return `This target no longer supports ${capitalise(diagnostic.capability)}.`;
    case "same-target-timed-overlap":
      return "This timed action overlaps another action on the same target.";
    case "trigger-command-unavailable":
      return "This target no longer supports the configured command.";
    case "trigger-command-input-invalid":
      return "The configured command input is no longer valid.";
    case "unavailable-required-capability":
      return "This target no longer supports the configured Wait requirement.";
    case "required-state-value-invalid":
      return "The configured Wait state value is no longer valid.";
    case "required-event-layer-unavailable":
      return "The configured Wait requires a Layer that is not active at that boundary.";
    case "owner-track-missing":
      return "Choose an initial Layer for this owner.";
    case "owner-track-duplicated":
      return "This owner has more than one Layer track.";
    case "track-owner-not-current":
    case "track-owner-not-layer-owner":
    case "track-owner-moved-surface":
      return "This Layer track no longer belongs to the current Surface.";
    case "initial-layer-not-owned":
      return "The initial Layer no longer belongs to this owner.";
    case "switch-layer-not-owned":
      return "A switched Layer no longer belongs to this owner.";
    case "conflicting-switches":
      return "More than one Layer switch is scheduled at the same time.";
    case "redundant-layer-switch":
      return "This Layer switch selects the Layer that is already active.";
    case "layer-switch-outside-surface":
      return "This Layer switch falls outside the Surface duration.";
  }
}
