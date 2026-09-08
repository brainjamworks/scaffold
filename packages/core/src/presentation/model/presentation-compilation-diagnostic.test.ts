import { EmbeddedDataIdSchema, EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  blocksPresentationSurface,
  omittedActionIds,
  type PresentationCompilationDiagnostic,
} from "./presentation-compilation-diagnostic";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const OTHER_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00002");
const TARGET_ID = EmbeddedNodeIdSchema.parse("target000001");
const EARLIER = EmbeddedDataIdSchema.parse("action000001");
const LATER = EmbeddedDataIdSchema.parse("action000002");
const OWNER_ID = EmbeddedNodeIdSchema.parse("owner0000001");
const LAYER_ID = EmbeddedNodeIdSchema.parse("layer0000001");

const EVERY_VARIANT: readonly [PresentationCompilationDiagnostic, readonly string[]][] = [
  [
    {
      reason: "navigation-destination-not-current",
      surfaceId: SURFACE_ID,
      actionId: EARLIER,
      destinationSurfaceId: OTHER_SURFACE_ID,
    },
    [EARLIER],
  ],
  [
    {
      reason: "referenced-target-missing",
      surfaceId: SURFACE_ID,
      source: { kind: "trigger-command", actionId: EARLIER },
      targetId: TARGET_ID,
    },
    [EARLIER],
  ],
  [
    {
      reason: "target-moved-surface",
      source: { kind: "learner-wait", waitId: EARLIER },
      targetId: TARGET_ID,
      expectedSurfaceId: SURFACE_ID,
      actualSurfaceId: OTHER_SURFACE_ID,
    },
    [EARLIER],
  ],
  [
    {
      reason: "trigger-command-unavailable",
      surfaceId: SURFACE_ID,
      actionId: EARLIER,
      targetId: TARGET_ID,
      type: "select-tab",
    },
    [EARLIER],
  ],
  [
    {
      reason: "trigger-command-input-invalid",
      surfaceId: SURFACE_ID,
      actionId: EARLIER,
      targetId: TARGET_ID,
      type: "select-tab",
      input: { kind: "absent" },
    },
    [EARLIER],
  ],
  [
    {
      reason: "unavailable-required-capability",
      surfaceId: SURFACE_ID,
      waitId: EARLIER,
      targetId: TARGET_ID,
      capability: { kind: "event", type: "selected" },
    },
    [EARLIER],
  ],
  [
    {
      reason: "required-state-value-invalid",
      surfaceId: SURFACE_ID,
      waitId: EARLIER,
      targetId: TARGET_ID,
      key: "complete",
      value: "yes",
    },
    [EARLIER],
  ],
  [
    {
      reason: "required-event-layer-unavailable",
      surfaceId: SURFACE_ID,
      waitId: EARLIER,
      targetId: TARGET_ID,
      ownerId: OWNER_ID,
      requiredLayerId: LAYER_ID,
      selectedLayerId: EmbeddedNodeIdSchema.parse("layer0000002"),
      atMs: 100,
      boundary: "before-actions",
    },
    [EARLIER],
  ],
  [
    {
      reason: "visual-capability-unavailable",
      surfaceId: SURFACE_ID,
      actionId: EARLIER,
      targetId: TARGET_ID,
      capability: "emphasize",
    },
    [EARLIER],
  ],
  [{ reason: "owner-track-missing", surfaceId: SURFACE_ID, ownerId: OWNER_ID }, []],
  [
    {
      reason: "owner-track-duplicated",
      surfaceId: SURFACE_ID,
      ownerId: OWNER_ID,
      trackIndexes: [0, 1],
    },
    [],
  ],
  [{ reason: "track-owner-not-current", surfaceId: SURFACE_ID, ownerId: OWNER_ID }, []],
  [
    {
      reason: "track-owner-not-layer-owner",
      surfaceId: SURFACE_ID,
      ownerId: OWNER_ID,
      actualKind: "block",
    },
    [],
  ],
  [
    {
      reason: "track-owner-moved-surface",
      ownerId: OWNER_ID,
      expectedSurfaceId: SURFACE_ID,
      actualSurfaceId: OTHER_SURFACE_ID,
    },
    [],
  ],
  [
    {
      reason: "initial-layer-not-owned",
      surfaceId: SURFACE_ID,
      ownerId: OWNER_ID,
      layerId: LAYER_ID,
    },
    [],
  ],
  [
    {
      reason: "switch-layer-not-owned",
      surfaceId: SURFACE_ID,
      ownerId: OWNER_ID,
      switchId: EARLIER,
      layerId: LAYER_ID,
    },
    [],
  ],
  [
    {
      reason: "conflicting-switches",
      surfaceId: SURFACE_ID,
      ownerId: OWNER_ID,
      atMs: 100,
      switchIds: [EARLIER, LATER],
    },
    [],
  ],
  [
    {
      reason: "redundant-layer-switch",
      surfaceId: SURFACE_ID,
      ownerId: OWNER_ID,
      switchId: EARLIER,
      atMs: 100,
      layerId: LAYER_ID,
    },
    [],
  ],
  [
    {
      reason: "layer-switch-outside-surface",
      surfaceId: SURFACE_ID,
      ownerId: OWNER_ID,
      switchId: EARLIER,
      atMs: 0,
      durationMs: 1_000,
    },
    [],
  ],
  [
    {
      reason: "same-target-timed-overlap",
      surfaceId: SURFACE_ID,
      targetId: TARGET_ID,
      earlierActionId: EARLIER,
      laterActionId: LATER,
    },
    [LATER],
  ],
];

describe("PresentationCompilationDiagnostic", () => {
  it.each(EVERY_VARIANT)(
    "addresses the omitted action for %o",
    (diagnostic: PresentationCompilationDiagnostic, expected: readonly string[]) => {
      const omitted = omittedActionIds(diagnostic);

      expect(omitted).toEqual(expected);
      expect(Object.isFrozen(omitted)).toBe(true);
    },
  );

  it("keeps the earlier overlap owner compiled and never blames it", () => {
    for (const [diagnostic] of EVERY_VARIANT) {
      if (!("earlierActionId" in diagnostic)) continue;
      expect(omittedActionIds(diagnostic)).not.toContain(diagnostic.earlierActionId);
    }
  });

  it("classifies optional visual drift separately from blocking required work", () => {
    expect(blocksPresentationSurface(EVERY_VARIANT[8]![0])).toBe(false);
    expect(blocksPresentationSurface(EVERY_VARIANT[0]![0])).toBe(true);
  });
});
