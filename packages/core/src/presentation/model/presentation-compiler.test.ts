import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  type PresentationConfigurationV1,
} from "@scaffold/contracts";
import { Result } from "better-result";
import { describe, expect, it } from "vite-plus/test";

import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import type { ControlCapabilityCatalogue } from "@/document/control-binding";
import type { DocumentTreeSnapshot, DocumentTreeItem } from "@/document/model/document-tree";

import { blocksPresentationSurface, omittedActionIds } from "./presentation-compilation-diagnostic";
import { compilePresentation, type CompilePresentationInput } from "./presentation-compiler";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const SECOND_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00002");
const TARGET_ID = EmbeddedNodeIdSchema.parse("target000001");
const SECOND_TARGET_ID = EmbeddedNodeIdSchema.parse("target000002");
const OWNER_ID = EmbeddedNodeIdSchema.parse("owner0000001");
const MISSING_TARGET_ID = EmbeddedNodeIdSchema.parse("gone00000001");
const LAYER_OWNER_ID = EmbeddedNodeIdSchema.parse("region000001");
const LAYER_A_ID = EmbeddedNodeIdSchema.parse("layer0000001");
const LAYER_B_ID = EmbeddedNodeIdSchema.parse("layer0000002");

describe("compilePresentation", () => {
  it("returns ordinary unconfigured state when Presentation is absent", () => {
    const result = compilePresentation({
      configuration: undefined,
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
      controlCapabilities: controlCapabilities(),
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw new Error("Expected unconfigured Presentation to compile.");
    expect(result.value).toEqual({ program: null, surfaces: [], diagnostics: [] });
  });

  it("compiles deterministic visual, cue and Wait schedules", () => {
    const configuration = presentationConfiguration([
      reveal("action000001", 1_000, 500),
      {
        kind: "manual-wait",
        id: EmbeddedDataIdSchema.parse("action000002"),
        isEnabled: true,
        atMs: 2_000,
        boundary: "before-actions",
      },
      {
        kind: "trigger",
        id: EmbeddedDataIdSchema.parse("action000003"),
        isEnabled: true,
        atMs: 500,
        command: { kind: "target-command", targetId: TARGET_ID, type: "select-tab" },
      },
      {
        kind: "learner-wait",
        id: EmbeddedDataIdSchema.parse("action000004"),
        isEnabled: true,
        atMs: 2_000,
        boundary: "after-actions",
        requirement: { kind: "event", targetId: TARGET_ID, type: "selected" },
      },
      {
        kind: "trigger",
        id: EmbeddedDataIdSchema.parse("action000005"),
        isEnabled: true,
        atMs: 500,
        command: { kind: "navigate-surface", surfaceId: SURFACE_ID },
      },
      { ...reveal("action000006", 3_000, 500), isEnabled: false },
    ]);

    const program = compileOk({
      configuration,
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
    });

    expect(program).toMatchObject({ schemaVersion: 1, autoAdvance: false, allowPrevious: true });
    const surface = program.surfaceById.get(SURFACE_ID);
    expect(surface).toBe(program.surfaces[0]);
    expect(surface?.cues.map((cue) => cue.id)).toEqual(["action000003", "action000005"]);
    expect(surface?.cues[0]?.command).toEqual({
      kind: "target-command",
      ownerId: OWNER_ID,
      targetId: TARGET_ID,
      type: "select-tab",
    });
    expect(surface?.cues.map(({ seekBehavior }) => seekBehavior)).toEqual([
      "reconstruct-state",
      "consume",
    ]);
    expect(surface?.waits.map((wait) => wait.id)).toEqual(["action000002", "action000004"]);
    expect(surface?.waits.map((wait) => wait.boundary)).toEqual([
      "before-actions",
      "after-actions",
    ]);
    expect(surface?.waits[1]).toMatchObject({
      requirement: { kind: "event", ownerId: OWNER_ID, targetId: TARGET_ID, type: "selected" },
    });
    expect(surface?.visualProgram.segments).toHaveLength(1);
    expect(surface?.visualProgram.targetById.get(TARGET_ID)).toMatchObject({
      targetId: TARGET_ID,
      initialVisibility: "withheld",
    });
    expect(Object.isFrozen(program)).toBe(true);
    expect(Object.isFrozen(surface?.visualProgram.segments)).toBe(true);
  });

  it("detaches and freezes compiled visual intent from mutable portable source", () => {
    const action = reveal("action000001", 1_000, 500);
    const configuration = presentationConfiguration([action]);
    const program = compileOk({
      configuration,
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
    });
    const compiledVisual = program.surfaces[0]!.visualProgram.segments[0]!.visual;

    expect(compiledVisual).not.toBe(action.visual);
    expect(Object.isFrozen(compiledVisual)).toBe(true);
    expect(compiledVisual.kind).toBe("reveal");
    if (compiledVisual.kind !== "reveal" || compiledVisual.transition.kind === "instant") {
      throw new Error("Expected a compiled timed Reveal.");
    }
    expect(compiledVisual.transition).not.toBe(action.visual.transition);
    expect(Object.isFrozen(compiledVisual.transition)).toBe(true);
    expect(Object.isFrozen(compiledVisual.transition.easing)).toBe(true);

    Object.assign(action.visual.transition.easing, { preset: "ease-out" });
    expect(compiledVisual.transition.easing).toEqual({ kind: "preset", preset: "linear" });
  });

  it("preserves source order for actions tied at the same time", () => {
    const configuration = presentationConfiguration([
      instantReveal("action000003", 500),
      instantReveal("action000001", 500),
      instantReveal("action000002", 500),
    ]);

    const program = compileOk({
      configuration,
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
    });

    expect(program.surfaces[0]?.visualProgram.segments.map((segment) => segment.id)).toEqual([
      "action000003",
      "action000001",
      "action000002",
    ]);
  });

  it("classifies tied Trigger cues from semantic target metadata in source order", () => {
    const configuration = presentationConfiguration([
      trigger("action000003", 500, TARGET_ID, "select-tab"),
      trigger("action000001", 500, TARGET_ID, "play-audio"),
      {
        kind: "trigger",
        id: EmbeddedDataIdSchema.parse("action000002"),
        isEnabled: true,
        atMs: 500,
        command: { kind: "navigate-surface", surfaceId: SURFACE_ID },
      },
    ]);

    const program = compileOk({
      configuration,
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
    });

    expect(program.surfaces[0]?.cues.map(({ id, seekBehavior }) => ({ id, seekBehavior }))).toEqual(
      [
        { id: "action000003", seekBehavior: "reconstruct-state" },
        { id: "action000001", seekBehavior: "consume" },
        { id: "action000002", seekBehavior: "consume" },
      ],
    );
  });

  it.each([
    [
      "stale Surface coverage",
      {
        configuration: { ...presentationConfiguration([]), surfaces: [] },
        courseStructure: courseStructure(),
        semanticSnapshot: semanticSnapshot(),
      },
      {
        reason: "surface-coverage-stale",
        configuredSurfaceIds: [],
        currentSurfaceIds: [SURFACE_ID],
      },
    ],
    [
      "missing semantic Surface coverage",
      {
        configuration: presentationConfiguration([]),
        courseStructure: courseStructure(),
        semanticSnapshot: { ...semanticSnapshot(), itemById: new Map() },
      },
      { reason: "surface-coverage-missing", surfaceId: SURFACE_ID },
    ],
  ] as const)("returns immutable typed data when %s", (_name, input, expected) => {
    const result = compilePresentation({
      ...(input as unknown as Omit<CompilePresentationInput, "controlCapabilities">),
      controlCapabilities: controlCapabilities(),
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error(`Expected ${expected.reason}.`);
    expect(result.error).toEqual(expected);
    expect(Object.isFrozen(result.error)).toBe(true);
    for (const value of Object.values(result.error)) {
      if (Array.isArray(value)) expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it.each([
    [
      "navigation destination not current",
      {
        configuration: presentationConfiguration([
          {
            kind: "trigger" as const,
            id: EmbeddedDataIdSchema.parse("action000001"),
            isEnabled: true,
            atMs: 500,
            command: { kind: "navigate-surface" as const, surfaceId: MISSING_TARGET_ID },
          },
        ]),
        courseStructure: courseStructure(),
        semanticSnapshot: semanticSnapshot(),
      },
      {
        reason: "navigation-destination-not-current",
        surfaceId: SURFACE_ID,
        actionId: "action000001",
        destinationSurfaceId: MISSING_TARGET_ID,
      },
    ],
    [
      "target not current",
      {
        configuration: presentationConfiguration([
          trigger("action000001", 500, MISSING_TARGET_ID, "select-tab"),
        ]),
        courseStructure: courseStructure(),
        semanticSnapshot: semanticSnapshot(),
      },
      {
        reason: "referenced-target-missing",
        surfaceId: SURFACE_ID,
        source: { kind: "trigger-command", actionId: "action000001" },
        targetId: MISSING_TARGET_ID,
      },
    ],
    [
      "target moved to another Surface",
      {
        configuration: presentationConfiguration([instantReveal("action000001", 0)]),
        courseStructure: courseStructure(),
        semanticSnapshot: semanticSnapshot({ targetSurfaceId: MISSING_TARGET_ID }),
      },
      {
        reason: "target-moved-surface",
        source: { kind: "visual-effect", actionId: "action000001" },
        targetId: TARGET_ID,
        expectedSurfaceId: SURFACE_ID,
        actualSurfaceId: MISSING_TARGET_ID,
      },
    ],
    [
      "visual capability unavailable",
      {
        configuration: presentationConfiguration([
          { ...instantReveal("action000001", 0), targetId: OWNER_ID },
        ]),
        courseStructure: courseStructure(),
        semanticSnapshot: semanticSnapshot(),
      },
      {
        reason: "visual-capability-unavailable",
        surfaceId: SURFACE_ID,
        actionId: "action000001",
        targetId: OWNER_ID,
        capability: "reveal",
      },
    ],
    [
      "same-target timed overlap",
      {
        configuration: presentationConfiguration([
          reveal("action000001", 1_000, 1_000),
          reveal("action000002", 1_500, 1_000),
        ]),
        courseStructure: courseStructure(),
        semanticSnapshot: semanticSnapshot(),
      },
      {
        reason: "same-target-timed-overlap",
        surfaceId: SURFACE_ID,
        targetId: TARGET_ID,
        earlierActionId: "action000001",
        laterActionId: "action000002",
      },
    ],
  ] as const)("omits only the drifted action and reports %s", (_name, input, expected) => {
    const report = compileReport(input as CompilePresentationInput);

    expect(report.diagnostics).toEqual([expected]);
    expect(Object.isFrozen(report.diagnostics)).toBe(true);
    expect(Object.isFrozen(report.diagnostics[0])).toBe(true);
    const omitted = omittedActionIds(report.diagnostics[0]!);
    if (blocksPresentationSurface(report.diagnostics[0]!)) {
      expect(report.program).toBeNull();
      expect(report.surfaces[0]).toMatchObject({ status: "blocked", surfaceId: SURFACE_ID });
    } else {
      const surface = report.program!.surfaces[0]!;
      const compiledIds = [
        ...surface.cues.map(({ id }) => id),
        ...surface.waits.map(({ id }) => id),
        ...surface.visualProgram.segments.map(({ id }) => id),
      ];
      for (const actionId of omitted) expect(compiledIds).not.toContain(actionId);
      expect(compiledIds.length).toBe(
        input.configuration.surfaces[0]!.actions.length - omitted.length,
      );
    }
  });

  it("does not expose a usable partial Surface when one required action has drifted", () => {
    const report = compileReport({
      configuration: presentationConfiguration([
        reveal("action000001", 0, 500),
        trigger("action000002", 500, MISSING_TARGET_ID, "select-tab"),
        emphasize("action000003", SECOND_TARGET_ID, 1_000, 500),
        {
          kind: "manual-wait",
          id: EmbeddedDataIdSchema.parse("action000004"),
          isEnabled: true,
          atMs: 2_000,
          boundary: "after-actions",
        },
      ]),
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
    });

    expect(report.program).toBeNull();
    expect(report.surfaces).toMatchObject([{ status: "blocked", surfaceId: SURFACE_ID }]);
    expect(report.diagnostics).toEqual([
      {
        reason: "referenced-target-missing",
        surfaceId: SURFACE_ID,
        source: { kind: "trigger-command", actionId: "action000002" },
        targetId: MISSING_TARGET_ID,
      },
    ]);
  });

  it("orders diagnostics by authored source order and keeps the earlier overlap owner", () => {
    const report = compileReport({
      configuration: presentationConfiguration([
        reveal("action000003", 1_500, 1_000),
        trigger("action000001", 100, MISSING_TARGET_ID, "select-tab"),
        reveal("action000002", 1_000, 1_000),
        hide("action000004", TARGET_ID, 2_400, 500),
      ]),
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
    });

    expect(report.diagnostics.map(({ reason }) => reason)).toEqual([
      "same-target-timed-overlap",
      "referenced-target-missing",
    ]);
    expect(report.diagnostics[0]).toMatchObject({
      earlierActionId: "action000002",
      laterActionId: "action000003",
    });
    expect(report.program).toBeNull();
  });

  it("compiles the incoming Surface transition independently of its actions", () => {
    const configuration = presentationConfiguration([
      { ...instantReveal("action000001", 500), targetId: MISSING_TARGET_ID },
    ]);
    const transition = { kind: "slide" as const, durationMs: 400 };
    const report = compileReport({
      configuration: {
        ...configuration,
        surfaces: [{ ...configuration.surfaces[0]!, transition }],
      },
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
    });

    const surface = report.program!.surfaces[0]!;
    expect(surface.transition).toEqual(transition);
    expect(surface.transition).not.toBe(transition);
    expect(Object.isFrozen(surface.transition)).toBe(true);
    expect(surface.visualProgram.segments).toEqual([]);
  });

  it("treats an absent transition as Cut", () => {
    const program = compileOk({
      configuration: presentationConfiguration([]),
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
    });

    expect(program.surfaces[0]!.transition).toBeNull();
  });

  it("keeps the transition with its destination Surface when Surfaces are reordered", () => {
    const first = presentationConfiguration([]).surfaces[0]!;
    const second = {
      ...first,
      surfaceId: SECOND_SURFACE_ID,
      transition: { kind: "wipe" as const, durationMs: 600 },
    };
    const configuration = { ...presentationConfiguration([]), surfaces: [first, second] };
    const snapshot = twoSurfaceSnapshot();

    const original = compileOk({
      configuration,
      courseStructure: twoSurfaceStructure([SURFACE_ID, SECOND_SURFACE_ID]),
      semanticSnapshot: snapshot,
    });
    const reordered = compileOk({
      configuration,
      courseStructure: twoSurfaceStructure([SECOND_SURFACE_ID, SURFACE_ID]),
      semanticSnapshot: snapshot,
    });

    expect(original.surfaces.map(({ surfaceId, transition }) => [surfaceId, transition])).toEqual([
      [SURFACE_ID, null],
      [SECOND_SURFACE_ID, second.transition],
    ]);
    expect(reordered.surfaces.map(({ surfaceId, transition }) => [surfaceId, transition])).toEqual([
      [SECOND_SURFACE_ID, second.transition],
      [SURFACE_ID, null],
    ]);
    expect(reordered.surfaceById.get(SECOND_SURFACE_ID)?.transition).toEqual(second.transition);
  });

  it("preserves a valid independent Surface while blocking the whole playback program", () => {
    const first = presentationConfiguration([
      trigger("action000001", 500, MISSING_TARGET_ID, "select-tab"),
    ]).surfaces[0]!;
    const second = { ...first, surfaceId: SECOND_SURFACE_ID, actions: [] };
    const report = compileReport({
      configuration: { ...presentationConfiguration([]), surfaces: [first, second] },
      courseStructure: twoSurfaceStructure([SURFACE_ID, SECOND_SURFACE_ID]),
      semanticSnapshot: twoSurfaceSnapshot(),
    });

    expect(report.program).toBeNull();
    expect(report.surfaces[0]).toMatchObject({ status: "blocked", surfaceId: SURFACE_ID });
    expect(report.surfaces[1]).toMatchObject({ status: "playable", surfaceId: SECOND_SURFACE_ID });
    const secondOutcome = report.surfaces[1]!;
    if (secondOutcome.status !== "playable") throw new Error("Expected playable second Surface.");
    expect(secondOutcome.program.surfaceId).toBe(SECOND_SURFACE_ID);
  });

  it.each([
    [
      "missing learner target",
      learnerWait("action000001", {
        kind: "event",
        targetId: MISSING_TARGET_ID,
        type: "selected",
      }),
      "referenced-target-missing",
    ],
    [
      "undeclared learner event",
      learnerWait("action000001", { kind: "event", targetId: TARGET_ID, type: "unknown" }),
      "unavailable-required-capability",
    ],
    [
      "invalid required state value",
      learnerWait("action000001", {
        kind: "state",
        targetId: TARGET_ID,
        key: "complete",
        equals: "yes",
      }),
      "required-state-value-invalid",
    ],
    [
      "undeclared trigger command",
      trigger("action000001", 500, TARGET_ID, "unknown"),
      "trigger-command-unavailable",
    ],
    [
      "invalid trigger command input",
      {
        ...trigger("action000001", 500, TARGET_ID, "select-tab"),
        command: {
          kind: "target-command" as const,
          targetId: TARGET_ID,
          type: "select-tab",
          input: "unexpected",
        },
      },
      "trigger-command-input-invalid",
    ],
  ] as const)("blocks required work for %s", (_name, action, reason) => {
    const report = compileReport({
      configuration: presentationConfiguration([action]),
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
    });

    expect(report.program).toBeNull();
    expect(report.surfaces[0]).toMatchObject({ status: "blocked" });
    expect(report.diagnostics).toEqual([expect.objectContaining({ reason })]);
  });

  it("blocks an event Wait that is statically excluded by its boundary Layer selection", () => {
    const configuration = presentationConfiguration([
      learnerWait("action000001", {
        kind: "event",
        targetId: TARGET_ID,
        type: "selected",
      }),
    ]);
    configuration.surfaces[0]!.layerTracks = [
      {
        ownerId: LAYER_OWNER_ID,
        initialLayerId: LAYER_B_ID,
        switches: [
          { id: EmbeddedDataIdSchema.parse("switch000001"), atMs: 500, layerId: LAYER_A_ID },
        ],
      },
    ];
    const wait = configuration.surfaces[0]!.actions[0];
    if (wait?.kind !== "learner-wait") throw new Error("Expected learner Wait fixture.");
    wait.boundary = "before-actions";

    const report = compileReport({
      configuration,
      courseStructure: courseStructure(),
      semanticSnapshot: layeredSemanticSnapshot(),
    });

    expect(report.program).toBeNull();
    expect(report.diagnostics).toContainEqual({
      reason: "required-event-layer-unavailable",
      surfaceId: SURFACE_ID,
      waitId: "action000001",
      targetId: TARGET_ID,
      ownerId: LAYER_OWNER_ID,
      requiredLayerId: LAYER_A_ID,
      selectedLayerId: LAYER_B_ID,
      atMs: 500,
      boundary: "before-actions",
    });
  });

  it("keeps a capability catalogue identity defect observable as a thrown invariant", () => {
    const capabilities = controlCapabilities();
    expect(() =>
      compilePresentation({
        configuration: presentationConfiguration([
          trigger("action000001", 500, TARGET_ID, "select-tab"),
        ]),
        courseStructure: courseStructure(),
        semanticSnapshot: semanticSnapshot(),
        controlCapabilities: {
          ...capabilities,
          resolveCommand: (targetId) => Result.err({ reason: "target-not-public", targetId }),
        },
      }),
    ).toThrow(/lost public target/);
  });

  it("compiles Replace as independent adjacent Hide and Reveal segments", () => {
    const program = compileOk({
      configuration: presentationConfiguration([
        hide("action000001", TARGET_ID, 1_000, 500),
        reveal("action000002", 1_000, 500, SECOND_TARGET_ID),
      ]),
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
    });

    expect(program.surfaces[0]?.visualProgram.segments).toMatchObject([
      { id: "action000001", targetId: TARGET_ID, visual: { kind: "hide" } },
      { id: "action000002", targetId: SECOND_TARGET_ID, visual: { kind: "reveal" } },
    ]);
    expect(program.surfaces[0]?.visualProgram.targetById.get(TARGET_ID)?.initialVisibility).toBe(
      "visible",
    );
    expect(
      program.surfaces[0]?.visualProgram.targetById.get(SECOND_TARGET_ID)?.initialVisibility,
    ).toBe("withheld");
  });
});

type FixtureCompileInput = Omit<CompilePresentationInput, "controlCapabilities"> &
  Partial<Pick<CompilePresentationInput, "controlCapabilities">>;

function compileReport(input: FixtureCompileInput) {
  const result = compilePresentation({
    ...input,
    controlCapabilities: input.controlCapabilities ?? controlCapabilities(),
  });
  if (result.isErr()) {
    throw new Error(
      `Expected Presentation compilation to succeed: ${JSON.stringify(result.error)}`,
    );
  }
  return result.value;
}

function compileOk(input: FixtureCompileInput) {
  const report = compileReport(input);
  expect(report.diagnostics).toEqual([]);
  if (report.program === null) throw new Error("Expected configured Presentation program.");
  return report.program;
}

function twoSurfaceStructure(
  surfaceIds: readonly (typeof SURFACE_ID)[],
): ProjectedSlideshowCourseStructure {
  const base = courseStructure();
  const surfaces = surfaceIds.map((id, index) => ({
    id,
    index,
    courseSectionId: base.courseSections[0]!.id,
    courseSectionSurfaceIndex: index,
  }));
  const section = {
    ...base.courseSections[0]!,
    surfaceIds: [...surfaceIds],
    firstSurfaceId: surfaceIds[0]!,
  };
  return {
    ...base,
    surfaceIds: [...surfaceIds],
    surfaces,
    surfaceById: Object.fromEntries(surfaces.map((surface) => [surface.id, surface])),
    courseSections: [section],
    courseSectionById: { [section.id]: section },
  };
}

function twoSurfaceSnapshot(): DocumentTreeSnapshot {
  const base = semanticSnapshot();
  const secondSurface = semanticItem(SECOND_SURFACE_ID, "surface", []);
  return {
    ...base,
    roots: [...base.roots, secondSurface],
    itemById: new Map([...base.itemById, [secondSurface.id, secondSurface]]),
    parentById: new Map([...base.parentById, [secondSurface.id, null]]),
    locationById: new Map([...base.locationById, [secondSurface.id, location(SURFACE_ID, [])]]),
  };
}

function reveal(id: string, atMs: number, durationMs: number, targetId = TARGET_ID) {
  return {
    kind: "animate" as const,
    id: EmbeddedDataIdSchema.parse(id),
    targetId,
    isEnabled: true,
    atMs,
    visual: {
      kind: "reveal" as const,
      transition: {
        kind: "fade" as const,
        durationMs,
        easing: { kind: "preset" as const, preset: "linear" as const },
      },
    },
  };
}

function hide(id: string, targetId: typeof TARGET_ID, atMs: number, durationMs: number) {
  return {
    ...reveal(id, atMs, durationMs, targetId),
    visual: {
      kind: "hide" as const,
      transition: {
        kind: "fade" as const,
        durationMs,
        easing: { kind: "preset" as const, preset: "linear" as const },
      },
    },
  };
}

function instantReveal(id: string, atMs: number) {
  return {
    kind: "animate" as const,
    id: EmbeddedDataIdSchema.parse(id),
    targetId: TARGET_ID,
    isEnabled: true,
    atMs,
    visual: { kind: "reveal" as const, transition: { kind: "instant" as const } },
  };
}

function emphasize(id: string, targetId: typeof TARGET_ID, atMs: number, durationMs: number) {
  return {
    kind: "animate" as const,
    id: EmbeddedDataIdSchema.parse(id),
    targetId,
    isEnabled: true,
    atMs,
    visual: {
      kind: "emphasize" as const,
      effect: "outline" as const,
      durationMs,
      easing: { kind: "preset" as const, preset: "linear" as const },
    },
  };
}

function trigger(
  id: string,
  atMs: number,
  targetId: ReturnType<typeof EmbeddedNodeIdSchema.parse>,
  type: string,
) {
  return {
    kind: "trigger" as const,
    id: EmbeddedDataIdSchema.parse(id),
    isEnabled: true,
    atMs,
    command: { kind: "target-command" as const, targetId, type },
  };
}

function learnerWait(
  id: string,
  requirement: Extract<
    PresentationConfigurationV1["surfaces"][number]["actions"][number],
    { kind: "learner-wait" }
  >["requirement"],
) {
  return {
    kind: "learner-wait" as const,
    id: EmbeddedDataIdSchema.parse(id),
    isEnabled: true,
    atMs: 500,
    boundary: "after-actions" as const,
    requirement,
  };
}

function presentationConfiguration(
  actions: PresentationConfigurationV1["surfaces"][number]["actions"],
): PresentationConfigurationV1 {
  return {
    schemaVersion: 1,
    autoAdvance: false,
    allowPrevious: true,
    surfaces: [{ surfaceId: SURFACE_ID, durationMs: 5_000, layerTracks: [], actions }],
  };
}

function courseStructure(): ProjectedSlideshowCourseStructure {
  const surface = {
    id: SURFACE_ID,
    index: 0,
    courseSectionId: EmbeddedNodeIdSchema.parse("section00001"),
    courseSectionSurfaceIndex: 0,
  } as const;
  const section = {
    id: surface.courseSectionId,
    title: "Introduction",
    index: 0,
    surfaceIds: [SURFACE_ID],
    firstSurfaceId: SURFACE_ID,
  } as const;
  return {
    kind: "slideshow",
    mode: "slideshow",
    surfaceIds: [SURFACE_ID],
    surfaces: [surface],
    surfaceById: { [SURFACE_ID]: surface },
    courseSections: [section],
    courseSectionById: { [section.id]: section },
  };
}

function semanticSnapshot(
  options: {
    readonly targetSurfaceId?: ReturnType<typeof EmbeddedNodeIdSchema.parse>;
    readonly ownerlessTarget?: boolean;
  } = {},
): DocumentTreeSnapshot {
  const target = semanticItem(TARGET_ID, "exposed-child", []);
  const secondTarget = semanticItem(SECOND_TARGET_ID, "exposed-child", []);
  const owners = [semanticItem(OWNER_ID, "block", [target, secondTarget])];
  const owner = owners[0]!;
  const secondOwner = owner;
  const surfaceWithOwner = Object.freeze(
    semanticItem(SURFACE_ID, "surface", Object.freeze(owners)),
  );
  const itemById = new Map([
    [surfaceWithOwner.id, surfaceWithOwner],
    ...owners.map((item) => [item.id, item] as const),
    [target.id, target],
    [secondTarget.id, secondTarget],
  ]);
  return {
    revision: 1,
    mode: "slideshow",
    roots: [surfaceWithOwner],
    itemById,
    parentById: new Map([
      [surfaceWithOwner.id, null],
      ...owners.map((item) => [item.id, surfaceWithOwner.id] as const),
      [target.id, owner.id],
      [secondTarget.id, secondOwner.id],
    ]),
    locationById: new Map([
      [surfaceWithOwner.id, location(SURFACE_ID, [])],
      [owner.id, location(SURFACE_ID, [])],
      [
        target.id,
        location(
          options.targetSurfaceId ?? SURFACE_ID,
          options.ownerlessTarget
            ? []
            : [{ ownerId: OWNER_ID, childId: TARGET_ID, ownerKind: "block" as const }],
        ),
      ],
      [
        secondTarget.id,
        location(SURFACE_ID, [
          {
            ownerId: secondOwner.id,
            childId: SECOND_TARGET_ID,
            ownerKind: "block" as const,
          },
        ]),
      ],
    ]),
    diagnostics: [],
  };
}

function layeredSemanticSnapshot(): DocumentTreeSnapshot {
  const base = semanticSnapshot();
  const owner = base.itemById.get(OWNER_ID)!;
  const layerA = semanticItem(LAYER_A_ID, "layer", [owner]);
  const layerB = semanticItem(LAYER_B_ID, "layer", []);
  const layerOwner = semanticItem(LAYER_OWNER_ID, "region", [layerA, layerB]);
  const surface = semanticItem(SURFACE_ID, "surface", [layerOwner]);
  return {
    ...base,
    roots: [surface],
    itemById: new Map([
      ...base.itemById,
      [surface.id, surface],
      [layerOwner.id, layerOwner],
      [layerA.id, layerA],
      [layerB.id, layerB],
    ]),
    parentById: new Map([
      ...base.parentById,
      [surface.id, null],
      [layerOwner.id, surface.id],
      [layerA.id, layerOwner.id],
      [layerB.id, layerOwner.id],
      [owner.id, layerA.id],
    ]),
    locationById: new Map([
      ...base.locationById,
      [surface.id, location(SURFACE_ID, [])],
      [layerOwner.id, location(SURFACE_ID, [])],
      [layerA.id, location(SURFACE_ID, [])],
      [layerB.id, location(SURFACE_ID, [])],
    ]),
  };
}

function semanticItem(
  id: ReturnType<typeof EmbeddedNodeIdSchema.parse>,
  kind: DocumentTreeItem["kind"],
  children: readonly DocumentTreeItem[],
): DocumentTreeItem {
  return {
    id,
    kind,
    nodeType: kind,
    definitionId: kind === "exposed-child" ? "owner-block" : kind,
    label: id,
    summary: null,
    presentation: {
      actionIds: id === TARGET_ID || id === SECOND_TARGET_ID ? ["reveal", "hide", "emphasize"] : [],
      ...(id === TARGET_ID ? { reconstructableCommandTypes: ["select-tab"] } : {}),
      disabledReason: null,
    },
    children,
  };
}

function location(
  surfaceId: typeof SURFACE_ID,
  activationPath: readonly {
    ownerId: typeof OWNER_ID;
    childId: typeof TARGET_ID;
    ownerKind: "block";
  }[],
) {
  return {
    id: activationPath[0]?.childId ?? surfaceId,
    nodeType: "fixture",
    from: 0,
    to: 1,
    selectionTarget: { kind: "node" as const, pos: 0 },
    surfaceId,
    authoringAnchorId: null,
    activationPath,
  };
}

function controlCapabilities(): ControlCapabilityCatalogue {
  return {
    resolve(targetId) {
      if (targetId !== TARGET_ID && targetId !== SECOND_TARGET_ID) {
        return Result.err({ reason: "target-not-public", targetId });
      }
      return Result.ok({
        targetId,
        ownerId: OWNER_ID,
        capabilities: {
          events: [{ type: "selected", label: "Selected" }],
          states: [{ key: "complete", label: "Complete", valueType: { kind: "boolean" } }],
          commands: [
            { type: "select-tab", label: "Select tab" },
            { type: "play-audio", label: "Play audio" },
          ],
        },
      });
    },
    resolveCommand(targetId, type) {
      const target = this.resolve(targetId);
      if (target.isErr()) return target;
      const command = target.value.capabilities.commands?.find(
        (candidate) => candidate.type === type,
      );
      return command
        ? Result.ok({ targetId, ownerId: OWNER_ID, command })
        : Result.err({ reason: "command-not-declared", targetId, type });
    },
    requireOwnerControlDefinition() {
      throw new Error("not used by Presentation compiler tests");
    },
    requireOwnedTargetCapabilities() {
      throw new Error("not used by Presentation compiler tests");
    },
  };
}
