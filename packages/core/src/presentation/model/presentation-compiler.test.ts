import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
  type PresentationConfigurationV1,
} from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import type { SemanticDocumentSnapshot, SemanticItem } from "@/document/model/semantic-document";

import { compilePresentation, type CompilePresentationInput } from "./presentation-compiler";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
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
    expect(result.value).toBeNull();
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

  it.each([
    PresentationContentLayout.Flow,
    PresentationContentLayout.Sequence,
  ] as const)("compiles resolved %s container/direct-child membership", (contentLayout) => {
    const program = compileOk({
      configuration: presentationConfiguration([reveal("action000001", 1_000, 500)]),
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot({ contentLayout }),
    });
    const visualProgram = program.surfaces[0]!.visualProgram;
    const target = visualProgram.targetById.get(TARGET_ID);

    expect(target?.contentLayout).toEqual({
      containerId: OWNER_ID,
      contentLayout,
      directChildId: TARGET_ID,
      directChildIds: [TARGET_ID, SECOND_TARGET_ID],
    });
    expect(visualProgram.sequenceContainers).toEqual(
      contentLayout === PresentationContentLayout.Sequence
        ? [
            {
              boundaryId: OWNER_ID,
              directChildIds: [TARGET_ID, SECOND_TARGET_ID],
              initialActiveChildId: TARGET_ID,
            },
          ]
        : [],
    );
  });
});

function compileOk(input: Parameters<typeof compilePresentation>[0]) {
  const result = compilePresentation(input);
  expect(result.isOk()).toBe(true);
  if (result.isErr()) {
    throw new Error(
      `Expected Presentation compilation to succeed: ${JSON.stringify(result.error)}`,
    );
  }
  if (result.value === null) throw new Error("Expected configured Presentation program.");
  return result.value;
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
    readonly contentLayout?: PresentationContentLayout;
  } = {},
): SemanticDocumentSnapshot {
  const surface = semanticItem(SURFACE_ID, "surface", [
    semanticItem(OWNER_ID, "block", [
      semanticItem(TARGET_ID, "published-child", []),
      semanticItem(SECOND_TARGET_ID, "published-child", []),
    ]),
  ]);
  const owner = Object.freeze({
    ...surface.children[0]!,
    presentationContainer:
      options.contentLayout === undefined
        ? null
        : Object.freeze({ contentLayout: options.contentLayout }),
  });
  const surfaceWithOwner = Object.freeze({ ...surface, children: Object.freeze([owner]) });
  const target = owner.children[0]!;
  const secondTarget = owner.children[1]!;
  const itemById = new Map([
    [surfaceWithOwner.id, surfaceWithOwner],
    [owner.id, owner],
    [target.id, target],
    [secondTarget.id, secondTarget],
  ]);
  return {
    revision: 1,
    mode: "slideshow",
    roots: [surfaceWithOwner],
    itemById,
    parentById: new Map([
      [surface.id, null],
      [owner.id, surface.id],
      [target.id, owner.id],
      [secondTarget.id, owner.id],
    ]),
    locationById: new Map([
      [surface.id, location(SURFACE_ID, [])],
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
          { ownerId: OWNER_ID, childId: SECOND_TARGET_ID, ownerKind: "block" as const },
        ]),
      ],
    ]),
    diagnostics: [],
  };
}

function semanticItem(
  id: ReturnType<typeof EmbeddedNodeIdSchema.parse>,
  kind: SemanticItem["kind"],
  children: readonly SemanticItem[],
): SemanticItem {
  return {
    id,
    kind,
    nodeType: kind,
    definitionId: kind === "published-child" ? "owner-block" : kind,
    label: id,
    summary: null,
    presentation: {
      actionIds:
        id === TARGET_ID || id === SECOND_TARGET_ID ? ["reveal", "hide", "move", "emphasize"] : [],
      ...(id === TARGET_ID ? { reconstructableCommandTypes: ["select-tab"] } : {}),
      disabledReason: null,
    },
    presentationContainer: null,
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
