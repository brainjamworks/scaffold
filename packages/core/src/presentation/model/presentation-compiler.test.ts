import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  type PresentationConfigurationV1,
} from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import type { DocumentTreeSnapshot, DocumentTreeItem } from "@/document/model/document-tree";

import { omittedActionIds } from "./presentation-compilation-diagnostic";
import { compilePresentation, type CompilePresentationInput } from "./presentation-compiler";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const SECOND_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00002");
const TARGET_ID = EmbeddedNodeIdSchema.parse("target000001");
const SECOND_TARGET_ID = EmbeddedNodeIdSchema.parse("target000002");
const OWNER_ID = EmbeddedNodeIdSchema.parse("owner0000001");
const MISSING_TARGET_ID = EmbeddedNodeIdSchema.parse("gone00000001");

describe("compilePresentation", () => {
  it("returns ordinary unconfigured state when Presentation is absent", () => {
    const result = compilePresentation({
      configuration: undefined,
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw new Error("Expected unconfigured Presentation to compile.");
    expect(result.value).toEqual({ program: null, diagnostics: [] });
  });

  it("compiles deterministic visual, cue and Wait schedules", () => {
    const configuration = presentationConfiguration([
      reveal("action000001", 1_000, 500),
      {
        kind: "manual-wait",
        id: EmbeddedDataIdSchema.parse("action000002"),
        isEnabled: true,
        atMs: 2_000,
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
    const result = compilePresentation(input as CompilePresentationInput);

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
        reason: "target-not-current",
        surfaceId: SURFACE_ID,
        actionId: "action000001",
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
        reason: "target-moved-to-another-surface",
        surfaceId: SURFACE_ID,
        currentSurfaceId: MISSING_TARGET_ID,
        actionId: "action000001",
        targetId: TARGET_ID,
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
  });

  it("keeps every independent valid action when one action has drifted", () => {
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
        },
      ]),
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
    });

    const surface = report.program!.surfaces[0]!;
    expect(surface.visualProgram.segments.map(({ id }) => id)).toEqual([
      "action000001",
      "action000003",
    ]);
    expect(surface.cues).toEqual([]);
    expect(surface.waits.map(({ id }) => id)).toEqual(["action000004"]);
    expect(report.diagnostics).toEqual([
      {
        reason: "target-not-current",
        surfaceId: SURFACE_ID,
        actionId: "action000002",
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
      "target-not-current",
    ]);
    expect(report.diagnostics[0]).toMatchObject({
      earlierActionId: "action000002",
      laterActionId: "action000003",
    });
    expect(report.program!.surfaces[0]!.visualProgram.segments.map(({ id }) => id)).toEqual([
      "action000002",
      "action000004",
    ]);
  });

  it("compiles the incoming Surface transition independently of its actions", () => {
    const configuration = presentationConfiguration([
      trigger("action000001", 500, MISSING_TARGET_ID, "select-tab"),
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
    expect(surface.cues).toEqual([]);
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

  it("keeps impossible semantic ownership observable as a thrown invariant", () => {
    expect(() =>
      compilePresentation({
        configuration: presentationConfiguration([
          trigger("action000001", 500, TARGET_ID, "select-tab"),
        ]),
        courseStructure: courseStructure(),
        semanticSnapshot: semanticSnapshot({ ownerlessTarget: true }),
      }),
    ).toThrow(/no semantic owner/);
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

function compileReport(input: CompilePresentationInput) {
  const result = compilePresentation(input);
  if (result.isErr()) {
    throw new Error(
      `Expected Presentation compilation to succeed: ${JSON.stringify(result.error)}`,
    );
  }
  return result.value;
}

function compileOk(input: CompilePresentationInput) {
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

function presentationConfiguration(
  actions: PresentationConfigurationV1["surfaces"][number]["actions"],
): PresentationConfigurationV1 {
  return {
    schemaVersion: 1,
    autoAdvance: false,
    allowPrevious: true,
    surfaces: [{ surfaceId: SURFACE_ID, durationMs: 5_000, actions }],
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
