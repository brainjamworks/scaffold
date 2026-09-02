import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  LearnerInteractionConfigurationV1Schema,
  type LearnerInteractionConfigurationV1,
} from "@scaffold/contracts";
import { Result } from "better-result";
import { describe, expect, it } from "vite-plus/test";

import type {
  ControlCapabilityCatalogue,
  ResolvedControlTarget,
} from "@/document/control-binding/control-capability-catalogue";
import type { ControlCapabilitySetDefinition } from "@/document/control-binding/control-definition";
import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import type {
  SemanticDocumentSnapshot,
  SemanticItem,
} from "@/document/model/semantic-document/semantic-document-snapshot";

import {
  compileLearnerInteractions,
  type LearnerInteractionCompileDiagnostic,
} from "./learner-interaction-compiler";
import { createLearnerInteractionEventKey } from "./compiled-learner-interaction-program";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const SECOND_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00002");
const SECTION_ID = EmbeddedNodeIdSchema.parse("section00001");
const EVENT_TARGET_ID = EmbeddedNodeIdSchema.parse("eventTgt0001");
const STATE_TARGET_ID = EmbeddedNodeIdSchema.parse("stateTgt0001");
const COMMAND_TARGET_ID = EmbeddedNodeIdSchema.parse("commandTgt01");
const PASSIVE_TARGET_ID = EmbeddedNodeIdSchema.parse("passiveTgt01");
const OUTSIDE_TARGET_ID = EmbeddedNodeIdSchema.parse("outsideTgt01");
const MISSING_TARGET_ID = EmbeddedNodeIdSchema.parse("missingTgt01");
const MISSING_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00003");
const EVENT_OWNER_ID = EmbeddedNodeIdSchema.parse("ownerEvent01");
const STATE_OWNER_ID = EmbeddedNodeIdSchema.parse("ownerState01");
const COMMAND_OWNER_ID = EmbeddedNodeIdSchema.parse("ownerCmd0001");

const EVENT_CAPABILITIES = {
  events: [{ type: "selected", label: "Selected" }],
} as const satisfies ControlCapabilitySetDefinition;
const STATE_CAPABILITIES = {
  states: [
    { key: "ready", label: "Ready", valueType: { kind: "boolean" } },
    {
      key: "position",
      label: "Position",
      valueType: {
        kind: "runtime-bounded-number",
        min: 0,
        step: 0.5,
        unitLabel: "seconds",
      },
    },
  ],
} as const satisfies ControlCapabilitySetDefinition;
const COMMAND_CAPABILITIES = {
  commands: [
    { type: "reset", label: "Reset" },
    {
      type: "seek",
      label: "Seek",
      input: {
        kind: "runtime-bounded-number",
        min: 0,
        step: 0.5,
        unitLabel: "seconds",
      },
    },
  ],
} as const satisfies ControlCapabilitySetDefinition;

describe("compileLearnerInteractions", () => {
  it("returns frozen empty partial results for absent configuration", () => {
    const compilation = compileLearnerInteractions({
      configuration: null,
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
      controlCapabilities: controlCapabilities(),
    });

    expect([...compilation.surfaceById]).toEqual([]);
    expect(compilation.diagnostics).toEqual([]);
    expect(Object.isFrozen(compilation)).toBe(true);
    expect(Object.isFrozen(compilation.surfaceById)).toBe(true);
    expect(Object.isFrozen(compilation.diagnostics)).toBe(true);
  });

  it("compiles valid rules in authored event order without mounted bindings", () => {
    const firstRuleId = EmbeddedDataIdSchema.parse("rule00000001");
    const secondRuleId = EmbeddedDataIdSchema.parse("rule00000002");
    const disabledRuleId = EmbeddedDataIdSchema.parse("rule00000003");
    const configuration = parseConfiguration([
      {
        id: firstRuleId,
        isEnabled: true,
        when: { targetId: EVENT_TARGET_ID, type: "selected" },
        conditions: [{ targetId: STATE_TARGET_ID, key: "ready", operator: "equals", value: true }],
        commands: [
          { kind: "reveal-target", targetId: PASSIVE_TARGET_ID },
          {
            kind: "target-command",
            command: { targetId: COMMAND_TARGET_ID, type: "reset" },
          },
          {
            kind: "target-command",
            command: { targetId: COMMAND_TARGET_ID, type: "seek", input: 100_000.5 },
          },
          { kind: "navigate-surface", surfaceId: SECOND_SURFACE_ID },
        ],
      },
      {
        id: secondRuleId,
        isEnabled: true,
        when: { targetId: EVENT_TARGET_ID, type: "selected" },
        conditions: [],
        commands: [{ kind: "reveal-target", targetId: EVENT_TARGET_ID }],
      },
      {
        id: disabledRuleId,
        isEnabled: false,
        when: { targetId: EVENT_TARGET_ID, type: "selected" },
        conditions: [],
        commands: [{ kind: "reveal-target", targetId: PASSIVE_TARGET_ID }],
      },
    ]);

    const compilation = compileLearnerInteractions({
      configuration,
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
      controlCapabilities: controlCapabilities(),
    });
    const program = compilation.surfaceById.get(SURFACE_ID);
    const eventKey = createLearnerInteractionEventKey({
      ownerId: EVENT_OWNER_ID,
      targetId: EVENT_TARGET_ID,
      type: "selected",
    });
    const rules = program?.rulesByEvent.get(eventKey);

    expect(compilation.diagnostics).toEqual([]);
    expect([...compilation.surfaceById.keys()]).toEqual([SURFACE_ID]);
    expect(program?.surfaceId).toBe(SURFACE_ID);
    expect([...program!.rulesByEvent.keys()]).toEqual([eventKey]);
    expect(rules?.map(({ id }) => id)).toEqual([firstRuleId, secondRuleId]);
    expect(rules?.[0]).toMatchObject({
      when: { ownerId: EVENT_OWNER_ID, targetId: EVENT_TARGET_ID, type: "selected" },
      conditions: [
        {
          ownerId: STATE_OWNER_ID,
          targetId: STATE_TARGET_ID,
          key: "ready",
          operator: "equals",
          value: true,
        },
      ],
      commands: [
        { kind: "reveal-target", targetId: PASSIVE_TARGET_ID },
        {
          kind: "target-command",
          ownerId: COMMAND_OWNER_ID,
          targetId: COMMAND_TARGET_ID,
          type: "reset",
        },
        {
          kind: "target-command",
          ownerId: COMMAND_OWNER_ID,
          targetId: COMMAND_TARGET_ID,
          type: "seek",
          input: 100_000.5,
        },
        { kind: "navigate-surface", surfaceId: SECOND_SURFACE_ID },
      ],
    });
    expect(rules?.some(({ id }) => id === disabledRuleId)).toBe(false);
    expect(Object.isFrozen(compilation)).toBe(true);
    expect(Object.isFrozen(program)).toBe(true);
    expect(Object.isFrozen(program?.rulesByEvent)).toBe(true);
    expect(Object.isFrozen(rules)).toBe(true);
    expect(Object.isFrozen(rules?.[0])).toBe(true);
    expect(Object.isFrozen(rules?.[0]?.commands)).toBe(true);
  });

  it("retains every source diagnostic in stable order and keeps valid siblings", () => {
    const validRuleId = EmbeddedDataIdSchema.parse("rule00000001");
    const missingTargetRuleId = EmbeddedDataIdSchema.parse("rule00000002");
    const outsideTargetRuleId = EmbeddedDataIdSchema.parse("rule00000003");
    const undeclaredEventRuleId = EmbeddedDataIdSchema.parse("rule00000004");
    const invalidSourcesRuleId = EmbeddedDataIdSchema.parse("rule00000005");
    const disabledRuleId = EmbeddedDataIdSchema.parse("rule00000006");
    const configuration = parseConfiguration([
      {
        id: validRuleId,
        isEnabled: true,
        when: { targetId: EVENT_TARGET_ID, type: "selected" },
        conditions: [],
        commands: [{ kind: "reveal-target", targetId: PASSIVE_TARGET_ID }],
      },
      {
        id: missingTargetRuleId,
        isEnabled: true,
        when: { targetId: MISSING_TARGET_ID, type: "selected" },
        conditions: [],
        commands: [{ kind: "reveal-target", targetId: PASSIVE_TARGET_ID }],
      },
      {
        id: outsideTargetRuleId,
        isEnabled: true,
        when: { targetId: OUTSIDE_TARGET_ID, type: "selected" },
        conditions: [],
        commands: [{ kind: "reveal-target", targetId: PASSIVE_TARGET_ID }],
      },
      {
        id: undeclaredEventRuleId,
        isEnabled: true,
        when: { targetId: EVENT_TARGET_ID, type: "removed-event" },
        conditions: [],
        commands: [{ kind: "reveal-target", targetId: PASSIVE_TARGET_ID }],
      },
      {
        id: invalidSourcesRuleId,
        isEnabled: true,
        when: { targetId: EVENT_TARGET_ID, type: "selected" },
        conditions: [
          {
            targetId: STATE_TARGET_ID,
            key: "removed-state",
            operator: "equals",
            value: true,
          },
          {
            targetId: STATE_TARGET_ID,
            key: "position",
            operator: "equals",
            value: 0.25,
          },
        ],
        commands: [
          {
            kind: "target-command",
            command: { targetId: COMMAND_TARGET_ID, type: "removed-command" },
          },
          {
            kind: "target-command",
            command: { targetId: COMMAND_TARGET_ID, type: "reset", input: true },
          },
          {
            kind: "target-command",
            command: { targetId: COMMAND_TARGET_ID, type: "seek" },
          },
          { kind: "navigate-surface", surfaceId: MISSING_SURFACE_ID },
          { kind: "navigate-surface", surfaceId: SURFACE_ID },
        ],
      },
      {
        id: disabledRuleId,
        isEnabled: false,
        when: { targetId: EVENT_TARGET_ID, type: "disabled-removed-event" },
        conditions: [],
        commands: [{ kind: "reveal-target", targetId: PASSIVE_TARGET_ID }],
      },
    ]);

    const compilation = compileLearnerInteractions({
      configuration,
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
      controlCapabilities: controlCapabilities(),
    });
    const diagnostics = compilation.diagnostics;

    expect(diagnostics).toEqual([
      diagnostic("target-not-public", missingTargetRuleId, "when", {
        targetId: MISSING_TARGET_ID,
      }),
      diagnostic("target-outside-rule-surface", outsideTargetRuleId, "when", {
        targetId: OUTSIDE_TARGET_ID,
        targetSurfaceId: SECOND_SURFACE_ID,
      }),
      diagnostic("event-not-declared", undeclaredEventRuleId, "when", {
        targetId: EVENT_TARGET_ID,
        type: "removed-event",
      }),
      diagnostic("state-not-declared", invalidSourcesRuleId, "condition", {
        conditionIndex: 0,
        targetId: STATE_TARGET_ID,
        key: "removed-state",
      }),
      diagnostic("state-value-invalid", invalidSourcesRuleId, "condition", {
        conditionIndex: 1,
        targetId: STATE_TARGET_ID,
        key: "position",
        value: 0.25,
      }),
      diagnostic("command-not-declared", invalidSourcesRuleId, "command", {
        commandIndex: 0,
        targetId: COMMAND_TARGET_ID,
        type: "removed-command",
      }),
      diagnostic("command-input-invalid", invalidSourcesRuleId, "command", {
        commandIndex: 1,
        targetId: COMMAND_TARGET_ID,
        type: "reset",
        input: { kind: "value", value: true },
      }),
      diagnostic("command-input-invalid", invalidSourcesRuleId, "command", {
        commandIndex: 2,
        targetId: COMMAND_TARGET_ID,
        type: "seek",
        input: { kind: "absent" },
      }),
      diagnostic("surface-not-found", invalidSourcesRuleId, "command", {
        commandIndex: 3,
        surfaceId: MISSING_SURFACE_ID,
      }),
      diagnostic("navigation-target-is-rule-surface", invalidSourcesRuleId, "command", {
        commandIndex: 4,
        surfaceId: SURFACE_ID,
      }),
      diagnostic("event-not-declared", disabledRuleId, "when", {
        targetId: EVENT_TARGET_ID,
        type: "disabled-removed-event",
      }),
    ]);
    const compiledRules = [
      ...(compilation.surfaceById.get(SURFACE_ID)?.rulesByEvent.values() ?? []),
    ].flat();
    expect(compiledRules.map(({ id }) => id)).toEqual([validRuleId]);
    for (const item of diagnostics) {
      expect(Object.isFrozen(item)).toBe(true);
      expect(Object.isFrozen(item.source)).toBe(true);
      expect(Object.isFrozen(item.source.location)).toBe(true);
      if (item.reason === "command-input-invalid") expect(Object.isFrozen(item.input)).toBe(true);
    }
  });

  it("leaves invariant defects observable", () => {
    const defect = new Error("catalogue invariant failed");
    const capabilities = controlCapabilities();
    const configuration = parseConfiguration([
      {
        id: EmbeddedDataIdSchema.parse("rule00000001"),
        isEnabled: true,
        when: { targetId: EVENT_TARGET_ID, type: "selected" },
        conditions: [],
        commands: [{ kind: "reveal-target", targetId: PASSIVE_TARGET_ID }],
      },
    ]);

    expect(() =>
      compileLearnerInteractions({
        configuration,
        courseStructure: courseStructure(),
        semanticSnapshot: semanticSnapshot(),
        controlCapabilities: {
          ...capabilities,
          resolve: () => {
            throw defect;
          },
        },
      }),
    ).toThrow(defect);
  });
});

function parseConfiguration(
  rules: LearnerInteractionConfigurationV1["surfaces"][number]["rules"],
): LearnerInteractionConfigurationV1 {
  return LearnerInteractionConfigurationV1Schema.parse({
    schemaVersion: 1,
    surfaces: [{ surfaceId: SURFACE_ID, rules }],
  });
}

function courseStructure(): ProjectedSlideshowCourseStructure {
  const firstSurface = {
    id: SURFACE_ID,
    index: 0,
    courseSectionId: SECTION_ID,
    courseSectionSurfaceIndex: 0,
  } as const;
  const secondSurface = {
    id: SECOND_SURFACE_ID,
    index: 1,
    courseSectionId: SECTION_ID,
    courseSectionSurfaceIndex: 1,
  } as const;
  const section = {
    id: SECTION_ID,
    title: "Section",
    index: 0,
    surfaceIds: [SURFACE_ID, SECOND_SURFACE_ID],
    firstSurfaceId: SURFACE_ID,
  } as const;
  return {
    kind: "slideshow",
    mode: "slideshow",
    surfaceIds: [SURFACE_ID, SECOND_SURFACE_ID],
    surfaces: [firstSurface, secondSurface],
    surfaceById: { [SURFACE_ID]: firstSurface, [SECOND_SURFACE_ID]: secondSurface },
    courseSections: [section],
    courseSectionById: { [SECTION_ID]: section },
  };
}

function semanticSnapshot(): SemanticDocumentSnapshot {
  const targets = [
    semanticItem(SURFACE_ID, "surface"),
    semanticItem(SECOND_SURFACE_ID, "surface"),
    semanticItem(EVENT_TARGET_ID, "published-child"),
    semanticItem(STATE_TARGET_ID, "published-child"),
    semanticItem(COMMAND_TARGET_ID, "published-child"),
    semanticItem(PASSIVE_TARGET_ID, "published-child"),
    semanticItem(OUTSIDE_TARGET_ID, "published-child"),
  ];
  return {
    revision: 1,
    mode: "slideshow",
    roots: targets.slice(0, 2),
    itemById: new Map(targets.map((item) => [item.id, item])),
    parentById: new Map(targets.map((item) => [item.id, null])),
    locationById: new Map(
      targets.map((item) => [
        item.id,
        {
          id: item.id,
          nodeType: item.nodeType,
          from: 0,
          to: 1,
          selectionTarget: { kind: "node" as const, pos: 0 },
          surfaceId: item.id === OUTSIDE_TARGET_ID ? SECOND_SURFACE_ID : SURFACE_ID,
          authoringAnchorId: null,
          activationPath: [],
        },
      ]),
    ),
    diagnostics: [],
  };
}

function semanticItem(
  id: ReturnType<typeof EmbeddedNodeIdSchema.parse>,
  kind: SemanticItem["kind"],
): SemanticItem {
  return {
    id,
    kind,
    nodeType: kind,
    definitionId: kind === "published-child" ? null : kind,
    label: id,
    summary: null,
    presentation: { actionIds: [], disabledReason: null },
    presentationContainer: null,
    children: [],
  };
}

function controlCapabilities(): ControlCapabilityCatalogue {
  const targetById = new Map<ReturnType<typeof EmbeddedNodeIdSchema.parse>, ResolvedControlTarget>([
    [EVENT_TARGET_ID, resolvedTarget(EVENT_TARGET_ID, EVENT_OWNER_ID, EVENT_CAPABILITIES)],
    [STATE_TARGET_ID, resolvedTarget(STATE_TARGET_ID, STATE_OWNER_ID, STATE_CAPABILITIES)],
    [COMMAND_TARGET_ID, resolvedTarget(COMMAND_TARGET_ID, COMMAND_OWNER_ID, COMMAND_CAPABILITIES)],
    [OUTSIDE_TARGET_ID, resolvedTarget(OUTSIDE_TARGET_ID, EVENT_OWNER_ID, EVENT_CAPABILITIES)],
  ]);

  const catalogue: ControlCapabilityCatalogue = {
    resolve(targetId) {
      const target = targetById.get(targetId);
      return target
        ? Result.ok(target)
        : Result.err({ reason: "no-declared-capabilities" as const, targetId });
    },
    resolveCommand(targetId, type) {
      const target = targetById.get(targetId);
      if (!target) return Result.err({ reason: "no-declared-capabilities" as const, targetId });
      const command = target.capabilities.commands?.find((candidate) => candidate.type === type);
      return command
        ? Result.ok({ targetId, ownerId: target.ownerId, command })
        : Result.err({ reason: "command-not-declared" as const, targetId, type });
    },
    requireOwnerControlDefinition() {
      throw new Error("not used by compiler");
    },
    requireOwnedTargetCapabilities() {
      throw new Error("not used by compiler");
    },
  };
  return catalogue;
}

function resolvedTarget(
  targetId: ReturnType<typeof EmbeddedNodeIdSchema.parse>,
  ownerId: ReturnType<typeof EmbeddedNodeIdSchema.parse>,
  capabilities: ControlCapabilitySetDefinition,
): ResolvedControlTarget {
  return { targetId, ownerId, capabilities };
}

function diagnostic(
  reason: LearnerInteractionCompileDiagnostic["reason"],
  ruleId: ReturnType<typeof EmbeddedDataIdSchema.parse>,
  locationKind: "when" | "condition" | "command",
  facts: Record<string, unknown>,
) {
  const { conditionIndex, commandIndex, ...diagnosticFacts } = facts;
  const location =
    locationKind === "when"
      ? { kind: "when" }
      : locationKind === "condition"
        ? { kind: "condition", conditionIndex }
        : { kind: "command", commandIndex };
  return {
    reason,
    source: { surfaceId: SURFACE_ID, ruleId, location },
    ...diagnosticFacts,
  };
}
