import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  type PresentationConfigurationV1,
} from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import type {
  SemanticDocumentSnapshot,
  SemanticItem,
} from "@/document/model/semantic-document";

import { compilePresentation } from "./presentation-compiler";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const TARGET_ID = EmbeddedNodeIdSchema.parse("target000001");
const OWNER_ID = EmbeddedNodeIdSchema.parse("owner0000001");

describe("compilePresentation", () => {
  it("returns ordinary unconfigured state when Presentation is absent", () => {
    expect(
      compilePresentation({
        configuration: undefined,
        courseStructure: courseStructure(),
        semanticSnapshot: semanticSnapshot(),
      }),
    ).toBeNull();
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

    const program = compilePresentation({
      configuration,
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
    });

    expect(program).not.toBeNull();
    expect(program).toMatchObject({ schemaVersion: 1, autoAdvance: false, allowPrevious: true });
    const surface = program!.surfaceById.get(SURFACE_ID);
    expect(surface).toBe(program!.surfaces[0]);
    expect(surface?.cues.map((cue) => cue.id)).toEqual(["action000003", "action000005"]);
    expect(surface?.cues[0]?.command).toEqual({
      kind: "target-command",
      ownerId: OWNER_ID,
      targetId: TARGET_ID,
      type: "select-tab",
    });
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

    const program = compilePresentation({
      configuration,
      courseStructure: courseStructure(),
      semanticSnapshot: semanticSnapshot(),
    });

    expect(program?.surfaces[0]?.visualProgram.segments.map((segment) => segment.id)).toEqual([
      "action000003",
      "action000001",
      "action000002",
    ]);
  });

  it("throws when configured Surface coverage or target identity is invalid", () => {
    expect(() =>
      compilePresentation({
        configuration: { ...presentationConfiguration([]), surfaces: [] },
        courseStructure: courseStructure(),
        semanticSnapshot: semanticSnapshot(),
      }),
    ).toThrow(/Surface coverage/);

    expect(() =>
      compilePresentation({
        configuration: presentationConfiguration([
          { ...instantReveal("action000001", 0), targetId: OWNER_ID },
        ]),
        courseStructure: courseStructure(),
        semanticSnapshot: semanticSnapshot(),
      }),
    ).toThrow(/does not declare visual capability "reveal"/);
  });

  it("throws for overlapping timed actions on one target", () => {
    expect(() =>
      compilePresentation({
        configuration: presentationConfiguration([
          reveal("action000001", 1_000, 1_000),
          reveal("action000002", 1_500, 1_000),
        ]),
        courseStructure: courseStructure(),
        semanticSnapshot: semanticSnapshot(),
      }),
    ).toThrow(/overlap/);
  });
});

function reveal(id: string, atMs: number, durationMs: number) {
  return {
    kind: "animate" as const,
    id: EmbeddedDataIdSchema.parse(id),
    targetId: TARGET_ID,
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

function semanticSnapshot(): SemanticDocumentSnapshot {
  const surface = semanticItem(SURFACE_ID, "surface", [
    semanticItem(OWNER_ID, "block", [semanticItem(TARGET_ID, "published-child", [])]),
  ]);
  const owner = surface.children[0]!;
  const target = owner.children[0]!;
  const itemById = new Map([
    [surface.id, surface],
    [owner.id, owner],
    [target.id, target],
  ]);
  return {
    revision: 1,
    mode: "slideshow",
    roots: [surface],
    itemById,
    parentById: new Map([
      [surface.id, null],
      [owner.id, surface.id],
      [target.id, owner.id],
    ]),
    locationById: new Map([
      [surface.id, location(SURFACE_ID, [])],
      [owner.id, location(SURFACE_ID, [])],
      [
        target.id,
        location(SURFACE_ID, [
          { ownerId: OWNER_ID, childId: TARGET_ID, ownerKind: "block" as const },
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
      actionIds: id === TARGET_ID ? ["reveal"] : [],
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
