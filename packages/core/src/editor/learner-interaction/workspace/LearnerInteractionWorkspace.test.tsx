// @vitest-environment happy-dom

import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  type LearnerInteractionRuleId,
  type LearnerInteractionRuleV1,
} from "@scaffold/contracts";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Result } from "better-result";
import { describe, expect, it, vi } from "vite-plus/test";

import type {
  LearnerInteractionAuthoringCommandError,
  LearnerInteractionAuthoringCommandResult,
  LearnerInteractionAuthoringProjection,
  LearnerInteractionRuleDraft,
  ProjectedLearnerInteractionRule,
} from "../model";
import { LearnerInteractionWorkspaceController } from "./learner-interaction-workspace-controller";
import { LearnerInteractionWorkspace } from "./LearnerInteractionWorkspace";

const IDS = Object.freeze({
  surface: EmbeddedNodeIdSchema.parse("surface00001"),
  otherSurface: EmbeddedNodeIdSchema.parse("surface00002"),
  source: EmbeddedNodeIdSchema.parse("source000001"),
  target: EmbeddedNodeIdSchema.parse("target000001"),
  stale: EmbeddedNodeIdSchema.parse("stale0000001"),
  firstRule: EmbeddedDataIdSchema.parse("rule00000001"),
  secondRule: EmbeddedDataIdSchema.parse("rule00000002"),
});

const DIRECT_SAVE_ERRORS: readonly {
  readonly error: LearnerInteractionAuthoringCommandError;
  readonly copy: string;
}[] = [
  { error: { reason: "editor-read-only" }, copy: "This document is read-only." },
  {
    error: {
      reason: "surface-not-current",
      surfaceId: IDS.surface,
      currentSurfaceIds: Object.freeze([IDS.otherSurface]),
    },
    copy: "The selected Surface is no longer available.",
  },
  {
    error: { reason: "rule-not-current", surfaceId: IDS.surface, ruleId: IDS.firstRule },
    copy: "This rule is no longer available on the selected Surface.",
  },
  {
    error: { reason: "invalid-rule-draft", diagnostics: Object.freeze([]) },
    copy: "Choose a When event and add at least one Then command.",
  },
  {
    error: {
      reason: "rule-unresolved",
      surfaceId: IDS.surface,
      ruleId: IDS.firstRule,
      diagnostics: Object.freeze([]),
    },
    copy: "Repair every unavailable rule source before saving.",
  },
];

describe("LearnerInteractionWorkspace", () => {
  it("edits the complete bounded When, If and ordered Then grammar in one transient draft", async () => {
    const user = userEvent.setup();
    const harness = renderWorkspace(projection());

    await user.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getByRole("button", { name: "Save rule" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("When"), `${IDS.source}:activated`);
    await user.click(screen.getByRole("button", { name: "Add condition" }));
    await user.selectOptions(screen.getByLabelText("Condition 1 value"), "true");
    await user.click(screen.getByRole("button", { name: "Add reveal" }));
    await user.click(screen.getByRole("button", { name: "Add target command" }));
    await user.click(screen.getByRole("button", { name: "Add navigation" }));

    const editor = screen.getByRole("region", { name: "Rule editor" });
    expect(within(editor).getAllByRole("group", { name: /Then command/ })).toHaveLength(3);
    expect(screen.getByLabelText("Command 2 input")).toHaveAttribute("min", "0");
    expect(screen.getByLabelText("Command 2 input")).toHaveAttribute("step", "0.5");
    expect(screen.getByText("seconds")).toBeInTheDocument();
    expect(screen.getByLabelText("Command 2 input")).not.toHaveAttribute("max");

    await user.click(screen.getByRole("button", { name: "Move command 3 earlier" }));
    await user.click(screen.getByRole("button", { name: "Remove command 2" }));
    const snapshot = harness.controller.getSnapshot();
    expect(snapshot.status).toBe("focused-dirty");
    if (snapshot.status === "idle") return;
    expect(snapshot.draft).toEqual({
      ruleId: null,
      isEnabled: true,
      when: { targetId: IDS.source, type: "activated" },
      conditions: [
        {
          targetId: IDS.source,
          key: "expanded",
          operator: "equals",
          value: true,
        },
      ],
      commands: [
        { kind: "reveal-target", targetId: IDS.surface },
        { kind: "target-command", command: { targetId: IDS.target, type: "seek", input: 0 } },
      ],
    });
    expect(screen.getByRole("button", { name: "Save rule" })).toBeEnabled();
    expect(harness.saveDraft).not.toHaveBeenCalled();
  });

  it("routes saved-rule controls through checked callbacks and translates typed failures", async () => {
    const user = userEvent.setup();
    const error: LearnerInteractionAuthoringCommandError = Object.freeze({
      reason: "editor-read-only",
    });
    const harness = renderWorkspace(projection(), {
      setEnabledResult: Result.err(error),
    });

    await user.click(screen.getByRole("button", { name: "Disable Rule 1" }));
    expect(harness.onSetRuleEnabled).toHaveBeenCalledWith(IDS.firstRule, false);
    expect(screen.getByRole("alert")).toHaveTextContent("This document is read-only.");

    await user.click(screen.getByRole("button", { name: "Move Rule 2 earlier" }));
    expect(harness.onReorderRule).toHaveBeenCalledWith(IDS.secondRule, "earlier");
    await user.click(screen.getByRole("button", { name: "Remove Rule 2" }));
    expect(harness.onRemoveRule).toHaveBeenCalledWith(IDS.secondRule);
  });

  it("writes a focused clean rule enable toggle to its draft before Save", async () => {
    const user = userEvent.setup();
    const harness = renderWorkspace(projection());

    await user.click(screen.getByRole("button", { name: "Edit Rule 1" }));
    await user.click(screen.getByRole("button", { name: "Disable Rule 1" }));

    expect(harness.onSetRuleEnabled).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Rule enabled")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Enable Rule 1" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save rule" }));
    expect(harness.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: IDS.firstRule, isEnabled: false }),
    );
  });

  it("discards a focused dirty rule enable toggle without persisting a saved-row value", async () => {
    const user = userEvent.setup();
    const harness = renderWorkspace(projection());

    await user.click(screen.getByRole("button", { name: "Edit Rule 1" }));
    await user.click(screen.getByLabelText("Rule enabled"));
    await user.click(screen.getByRole("button", { name: "Enable Rule 1" }));
    await user.click(screen.getByRole("button", { name: "Disable Rule 1" }));
    await user.click(screen.getByRole("button", { name: "Discard draft" }));

    expect(harness.onSetRuleEnabled).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Rule enabled")).toBeChecked();
    expect(screen.getByRole("button", { name: "Disable Rule 1" })).toBeInTheDocument();
  });

  it("keeps stale sources visible and focuses exact inline repair from a rule badge", async () => {
    const user = userEvent.setup();
    renderWorkspace(projection({ stale: true }));

    await user.click(screen.getByRole("button", { name: "Repair Rule 1 (1 issue)" }));
    const when = screen.getByLabelText("When");
    expect(when).toHaveFocus();
    expect(within(when).getByRole("option", { name: /Unavailable.*stale-event/ })).toBeTruthy();
    expect(screen.getByText("This event is no longer available.")).toBeInTheDocument();

    await user.selectOptions(when, `${IDS.source}:activated`);
    expect(screen.queryByText("This event is no longer available.")).not.toBeInTheDocument();
  });

  it("keeps unavailable If and Then values readable until their exact sources are repaired", async () => {
    const user = userEvent.setup();
    renderWorkspace(projectionWithUnavailableValues());

    await user.click(screen.getByRole("button", { name: "Edit Rule 1" }));
    expect(screen.getByLabelText("Condition 1 unavailable value")).toHaveTextContent("legacy");
    expect(screen.getByLabelText("Command 1 unavailable input")).toHaveTextContent("7");
    expect(screen.getByText("This state is no longer available.")).toBeInTheDocument();
    expect(screen.getByText("This command is no longer available.")).toBeInTheDocument();
  });

  it("retains invalid boolean, enum and number state values through unrelated edits until repair", async () => {
    const user = userEvent.setup();
    renderWorkspace(projectionWithValueDrift());

    await user.click(screen.getByRole("button", { name: "Edit Rule 1" }));
    expect(screen.getByLabelText("Condition 1 invalid saved value")).toHaveTextContent(
      "legacy-boolean",
    );
    expect(screen.getByLabelText("Condition 2 invalid saved value")).toHaveTextContent("retired");
    expect(screen.getByLabelText("Condition 3 invalid saved value")).toHaveTextContent(
      "legacy-number",
    );
    expect(screen.getAllByText("Choose a valid state value.")).toHaveLength(3);

    await user.selectOptions(screen.getByLabelText("Condition 1 comparison"), "not-equals");
    expect(screen.getAllByText("Choose a valid state value.")).toHaveLength(3);

    await user.selectOptions(screen.getByLabelText("Condition 1 value"), "true");
    await user.selectOptions(screen.getByLabelText("Condition 2 value"), "active");
    await user.type(screen.getByLabelText("Condition 3 value"), "4");
    expect(screen.queryByText("Choose a valid state value.")).not.toBeInTheDocument();
  });

  it("keeps invalid command inputs with their rows through reordering until exact repair", async () => {
    const user = userEvent.setup();
    renderWorkspace(projectionWithValueDrift());

    await user.click(screen.getByRole("button", { name: "Edit Rule 1" }));
    expect(screen.getByLabelText("Command 1 invalid saved value")).toHaveTextContent(
      "legacy-command-boolean",
    );
    expect(screen.getByLabelText("Command 2 invalid saved value")).toHaveTextContent(
      "retired-command",
    );
    expect(screen.getByLabelText("Command 3 invalid saved value")).toHaveTextContent(
      "legacy-command-number",
    );
    expect(screen.getAllByText("Choose a valid command value.")).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "Move command 3 earlier" }));
    expect(screen.getAllByText("Choose a valid command value.")).toHaveLength(3);
    expect(screen.getByLabelText("Command 2 invalid saved value")).toHaveTextContent(
      "legacy-command-number",
    );

    await user.selectOptions(screen.getByLabelText("Command 1 input"), "true");
    await user.type(screen.getByLabelText("Command 2 input"), "4");
    await user.selectOptions(screen.getByLabelText("Command 3 input"), "active");
    expect(screen.queryByText("Choose a valid command value.")).not.toBeInTheDocument();
  });

  it.each(DIRECT_SAVE_ERRORS)(
    "presents the retained $error.reason error from direct Save",
    async ({ error, copy }) => {
      const user = userEvent.setup();
      renderWorkspace(projection(), { saveResult: Result.err(error) });

      await user.click(screen.getByRole("button", { name: "Edit Rule 1" }));
      await user.click(screen.getByRole("button", { name: "Save rule" }));

      expect(screen.getByRole("alert")).toHaveTextContent(copy);
    },
  );

  it("uses the controller dialog for guarded focus changes and preserves failed Save facts", async () => {
    const user = userEvent.setup();
    const error: LearnerInteractionAuthoringCommandError = Object.freeze({
      reason: "rule-unresolved",
      surfaceId: IDS.surface,
      ruleId: IDS.firstRule,
      diagnostics: Object.freeze([]),
    });
    const harness = renderWorkspace(projection(), { saveResult: Result.err(error) });

    await user.click(screen.getByRole("button", { name: "Edit Rule 1" }));
    await user.click(screen.getByLabelText("Rule enabled"));
    await user.click(screen.getByRole("button", { name: "Edit Rule 2" }));
    expect(screen.getByRole("alertdialog", { name: "Unsaved rule changes" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(harness.controller.getSnapshot()).toMatchObject({
      status: "decision-required",
      saveError: error,
    });
    expect(
      within(screen.getByRole("alertdialog", { name: "Unsaved rule changes" })).getByText(
        "Repair every unavailable rule source before saving.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel change" }));
    expect(harness.controller.getSnapshot().status).toBe("focused-dirty");
    await user.click(screen.getByRole("button", { name: "Edit Rule 2" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.getByRole("heading", { name: "Rule 2" })).toBeInTheDocument();
  });

  it("shows an honest empty state without exposing unavailable creation", () => {
    renderWorkspace({ ...projection(), capabilityState: "empty", rules: [] });

    expect(screen.getByRole("status")).toHaveTextContent(
      "This Surface has no learner interaction capabilities.",
    );
    expect(screen.getByRole("button", { name: "Add rule" })).toBeDisabled();
  });
});

function renderWorkspace(
  value: LearnerInteractionAuthoringProjection,
  options: {
    readonly saveResult?: LearnerInteractionAuthoringCommandResult<LearnerInteractionRuleId>;
    readonly setEnabledResult?: LearnerInteractionAuthoringCommandResult;
  } = {},
) {
  const saveDraft = vi.fn(
    (
      _draft: LearnerInteractionRuleDraft,
    ): LearnerInteractionAuthoringCommandResult<LearnerInteractionRuleId> =>
      options.saveResult ?? Result.ok(IDS.firstRule),
  );
  const controller = new LearnerInteractionWorkspaceController({ saveDraft });
  const onSetRuleEnabled = vi.fn(
    (
      _ruleId: LearnerInteractionRuleId,
      _isEnabled: boolean,
    ): LearnerInteractionAuthoringCommandResult => options.setEnabledResult ?? Result.ok(),
  );
  const onReorderRule = vi.fn(
    (
      _ruleId: LearnerInteractionRuleId,
      _direction: "earlier" | "later",
    ): LearnerInteractionAuthoringCommandResult => Result.ok(),
  );
  const onRemoveRule = vi.fn(
    (_ruleId: LearnerInteractionRuleId): LearnerInteractionAuthoringCommandResult => Result.ok(),
  );
  render(
    <LearnerInteractionWorkspace
      controller={controller}
      projection={value}
      onSetRuleEnabled={onSetRuleEnabled}
      onReorderRule={onReorderRule}
      onRemoveRule={onRemoveRule}
    />,
  );
  return { controller, saveDraft, onSetRuleEnabled, onReorderRule, onRemoveRule };
}

function projection({
  stale = false,
}: { readonly stale?: boolean } = {}): LearnerInteractionAuthoringProjection {
  const diagnostic = Object.freeze({
    reason: "event-not-declared" as const,
    source: Object.freeze({
      surfaceId: IDS.surface,
      ruleId: IDS.firstRule,
      location: Object.freeze({ kind: "when" as const }),
    }),
    targetId: IDS.stale,
    type: "stale-event",
  });
  const firstWhen = stale
    ? { targetId: IDS.stale, type: "stale-event" }
    : { targetId: IDS.source, type: "activated" };
  const firstRule: LearnerInteractionRuleV1 = {
    id: IDS.firstRule,
    isEnabled: true,
    when: firstWhen,
    conditions: [],
    commands: [{ kind: "reveal-target", targetId: IDS.surface }],
  };
  const secondRule: LearnerInteractionRuleV1 = { ...firstRule, id: IDS.secondRule };
  const whenOption = Object.freeze({
    availability: stale ? ("unavailable" as const) : ("available" as const),
    targetId: firstWhen.targetId,
    targetLabel: stale ? "stale0000001" : "Source",
    type: firstWhen.type,
    label: firstWhen.type,
  });
  const projectRule = (
    rule: LearnerInteractionRuleV1,
    isStale: boolean,
  ): ProjectedLearnerInteractionRule => {
    const command = rule.commands[0];
    if (command.kind !== "reveal-target") throw new Error("Expected reveal command fixture.");
    return Object.freeze({
      rule,
      diagnostics: Object.freeze(isStale ? [diagnostic] : []),
      when: Object.freeze({
        reference: rule.when,
        option: isStale ? whenOption : AVAILABLE_EVENT,
        diagnostics: Object.freeze(isStale ? [diagnostic] : []),
      }),
      conditions: Object.freeze([]),
      commands: Object.freeze([
        Object.freeze({
          kind: "reveal-target" as const,
          command,
          option: Object.freeze({
            availability: "available" as const,
            targetId: IDS.surface,
            label: "Surface",
          }),
          diagnostics: Object.freeze([]),
        }),
      ]),
    });
  };
  return Object.freeze({
    surfaceId: IDS.surface,
    capabilityState: "available",
    rules: Object.freeze([projectRule(firstRule, stale), projectRule(secondRule, false)]),
    whenEvents: Object.freeze([AVAILABLE_EVENT]),
    conditionStates: Object.freeze([
      Object.freeze({
        availability: "available" as const,
        targetId: IDS.source,
        targetLabel: "Source",
        key: "expanded",
        label: "Expanded",
        valueType: Object.freeze({ kind: "boolean" as const }),
      }),
    ]),
    targetCommands: Object.freeze([
      Object.freeze({
        availability: "available" as const,
        targetId: IDS.target,
        targetLabel: "Target",
        type: "seek",
        label: "Seek",
        input: Object.freeze({
          kind: "runtime-bounded-number" as const,
          min: 0,
          step: 0.5,
          unitLabel: "seconds",
        }),
      }),
    ]),
    revealTargets: Object.freeze([
      Object.freeze({
        availability: "available" as const,
        targetId: IDS.surface,
        label: "Surface",
      }),
    ]),
    navigationSurfaces: Object.freeze([
      Object.freeze({
        availability: "available" as const,
        surfaceId: IDS.otherSurface,
        label: "Other Surface",
      }),
    ]),
  });
}

const AVAILABLE_EVENT = Object.freeze({
  availability: "available" as const,
  targetId: IDS.source,
  targetLabel: "Source",
  type: "activated",
  label: "Activated",
});

function projectionWithUnavailableValues(): LearnerInteractionAuthoringProjection {
  const value = projection();
  const source = value.rules[0]!;
  const conditionDiagnostic = Object.freeze({
    reason: "state-not-declared" as const,
    source: Object.freeze({
      surfaceId: IDS.surface,
      ruleId: IDS.firstRule,
      location: Object.freeze({ kind: "condition" as const, conditionIndex: 0 }),
    }),
    targetId: IDS.stale,
    key: "legacy-state",
  });
  const commandDiagnostic = Object.freeze({
    reason: "command-not-declared" as const,
    source: Object.freeze({
      surfaceId: IDS.surface,
      ruleId: IDS.firstRule,
      location: Object.freeze({ kind: "command" as const, commandIndex: 0 }),
    }),
    targetId: IDS.stale,
    type: "legacy-command",
  });
  const rule: LearnerInteractionRuleV1 = {
    ...source.rule,
    conditions: [
      {
        targetId: IDS.stale,
        key: "legacy-state",
        operator: "equals",
        value: "legacy",
      },
    ],
    commands: [
      {
        kind: "target-command",
        command: { targetId: IDS.stale, type: "legacy-command", input: 7 },
      },
    ],
  };
  const projected: ProjectedLearnerInteractionRule = Object.freeze({
    rule,
    diagnostics: Object.freeze([conditionDiagnostic, commandDiagnostic]),
    when: source.when,
    conditions: Object.freeze([
      Object.freeze({
        predicate: rule.conditions[0]!,
        option: Object.freeze({
          availability: "unavailable" as const,
          targetId: IDS.stale,
          targetLabel: IDS.stale,
          key: "legacy-state",
          label: "legacy-state",
          valueType: null,
        }),
        diagnostics: Object.freeze([conditionDiagnostic]),
      }),
    ]),
    commands: Object.freeze([
      Object.freeze({
        kind: "target-command" as const,
        command: rule.commands[0] as Extract<
          (typeof rule.commands)[number],
          { readonly kind: "target-command" }
        >,
        option: Object.freeze({
          availability: "unavailable" as const,
          targetId: IDS.stale,
          targetLabel: IDS.stale,
          type: "legacy-command",
          label: "legacy-command",
          input: null,
        }),
        diagnostics: Object.freeze([commandDiagnostic]),
      }),
    ]),
  });
  return Object.freeze({ ...value, rules: Object.freeze([projected, value.rules[1]!]) });
}

function projectionWithValueDrift(): LearnerInteractionAuthoringProjection {
  type TargetCommand = Extract<
    LearnerInteractionRuleV1["commands"][number],
    { readonly kind: "target-command" }
  > & { readonly command: { readonly input: string } };
  const value = projection();
  const source = value.rules[0]!;
  const conditions = [
    {
      targetId: IDS.source,
      key: "expanded",
      operator: "equals" as const,
      value: "legacy-boolean",
    },
    {
      targetId: IDS.source,
      key: "mode",
      operator: "equals" as const,
      value: "retired",
    },
    {
      targetId: IDS.source,
      key: "duration",
      operator: "equals" as const,
      value: "legacy-number",
    },
  ];
  const commands: [TargetCommand, TargetCommand, TargetCommand] = [
    {
      kind: "target-command" as const,
      command: { targetId: IDS.target, type: "toggle", input: "legacy-command-boolean" },
    },
    {
      kind: "target-command" as const,
      command: { targetId: IDS.target, type: "choose", input: "retired-command" },
    },
    {
      kind: "target-command" as const,
      command: { targetId: IDS.target, type: "seek", input: "legacy-command-number" },
    },
  ];
  const conditionStates = Object.freeze([
    Object.freeze({
      availability: "available" as const,
      targetId: IDS.source,
      targetLabel: "Source",
      key: "expanded",
      label: "Expanded",
      valueType: Object.freeze({ kind: "boolean" as const }),
    }),
    Object.freeze({
      availability: "available" as const,
      targetId: IDS.source,
      targetLabel: "Source",
      key: "mode",
      label: "Mode",
      valueType: Object.freeze({
        kind: "enum" as const,
        options: Object.freeze([
          Object.freeze({ value: "active", label: "Active" }),
          Object.freeze({ value: "paused", label: "Paused" }),
        ] as const),
      }),
    }),
    Object.freeze({
      availability: "available" as const,
      targetId: IDS.source,
      targetLabel: "Source",
      key: "duration",
      label: "Duration",
      valueType: Object.freeze({
        kind: "number" as const,
        min: 0,
        max: 10,
        step: 1,
        unitLabel: "s",
      }),
    }),
  ]);
  const targetCommands = Object.freeze([
    Object.freeze({
      availability: "available" as const,
      targetId: IDS.target,
      targetLabel: "Target",
      type: "toggle",
      label: "Toggle",
      input: Object.freeze({ kind: "boolean" as const }),
    }),
    Object.freeze({
      availability: "available" as const,
      targetId: IDS.target,
      targetLabel: "Target",
      type: "choose",
      label: "Choose",
      input: Object.freeze({
        kind: "enum" as const,
        options: Object.freeze([
          Object.freeze({ value: "active", label: "Active" }),
          Object.freeze({ value: "paused", label: "Paused" }),
        ] as const),
      }),
    }),
    Object.freeze({
      availability: "available" as const,
      targetId: IDS.target,
      targetLabel: "Target",
      type: "seek",
      label: "Seek",
      input: Object.freeze({ kind: "number" as const, min: 0, max: 10, step: 1, unitLabel: "s" }),
    }),
  ]);
  const stateDiagnostics = conditions.map((condition, conditionIndex) =>
    Object.freeze({
      reason: "state-value-invalid" as const,
      source: Object.freeze({
        surfaceId: IDS.surface,
        ruleId: IDS.firstRule,
        location: Object.freeze({ kind: "condition" as const, conditionIndex }),
      }),
      targetId: condition.targetId,
      key: condition.key,
      value: condition.value,
    }),
  );
  const commandDiagnostics = commands.map((command, commandIndex) =>
    Object.freeze({
      reason: "command-input-invalid" as const,
      source: Object.freeze({
        surfaceId: IDS.surface,
        ruleId: IDS.firstRule,
        location: Object.freeze({ kind: "command" as const, commandIndex }),
      }),
      targetId: command.command.targetId,
      type: command.command.type,
      input: Object.freeze({ kind: "value" as const, value: command.command.input }),
    }),
  );
  const rule: LearnerInteractionRuleV1 = {
    ...source.rule,
    conditions,
    commands,
  };
  const projected: ProjectedLearnerInteractionRule = Object.freeze({
    rule,
    diagnostics: Object.freeze([...stateDiagnostics, ...commandDiagnostics]),
    when: source.when,
    conditions: Object.freeze(
      conditions.map((predicate, index) =>
        Object.freeze({
          predicate,
          option: conditionStates[index]!,
          diagnostics: Object.freeze([stateDiagnostics[index]!]),
        }),
      ),
    ),
    commands: Object.freeze(
      commands.map((command, index) =>
        Object.freeze({
          kind: "target-command" as const,
          command,
          option: targetCommands[index]!,
          diagnostics: Object.freeze([commandDiagnostics[index]!]),
        }),
      ),
    ),
  });
  return Object.freeze({
    ...value,
    rules: Object.freeze([projected, value.rules[1]!]),
    conditionStates,
    targetCommands,
  });
}
