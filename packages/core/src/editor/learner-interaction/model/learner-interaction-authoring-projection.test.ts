import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  LearnerInteractionConfigurationV1Schema,
  type EmbeddedNodeId,
  type LearnerInteractionRuleV1,
} from "@scaffold/contracts";
import { Result } from "better-result";
import { describe, expect, it } from "vite-plus/test";

import type {
  ControlCapabilityCatalogue,
  ResolvedControlTarget,
} from "@/document/control-binding/control-capability-catalogue";
import type { ControlCapabilitySetDefinition } from "@/document/control-binding/control-definition";
import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import type { DocumentTreeSnapshot, DocumentTreeItem } from "@/document/model/document-tree";

import { projectLearnerInteractionAuthoring } from "./learner-interaction-authoring-projection";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const OTHER_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00002");
const MISSING_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00003");
const SECTION_ID = EmbeddedNodeIdSchema.parse("section00001");
const EVENT_TARGET_ID = EmbeddedNodeIdSchema.parse("eventTgt0001");
const STATE_TARGET_ID = EmbeddedNodeIdSchema.parse("stateTgt0001");
const COMMAND_TARGET_ID = EmbeddedNodeIdSchema.parse("commandTgt01");
const PASSIVE_TARGET_ID = EmbeddedNodeIdSchema.parse("passiveTgt01");
const MISSING_TARGET_ID = EmbeddedNodeIdSchema.parse("missingTgt01");
const RULE_ID = EmbeddedDataIdSchema.parse("rule00000001");

const EVENT_CAPABILITIES = {
  events: [{ type: "selected", label: "Selected" }],
} as const satisfies ControlCapabilitySetDefinition;
const STATE_CAPABILITIES = {
  states: [
    { key: "ready", label: "Ready", valueType: { kind: "boolean" } },
    {
      key: "mode",
      label: "Mode",
      valueType: {
        kind: "enum",
        options: [
          { value: "a", label: "Mode A" },
          { value: "b", label: "Mode B" },
        ],
      },
    },
    {
      key: "count",
      label: "Count",
      valueType: { kind: "number", min: 1, max: 5, step: 1, unitLabel: "items" },
    },
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
    { type: "toggle", label: "Toggle", input: { kind: "boolean" } },
    {
      type: "choose",
      label: "Choose",
      input: {
        kind: "enum",
        options: [
          { value: "a", label: "Choice A" },
          { value: "b", label: "Choice B" },
        ],
      },
    },
    {
      type: "count",
      label: "Count",
      input: { kind: "number", min: 1, max: 5, step: 1, unitLabel: "items" },
    },
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

describe("projectLearnerInteractionAuthoring", () => {
  it("enumerates detached current-Surface choices including hidden and passive targets", () => {
    const projection = projectLearnerInteractionAuthoring({
      configuration: null,
      surfaceId: SURFACE_ID,
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
      controlCapabilities: controlCapabilities(),
    });

    expect(projection.capabilityState).toBe("available");
    expect(projection.whenEvents).toEqual([
      {
        availability: "available",
        targetId: EVENT_TARGET_ID,
        targetLabel: "Hidden trigger",
        type: "selected",
        label: "Selected",
      },
    ]);
    expect(projection.conditionStates.map(({ key }) => key)).toEqual([
      "ready",
      "mode",
      "count",
      "position",
    ]);
    expect(projection.conditionStates.map(({ valueType }) => valueType)).toEqual(
      STATE_CAPABILITIES.states.map(({ valueType }) => valueType),
    );
    expect(projection.targetCommands.map(({ type }) => type)).toEqual([
      "reset",
      "toggle",
      "choose",
      "count",
      "seek",
    ]);
    expect(projection.targetCommands.map(({ input }) => input)).toEqual(
      COMMAND_CAPABILITIES.commands.map((command) =>
        "input" in command ? command.input : undefined,
      ),
    );
    expect(projection.revealTargets).toContainEqual({
      availability: "available",
      targetId: PASSIVE_TARGET_ID,
      label: "Passive content",
    });
    expect(projection.navigationSurfaces).toEqual([
      {
        availability: "available",
        surfaceId: OTHER_SURFACE_ID,
        label: "Next Surface",
      },
    ]);
    expect(projection.navigationSurfaces.some(({ surfaceId }) => surfaceId === SURFACE_ID)).toBe(
      false,
    );
  });

  it("retains disabled broken rules with exact source diagnostics and unavailable options", () => {
    const configuration = LearnerInteractionConfigurationV1Schema.parse({
      schemaVersion: 1,
      surfaces: [
        {
          surfaceId: SURFACE_ID,
          rules: [
            {
              id: RULE_ID,
              isEnabled: false,
              when: { targetId: EVENT_TARGET_ID, type: "removed-event" },
              conditions: [
                {
                  targetId: MISSING_TARGET_ID,
                  key: "missing-state",
                  operator: "equals",
                  value: true,
                },
              ],
              commands: [
                {
                  kind: "target-command",
                  command: { targetId: COMMAND_TARGET_ID, type: "removed-command" },
                },
                { kind: "navigate-surface", surfaceId: MISSING_SURFACE_ID },
              ],
            } satisfies LearnerInteractionRuleV1,
          ],
        },
      ],
    });

    const projection = projectLearnerInteractionAuthoring({
      configuration,
      surfaceId: SURFACE_ID,
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
      controlCapabilities: controlCapabilities(),
    });
    const projectedRule = projection.rules[0]!;

    expect(projectedRule.rule.isEnabled).toBe(false);
    expect(projectedRule.diagnostics.map(({ reason }) => reason)).toEqual([
      "event-not-declared",
      "target-not-public",
      "command-not-declared",
      "surface-not-found",
    ]);
    expect(projectedRule.when.option).toMatchObject({
      availability: "unavailable",
      targetLabel: "Hidden trigger",
      type: "removed-event",
      label: "removed-event",
    });
    expect(projectedRule.when.diagnostics.map(({ reason }) => reason)).toEqual([
      "event-not-declared",
    ]);
    expect(projectedRule.conditions[0]?.option).toMatchObject({
      availability: "unavailable",
      targetLabel: MISSING_TARGET_ID,
      key: "missing-state",
      label: "missing-state",
    });
    expect(projectedRule.conditions[0]?.diagnostics.map(({ reason }) => reason)).toEqual([
      "target-not-public",
    ]);
    expect(projectedRule.commands[0]?.option).toMatchObject({
      availability: "unavailable",
      targetLabel: "Command target",
      type: "removed-command",
      label: "removed-command",
    });
    expect(projectedRule.commands[1]?.option).toEqual({
      availability: "unavailable",
      surfaceId: MISSING_SURFACE_ID,
      label: MISSING_SURFACE_ID,
    });
    expect(
      projectedRule.commands.map(({ diagnostics }) => diagnostics.map(({ reason }) => reason)),
    ).toEqual([["command-not-declared"], ["surface-not-found"]]);
  });

  it("reports availability with an event and only reveal or navigation Then choices", () => {
    const projection = projectLearnerInteractionAuthoring({
      configuration: null,
      surfaceId: SURFACE_ID,
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
      controlCapabilities: controlCapabilities({ includeCommands: false }),
    });

    expect(projection.whenEvents).not.toHaveLength(0);
    expect(projection.targetCommands).toEqual([]);
    expect(projection.revealTargets).not.toHaveLength(0);
    expect(projection.navigationSurfaces).not.toHaveLength(0);
    expect(projection.capabilityState).toBe("available");
  });

  it("reports a capability-empty Surface without hiding static state or navigation choices", () => {
    const snapshot = semanticSnapshot({ includeEventAndCommands: false });
    const projection = projectLearnerInteractionAuthoring({
      configuration: null,
      surfaceId: SURFACE_ID,
      courseStructure: courseStructure(),
      semanticSnapshot: snapshot,
      controlCapabilities: controlCapabilities({ includeEventAndCommands: false }),
    });

    expect(projection.capabilityState).toBe("empty");
    expect(projection.whenEvents).toEqual([]);
    expect(projection.targetCommands).toEqual([]);
    expect(projection.conditionStates).not.toHaveLength(0);
    expect(projection.revealTargets).not.toHaveLength(0);
    expect(projection.navigationSurfaces).not.toHaveLength(0);
  });
});

function semanticSnapshot({
  includeEventAndCommands = true,
}: { readonly includeEventAndCommands?: boolean } = {}): DocumentTreeSnapshot {
  const currentChildren = [
    ...(includeEventAndCommands
      ? [
          item(EVENT_TARGET_ID, "Hidden trigger", "exposed-child"),
          item(COMMAND_TARGET_ID, "Command target", "block"),
        ]
      : []),
    item(STATE_TARGET_ID, "State target", "exposed-child"),
    item(PASSIVE_TARGET_ID, "Passive content", "rich-text"),
  ];
  const currentSurface = item(SURFACE_ID, "Current Surface", "surface", currentChildren);
  const otherSurface = item(OTHER_SURFACE_ID, "Next Surface", "surface");
  const items = [currentSurface, ...currentChildren, otherSurface];
  return Object.freeze({
    revision: 1,
    mode: "slideshow",
    roots: Object.freeze([currentSurface, otherSurface]),
    itemById: new Map(items.map((current) => [current.id, current])),
    parentById: new Map([
      [SURFACE_ID, null],
      ...currentChildren.map((current) => [current.id, SURFACE_ID] as const),
      [OTHER_SURFACE_ID, null],
    ]),
    locationById: new Map(
      items.map((current) => [
        current.id,
        {
          id: current.id,
          nodeType: current.nodeType,
          from: 0,
          to: 1,
          selectionTarget: { kind: "node" as const, pos: 0 },
          surfaceId: current.id === OTHER_SURFACE_ID ? OTHER_SURFACE_ID : SURFACE_ID,
          authoringAnchorId: current.id,
          activationPath: [],
        },
      ]),
    ),
    diagnostics: [],
  });
}

function item(
  id: EmbeddedNodeId,
  label: string,
  kind: DocumentTreeItem["kind"],
  children: readonly DocumentTreeItem[] = [],
): DocumentTreeItem {
  return Object.freeze({
    id,
    kind,
    nodeType: kind,
    definitionId: kind === "block" || kind === "surface" ? kind : null,
    label,
    summary: null,
    presentation: { actionIds: [], disabledReason: null },
    children: Object.freeze([...children]),
  });
}

function controlCapabilities({
  includeEventAndCommands = true,
  includeCommands = includeEventAndCommands,
}: {
  readonly includeEventAndCommands?: boolean;
  readonly includeCommands?: boolean;
} = {}): ControlCapabilityCatalogue {
  const byTargetId = new Map<EmbeddedNodeId, ControlCapabilitySetDefinition>([
    [STATE_TARGET_ID, STATE_CAPABILITIES],
    ...(includeEventAndCommands ? ([[EVENT_TARGET_ID, EVENT_CAPABILITIES]] as const) : []),
    ...(includeCommands ? ([[COMMAND_TARGET_ID, COMMAND_CAPABILITIES]] as const) : []),
  ]);
  const resolve = (targetId: EmbeddedNodeId) => {
    const capabilities = byTargetId.get(targetId);
    if (!capabilities) {
      return Result.err({ reason: "no-declared-capabilities" as const, targetId });
    }
    return Result.ok<ResolvedControlTarget>({ targetId, ownerId: targetId, capabilities });
  };
  return {
    resolve,
    resolveCommand(targetId, type) {
      const target = resolve(targetId);
      if (target.isErr()) return Result.err(target.error);
      const command = target.value.capabilities.commands?.find(
        (candidate) => candidate.type === type,
      );
      return command
        ? Result.ok({ targetId, ownerId: target.value.ownerId, command })
        : Result.err({ reason: "command-not-declared" as const, targetId, type });
    },
    requireOwnerControlDefinition() {
      throw new Error("not used by detached projection");
    },
    requireOwnedTargetCapabilities() {
      throw new Error("not used by detached projection");
    },
  };
}

function courseStructure(): ProjectedSlideshowCourseStructure {
  const first = Object.freeze({
    id: SURFACE_ID,
    index: 0,
    courseSectionId: SECTION_ID,
    courseSectionSurfaceIndex: 0,
  });
  const second = Object.freeze({
    id: OTHER_SURFACE_ID,
    index: 1,
    courseSectionId: SECTION_ID,
    courseSectionSurfaceIndex: 1,
  });
  const section = Object.freeze({
    id: SECTION_ID,
    title: "Section",
    index: 0,
    surfaceIds: Object.freeze([SURFACE_ID, OTHER_SURFACE_ID]),
    firstSurfaceId: SURFACE_ID,
  });
  return Object.freeze({
    kind: "slideshow",
    mode: "slideshow",
    surfaceIds: Object.freeze([SURFACE_ID, OTHER_SURFACE_ID]),
    surfaces: Object.freeze([first, second]),
    surfaceById: Object.freeze({ [SURFACE_ID]: first, [OTHER_SURFACE_ID]: second }),
    courseSections: Object.freeze([section]) as ProjectedSlideshowCourseStructure["courseSections"],
    courseSectionById: Object.freeze({ [SECTION_ID]: section }),
  });
}
