import type { EmbeddedNodeId, LearnerInteractionRuleId } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { LearnerInteractionAuthoringProjection } from "@/editor/learner-interaction/model/learner-interaction-authoring-projection";
import type {
  LearnerInteractionCommandOutcome,
  LearnerInteractionTurnReport,
} from "@/learner-interaction/model";

import { projectLearnerInteractionPreviewReport } from "./learner-interaction-preview-report-projection";

const SURFACE_ID = "surface00001" as EmbeddedNodeId;
const NEXT_SURFACE_ID = "surface00002" as EmbeddedNodeId;
const TRIGGER_ID = "trigger00001" as EmbeddedNodeId;
const STATE_ID = "state000001" as EmbeddedNodeId;
const COMMAND_ID = "command00001" as EmbeddedNodeId;
const REVEAL_ID = "reveal000001" as EmbeddedNodeId;
const RULE_ID = "rule00000001" as LearnerInteractionRuleId;
const ZERO_CONDITION_RULE_ID = "rule00000002" as LearnerInteractionRuleId;

describe("projectLearnerInteractionPreviewReport", () => {
  it("projects matched and unmatched rules with exact predicate facts and source addresses", () => {
    const report: LearnerInteractionTurnReport = {
      turnNumber: 7,
      event: { targetId: TRIGGER_ID, type: "selected" },
      ruleEvaluations: [
        {
          kind: "not-matched",
          ruleId: RULE_ID,
          conditions: [
            { conditionIndex: 0, actualValue: false, matched: false },
            { conditionIndex: 1, actualValue: 3, matched: true },
          ],
        },
        { kind: "matched", ruleId: ZERO_CONDITION_RULE_ID, conditions: [] },
      ],
      commandExecutions: [
        {
          address: { ruleId: ZERO_CONDITION_RULE_ID, commandIndex: 0 },
          outcome: { kind: "succeeded" },
        },
      ],
      end: "completed",
    };

    const projected = projectLearnerInteractionPreviewReport(report, authoringProjection());

    expect(projected).toMatchObject({
      turnNumber: 7,
      event: report.event,
      eventSummary: "Trigger — Selected",
      end: "completed",
      endSummary: "Turn completed.",
      rules: [
        {
          ruleId: RULE_ID,
          label: "Rule 1",
          evaluation: "not-matched",
          summary: "Rule 1 did not match.",
          source: { surfaceId: SURFACE_ID, ruleId: RULE_ID, location: { kind: "when" } },
          predicates: [
            {
              conditionIndex: 0,
              actualValue: false,
              matched: false,
              summary: "Ready was false and did not match.",
              source: {
                surfaceId: SURFACE_ID,
                ruleId: RULE_ID,
                location: { kind: "condition", conditionIndex: 0 },
              },
            },
            {
              conditionIndex: 1,
              actualValue: 3,
              matched: true,
              summary: "Count was 3 and matched.",
              source: {
                surfaceId: SURFACE_ID,
                ruleId: RULE_ID,
                location: { kind: "condition", conditionIndex: 1 },
              },
            },
          ],
        },
        {
          ruleId: ZERO_CONDITION_RULE_ID,
          label: "Rule 2",
          evaluation: "matched",
          summary: "Rule 2 matched.",
          predicates: [],
        },
      ],
      commands: [
        {
          ruleId: ZERO_CONDITION_RULE_ID,
          commandIndex: 0,
          outcome: { kind: "succeeded" },
          summary: "Reset ran on Video.",
          source: {
            surfaceId: SURFACE_ID,
            ruleId: ZERO_CONDITION_RULE_ID,
            location: { kind: "command", commandIndex: 0 },
          },
        },
      ],
    });
    expect(projected.rules[0]?.predicates[0]?.actualValue).toBe(false);
    expect(projected.commands[0]?.outcome).toBe(report.commandExecutions[0]?.outcome);
  });

  it("represents navigation termination and skipped later commands in execution order", () => {
    const report: LearnerInteractionTurnReport = {
      turnNumber: 8,
      event: { targetId: TRIGGER_ID, type: "selected" },
      ruleEvaluations: [{ kind: "matched", ruleId: RULE_ID, conditions: [] }],
      commandExecutions: [
        {
          address: { ruleId: RULE_ID, commandIndex: 2 },
          outcome: { kind: "succeeded" },
        },
        {
          address: { ruleId: ZERO_CONDITION_RULE_ID, commandIndex: 0 },
          outcome: { kind: "skipped", reason: "surface-navigation-committed" },
        },
      ],
      end: "surface-navigation-committed",
    };

    const projected = projectLearnerInteractionPreviewReport(report, authoringProjection());

    expect(projected.endSummary).toBe("Turn ended after Surface navigation.");
    expect(projected.commands.map(({ summary }) => summary)).toEqual([
      "Navigated to Next slide.",
      "Skipped after Surface navigation.",
    ]);
  });

  it.each(controlCommandErrors())(
    "maps $error.reason without discarding its typed outcome",
    ({ outcome, expected }) => {
      const projected = projectLearnerInteractionPreviewReport(
        reportWithOutcome(0, outcome),
        authoringProjection(),
      );

      expect(projected.commands[0]).toMatchObject({ summary: expected, outcome });
    },
  );

  it.each(semanticTargetOutcomes())(
    "maps $outcome.result.kind semantic failure without discarding its facts",
    ({ outcome, expected }) => {
      const projected = projectLearnerInteractionPreviewReport(
        reportWithOutcome(1, outcome),
        authoringProjection(),
      );

      expect(projected.commands[0]).toMatchObject({ summary: expected, outcome });
    },
  );

  it.each([
    {
      outcome: { kind: "navigation-cancelled" as const },
      expected: "Surface navigation was cancelled.",
    },
    {
      outcome: { kind: "skipped" as const, reason: "surface-navigation-committed" as const },
      expected: "Skipped after Surface navigation.",
    },
  ])("maps the $outcome.kind navigation outcome", ({ outcome, expected }) => {
    const projected = projectLearnerInteractionPreviewReport(
      reportWithOutcome(2, outcome),
      authoringProjection(),
    );

    expect(projected.commands[0]).toMatchObject({ summary: expected, outcome });
  });

  it("falls back to stable event facts when no saved rule observed the event", () => {
    const projection = projectLearnerInteractionPreviewReport(
      {
        turnNumber: 1,
        event: { targetId: REVEAL_ID, type: "expanded" },
        ruleEvaluations: [],
        commandExecutions: [],
        end: "completed",
      },
      authoringProjection(),
    );

    expect(projection.eventSummary).toBe(`${REVEAL_ID} — expanded`);
  });

  it("throws when a report rule or indexed source no longer exists", () => {
    expect(() =>
      projectLearnerInteractionPreviewReport(
        {
          turnNumber: 1,
          event: { targetId: TRIGGER_ID, type: "selected" },
          ruleEvaluations: [
            { kind: "matched", ruleId: "missing-rule" as LearnerInteractionRuleId, conditions: [] },
          ],
          commandExecutions: [],
          end: "completed",
        },
        authoringProjection(),
      ),
    ).toThrowError(/missing-rule.*saved authoring projection/i);

    expect(() =>
      projectLearnerInteractionPreviewReport(
        {
          turnNumber: 1,
          event: { targetId: TRIGGER_ID, type: "selected" },
          ruleEvaluations: [
            {
              kind: "matched",
              ruleId: RULE_ID,
              conditions: [{ conditionIndex: 9, actualValue: true, matched: true }],
            },
          ],
          commandExecutions: [],
          end: "completed",
        },
        authoringProjection(),
      ),
    ).toThrowError(/condition 9/i);

    expect(() =>
      projectLearnerInteractionPreviewReport(
        {
          turnNumber: 1,
          event: { targetId: TRIGGER_ID, type: "selected" },
          ruleEvaluations: [],
          commandExecutions: [
            {
              address: { ruleId: RULE_ID, commandIndex: 9 },
              outcome: { kind: "succeeded" },
            },
          ],
          end: "completed",
        },
        authoringProjection(),
      ),
    ).toThrowError(/command 9/i);
  });
});

function reportWithOutcome(
  commandIndex: number,
  outcome: LearnerInteractionCommandOutcome,
): LearnerInteractionTurnReport {
  return {
    turnNumber: 1,
    event: { targetId: TRIGGER_ID, type: "selected" },
    ruleEvaluations: [],
    commandExecutions: [{ address: { ruleId: RULE_ID, commandIndex }, outcome }],
    end: "completed",
  };
}

function controlCommandErrors(): readonly {
  readonly outcome: LearnerInteractionCommandOutcome;
  readonly expected: string;
}[] {
  return [
    {
      outcome: { kind: "control-command-error", error: { reason: "cancelled" } },
      expected: "Command was cancelled.",
    },
    {
      outcome: { kind: "control-command-error", error: { reason: "playback-not-allowed" } },
      expected: "Playback was not allowed.",
    },
    {
      outcome: {
        kind: "control-command-error",
        error: { reason: "media-unavailable", mediaErrorCode: 4 },
      },
      expected: "Media was unavailable (code 4).",
    },
    {
      outcome: {
        kind: "control-command-error",
        error: { reason: "media-unavailable", mediaErrorCode: null },
      },
      expected: "Media was unavailable.",
    },
    {
      outcome: {
        kind: "control-command-error",
        error: { reason: "seek-out-of-range", requestedSeconds: 12, durationSeconds: 10 },
      },
      expected: "Could not seek to 12 seconds; the duration is 10 seconds.",
    },
    {
      outcome: {
        kind: "control-command-error",
        error: { reason: "page-out-of-range", requestedPage: 9, pageCount: 4 },
      },
      expected: "Page 9 is outside the 4-page document.",
    },
    {
      outcome: {
        kind: "control-command-error",
        error: { reason: "pdf-unavailable", requestedPage: 3 },
      },
      expected: "PDF page 3 was unavailable.",
    },
  ];
}

function semanticTargetOutcomes(): readonly {
  readonly outcome: LearnerInteractionCommandOutcome;
  readonly expected: string;
}[] {
  return [
    {
      outcome: {
        kind: "target-not-reached",
        result: { kind: "missing-target", requestedId: REVEAL_ID },
      },
      expected: `Target ${REVEAL_ID} no longer exists.`,
    },
    {
      outcome: {
        kind: "target-not-reached",
        result: {
          kind: "unavailable",
          requestedId: REVEAL_ID,
          ownerId: COMMAND_ID,
          childId: REVEAL_ID,
          nearestReachableOwnerId: null,
          reason: "owner-unmounted",
        },
      },
      expected: `Target ${REVEAL_ID} was unavailable: owner-unmounted.`,
    },
    {
      outcome: {
        kind: "target-not-reached",
        result: {
          kind: "refused",
          requestedId: REVEAL_ID,
          ownerId: COMMAND_ID,
          childId: REVEAL_ID,
          nearestReachableOwnerId: COMMAND_ID,
          reason: "authority-boundary",
        },
      },
      expected: `Target ${REVEAL_ID} refused activation: authority-boundary.`,
    },
    {
      outcome: {
        kind: "target-not-reached",
        result: { kind: "interrupted", requestedId: REVEAL_ID },
      },
      expected: `Target ${REVEAL_ID} activation was interrupted.`,
    },
  ];
}

function authoringProjection(): LearnerInteractionAuthoringProjection {
  const sharedWhen = {
    reference: { targetId: TRIGGER_ID, type: "selected" },
    option: {
      availability: "available" as const,
      targetId: TRIGGER_ID,
      targetLabel: "Trigger",
      type: "selected",
      label: "Selected",
    },
    diagnostics: [],
  };
  return {
    surfaceId: SURFACE_ID,
    capabilityState: "available",
    rules: [
      {
        rule: {
          id: RULE_ID,
          isEnabled: true,
          when: sharedWhen.reference,
          conditions: [
            { targetId: STATE_ID, key: "ready", operator: "equals", value: true },
            { targetId: STATE_ID, key: "count", operator: "equals", value: 3 },
          ],
          commands: [
            {
              kind: "target-command",
              command: { targetId: COMMAND_ID, type: "pause" },
            },
            { kind: "reveal-target", targetId: REVEAL_ID },
            { kind: "navigate-surface", surfaceId: NEXT_SURFACE_ID },
          ],
        },
        diagnostics: [],
        when: sharedWhen,
        conditions: [
          {
            predicate: { targetId: STATE_ID, key: "ready", operator: "equals", value: true },
            option: {
              availability: "available",
              targetId: STATE_ID,
              targetLabel: "Status",
              key: "ready",
              label: "Ready",
              valueType: { kind: "boolean" },
            },
            diagnostics: [],
          },
          {
            predicate: { targetId: STATE_ID, key: "count", operator: "equals", value: 3 },
            option: {
              availability: "available",
              targetId: STATE_ID,
              targetLabel: "Status",
              key: "count",
              label: "Count",
              valueType: { kind: "number", min: 0, max: 10, unitLabel: "items" },
            },
            diagnostics: [],
          },
        ],
        commands: [
          {
            kind: "target-command",
            command: {
              kind: "target-command",
              command: { targetId: COMMAND_ID, type: "pause" },
            },
            option: {
              availability: "available",
              targetId: COMMAND_ID,
              targetLabel: "Video",
              type: "pause",
              label: "Pause",
              input: undefined,
            },
            diagnostics: [],
          },
          {
            kind: "reveal-target",
            command: { kind: "reveal-target", targetId: REVEAL_ID },
            option: { availability: "available", targetId: REVEAL_ID, label: "Details" },
            diagnostics: [],
          },
          {
            kind: "navigate-surface",
            command: { kind: "navigate-surface", surfaceId: NEXT_SURFACE_ID },
            option: {
              availability: "available",
              surfaceId: NEXT_SURFACE_ID,
              label: "Next slide",
            },
            diagnostics: [],
          },
        ],
      },
      {
        rule: {
          id: ZERO_CONDITION_RULE_ID,
          isEnabled: true,
          when: sharedWhen.reference,
          conditions: [],
          commands: [
            {
              kind: "target-command",
              command: { targetId: COMMAND_ID, type: "reset" },
            },
          ],
        },
        diagnostics: [],
        when: sharedWhen,
        conditions: [],
        commands: [
          {
            kind: "target-command",
            command: {
              kind: "target-command",
              command: { targetId: COMMAND_ID, type: "reset" },
            },
            option: {
              availability: "available",
              targetId: COMMAND_ID,
              targetLabel: "Video",
              type: "reset",
              label: "Reset",
              input: undefined,
            },
            diagnostics: [],
          },
        ],
      },
    ],
    whenEvents: [],
    conditionStates: [],
    targetCommands: [],
    revealTargets: [],
    navigationSurfaces: [],
  };
}
