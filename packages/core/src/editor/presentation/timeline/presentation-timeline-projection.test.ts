import {
  type EmbeddedDataId,
  type EmbeddedNodeId,
  type PresentationConfigurationV1,
  type TimelineActionV1,
} from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import type {
  DocumentTreeSnapshot,
  DocumentTreeItem,
  DocumentItemLocation,
} from "@/document/model/document-tree";

import { projectPresentationTimeline } from "./presentation-timeline-projection";

const IDS = {
  surface: nodeId("surface"),
  otherSurface: nodeId("other-surface"),
  region: nodeId("region"),
  owner: nodeId("owner"),
  member: nodeId("member"),
  passive: nodeId("passive"),
  missing: nodeId("missing"),
} as const;

describe("projectPresentationTimeline", () => {
  it("derives current-Surface rows and joins flat actions without copying portable data", () => {
    const semantics = semanticSnapshot([
      semanticItem(IDS.surface, "surface", {
        actionIds: ["reveal"],
        children: [
          semanticItem(IDS.region, "region", {
            children: [
              semanticItem(IDS.owner, "block", {
                actionIds: ["reveal", "emphasize"],
                reconstructableCommandTypes: ["select-tab"],
                children: [
                  semanticItem(IDS.member, "exposed-child", {
                    actionIds: ["reveal"],
                  }),
                  semanticItem(IDS.passive, "exposed-child"),
                ],
              }),
            ],
          }),
        ],
      }),
      semanticItem(IDS.otherSurface, "surface"),
    ]);
    const wait = manualWait("wait", 100);
    const ownerAction = targetCommand("command", IDS.owner, "select-tab", 200);
    const navigation = navigationTrigger("navigation", IDS.otherSurface, 300);
    const memberAction = animate("member-action", IDS.member, "reveal", 400);
    const surfaceAction = animate("surface-action", IDS.surface, "reveal", 500);
    const configuration = presentation([
      wait,
      ownerAction,
      navigation,
      memberAction,
      surfaceAction,
    ]);

    const projection = projectPresentationTimeline(IDS.surface, semantics, configuration);

    expect(projection).toMatchObject({
      surfaceId: IDS.surface,
      configurationState: "present",
      durationMs: 10_000,
      diagnostics: [],
    });
    expect(projection.narration).toBe(configuration.surfaces[0]?.narration);
    expect(projection.transition).toBe(configuration.surfaces[0]?.transition);
    expect(projection.orderedActionIds).toEqual([
      wait.id,
      ownerAction.id,
      navigation.id,
      memberAction.id,
      surfaceAction.id,
    ]);
    expect(Object.isFrozen(projection.orderedActionIds)).toBe(true);
    expect(
      projection.rows.map(({ targetId, parentTargetId, depth }) => ({
        targetId,
        parentTargetId,
        depth,
      })),
    ).toEqual([
      { targetId: IDS.surface, parentTargetId: null, depth: 0 },
      { targetId: IDS.owner, parentTargetId: IDS.surface, depth: 1 },
      { targetId: IDS.member, parentTargetId: IDS.owner, depth: 2 },
    ]);

    const [surfaceRow, ownerRow, memberRow] = projection.rows;
    expect(surfaceRow?.actions).toEqual([wait, navigation, surfaceAction]);
    expect(ownerRow?.actions).toEqual([ownerAction]);
    expect(memberRow?.actions).toEqual([memberAction]);
    expect(surfaceRow?.actions[0]).toBe(wait);
    expect(ownerRow?.actions[0]).toBe(ownerAction);
    expect(memberRow?.actions[0]).toBe(memberAction);
    expect(ownerRow?.capabilities).toEqual({
      visualActionIds: ["reveal", "emphasize"],
      reconstructableCommandTypes: ["select-tab"],
      disabledReason: null,
    });
    expect(ownerRow?.label).toBe("owner label");
    expect(configuration.surfaces[0]?.actions[1]).not.toHaveProperty("label");
  });

  it("projects eligible targets without actions while Presentation remains absent", () => {
    const semantics = semanticSnapshot([
      semanticItem(IDS.surface, "surface", {
        children: [
          semanticItem(IDS.owner, "block", { actionIds: ["emphasize"] }),
          semanticItem(IDS.member, "exposed-child", {
            reconstructableCommandTypes: ["select-tab"],
          }),
          semanticItem(IDS.passive, "exposed-child"),
        ],
      }),
    ]);

    const projection = projectPresentationTimeline(IDS.surface, semantics, null);

    expect(projection).toMatchObject({
      configurationState: "absent",
      durationMs: null,
      narration: null,
      transition: null,
      diagnostics: [],
    });
    expect(projection.rows.map((row) => row.targetId)).toEqual([
      IDS.surface,
      IDS.owner,
      IDS.member,
    ]);
    expect(projection.rows.every((row) => row.actions.length === 0)).toBe(true);
  });

  it("retains stale actions on the Surface row and reports narrow source diagnostics", () => {
    const currentTarget = semanticItem(IDS.owner, "block", { actionIds: ["emphasize"] });
    const semantics = semanticSnapshot([
      semanticItem(IDS.surface, "surface", { children: [currentTarget] }),
      semanticItem(IDS.otherSurface, "surface", {
        children: [semanticItem(IDS.member, "exposed-child", { actionIds: ["reveal"] })],
      }),
    ]);
    const missingTarget = animate("missing-target", IDS.missing, "reveal", 100);
    const movedTarget = animate("moved-target", IDS.member, "reveal", 200);
    const changedCapability = animate("changed-capability", IDS.owner, "reveal", 300);
    const missingDestination = navigationTrigger("missing-destination", IDS.missing, 400);
    const missingWaitTarget = learnerWait("missing-wait-target", IDS.missing, 500);

    const projection = projectPresentationTimeline(
      IDS.surface,
      semantics,
      presentation([
        missingTarget,
        movedTarget,
        changedCapability,
        missingDestination,
        missingWaitTarget,
      ]),
    );

    expect(projection.rows[0]?.actions).toEqual([
      missingTarget,
      movedTarget,
      missingDestination,
      missingWaitTarget,
    ]);
    expect(projection.rows[1]?.actions).toEqual([changedCapability]);
    expect(projection.diagnostics).toEqual([
      {
        reason: "action-target-not-found",
        surfaceId: IDS.surface,
        actionId: missingTarget.id,
        targetId: IDS.missing,
      },
      {
        reason: "action-target-on-another-surface",
        surfaceId: IDS.surface,
        actionId: movedTarget.id,
        targetId: IDS.member,
        currentSurfaceId: IDS.otherSurface,
      },
      {
        reason: "visual-capability-not-declared",
        surfaceId: IDS.surface,
        actionId: changedCapability.id,
        targetId: IDS.owner,
        capabilityId: "reveal",
      },
      {
        reason: "navigation-surface-not-found",
        surfaceId: IDS.surface,
        actionId: missingDestination.id,
        destinationSurfaceId: IDS.missing,
      },
      {
        reason: "action-target-not-found",
        surfaceId: IDS.surface,
        actionId: missingWaitTarget.id,
        targetId: IDS.missing,
      },
    ]);
  });

  it("represents a missing current Surface or Timeline without inventing either", () => {
    const semantics = semanticSnapshot([semanticItem(IDS.surface, "surface")]);

    expect(projectPresentationTimeline(IDS.missing, semantics, null)).toEqual({
      surfaceId: IDS.missing,
      configurationState: "absent",
      durationMs: null,
      narration: null,
      transition: null,
      orderedActionIds: [],
      rows: [],
      diagnostics: [{ reason: "surface-not-found", surfaceId: IDS.missing }],
    });

    const configuration = presentation([], IDS.otherSurface);
    expect(projectPresentationTimeline(IDS.surface, semantics, configuration)).toMatchObject({
      configurationState: "present",
      rows: [expect.objectContaining({ targetId: IDS.surface, actions: [] })],
      diagnostics: [{ reason: "surface-timeline-not-found", surfaceId: IDS.surface }],
    });
  });

  it("throws malformed portable configuration and semantic identity defects", () => {
    const surface = semanticItem(IDS.surface, "surface");
    const semantics = semanticSnapshot([surface]);
    const malformed = {
      ...presentation([]),
      surfaces: [{ ...presentation([]).surfaces[0], durationMs: -1 }],
    } as PresentationConfigurationV1;

    expect(() => projectPresentationTimeline(IDS.surface, semantics, malformed)).toThrow();

    const brokenSnapshot: DocumentTreeSnapshot = {
      ...semantics,
      itemById: new Map([[IDS.surface, { ...surface, id: IDS.otherSurface }]]),
    };
    expect(() => projectPresentationTimeline(IDS.surface, brokenSnapshot, null)).toThrow(
      /semantic item identity/i,
    );
  });
});

function presentation(
  actions: readonly TimelineActionV1[],
  surfaceId: EmbeddedNodeId = IDS.surface,
): PresentationConfigurationV1 {
  return {
    schemaVersion: 1,
    autoAdvance: false,
    allowPrevious: true,
    surfaces: [
      {
        surfaceId,
        durationMs: 10_000,
        narration: { source: { mode: "external", src: "https://example.com/narration.mp3" } },
        transition: { kind: "fade", durationMs: 250 },
        actions: [...actions],
      },
    ],
  };
}

function animate(
  value: string,
  targetId: EmbeddedNodeId,
  kind: "reveal",
  atMs: number,
): TimelineActionV1 {
  return {
    kind: "animate",
    id: dataId(value),
    targetId,
    isEnabled: true,
    atMs,
    visual: { kind, transition: { kind: "instant" } },
  };
}

function targetCommand(
  value: string,
  targetId: EmbeddedNodeId,
  type: string,
  atMs: number,
): TimelineActionV1 {
  return {
    kind: "trigger",
    id: dataId(value),
    isEnabled: true,
    atMs,
    command: { kind: "target-command", targetId, type },
  };
}

function navigationTrigger(
  value: string,
  surfaceId: EmbeddedNodeId,
  atMs: number,
): TimelineActionV1 {
  return {
    kind: "trigger",
    id: dataId(value),
    isEnabled: true,
    atMs,
    command: { kind: "navigate-surface", surfaceId },
  };
}

function manualWait(value: string, atMs: number): TimelineActionV1 {
  return { kind: "manual-wait", id: dataId(value), isEnabled: true, atMs };
}

function learnerWait(value: string, targetId: EmbeddedNodeId, atMs: number): TimelineActionV1 {
  return {
    kind: "learner-wait",
    id: dataId(value),
    isEnabled: true,
    atMs,
    requirement: { kind: "event", targetId, type: "complete" },
  };
}

function semanticSnapshot(roots: readonly DocumentTreeItem[]): DocumentTreeSnapshot {
  const itemById = new Map<EmbeddedNodeId, DocumentTreeItem>();
  const parentById = new Map<EmbeddedNodeId, EmbeddedNodeId | null>();
  const locationById = new Map<EmbeddedNodeId, DocumentItemLocation>();

  const visit = (
    item: DocumentTreeItem,
    parentId: EmbeddedNodeId | null,
    surfaceId: EmbeddedNodeId | null,
  ) => {
    itemById.set(item.id, item);
    parentById.set(item.id, parentId);
    const owningSurfaceId = item.kind === "surface" ? item.id : surfaceId;
    locationById.set(item.id, {
      id: item.id,
      nodeType: item.nodeType,
      from: 0,
      to: 1,
      selectionTarget: { kind: "node", pos: 0 },
      surfaceId: owningSurfaceId,
      authoringAnchorId: item.id,
      activationPath: [],
    });
    for (const child of item.children) visit(child, item.id, owningSurfaceId);
  };
  for (const root of roots) visit(root, null, null);

  return {
    revision: 1,
    mode: "slideshow",
    roots,
    itemById,
    parentById,
    locationById,
    diagnostics: [],
  };
}

function semanticItem(
  itemId: EmbeddedNodeId,
  kind: DocumentTreeItem["kind"],
  input: {
    readonly actionIds?: DocumentTreeItem["presentation"]["actionIds"];
    readonly reconstructableCommandTypes?: readonly string[];
    readonly children?: readonly DocumentTreeItem[];
  } = {},
): DocumentTreeItem {
  return {
    id: itemId,
    kind,
    nodeType: kind,
    definitionId: kind === "block" ? kind : null,
    label: `${itemId.replaceAll("0", "")} label`,
    summary: null,
    presentation: {
      actionIds: input.actionIds ?? [],
      ...(input.reconstructableCommandTypes
        ? { reconstructableCommandTypes: input.reconstructableCommandTypes }
        : {}),
      disabledReason: null,
    },
    children: input.children ?? [],
  };
}

function nodeId(value: string): EmbeddedNodeId {
  return value.padEnd(12, "0").slice(0, 12) as EmbeddedNodeId;
}

function dataId(value: string): EmbeddedDataId {
  return value.padEnd(12, "0").slice(0, 12) as EmbeddedDataId;
}
