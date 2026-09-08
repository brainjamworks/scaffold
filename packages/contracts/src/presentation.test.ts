import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import {
  PresentationConfigurationV1Schema,
  type PresentationConfigurationV1,
  type TimelineActionV1,
} from "./presentation";

const SURFACE_ID = "surface00001";
const TARGET_ID = "target000001";
const OWNER_ID = "owner0000001";
const LAYER_ID = "layer0000001";
const SECOND_LAYER_ID = "layer0000002";

function configuration(actions: readonly unknown[] = []): unknown {
  return {
    schemaVersion: 1,
    autoAdvance: false,
    allowPrevious: true,
    surfaces: [{ surfaceId: SURFACE_ID, durationMs: 10_000, layerTracks: [], actions }],
  };
}

describe("PresentationConfigurationV1", () => {
  it("parses and JSON-round-trips the complete discriminated action family", () => {
    const value = configuration([
      {
        kind: "animate",
        id: "action000001",
        targetId: TARGET_ID,
        isEnabled: true,
        atMs: 500,
        visual: {
          kind: "reveal",
          transition: {
            kind: "slide",
            direction: "right",
            durationMs: 1_000,
            easing: { kind: "preset", preset: "ease-out" },
          },
        },
      },
      {
        kind: "animate",
        id: "action000002",
        targetId: TARGET_ID,
        isEnabled: true,
        atMs: 2_000,
        visual: {
          kind: "hide",
          transition: {
            kind: "fade",
            durationMs: 500,
            easing: { kind: "cubic-bezier", x1: 0.2, y1: 0, x2: 0.8, y2: 1 },
          },
        },
      },
      {
        kind: "animate",
        id: "action000004",
        targetId: TARGET_ID,
        isEnabled: true,
        atMs: 4_000,
        visual: {
          kind: "emphasize",
          durationMs: 400,
          easing: { kind: "preset", preset: "ease-in-out" },
          effect: "outline",
        },
      },
      {
        kind: "trigger",
        id: "action000005",
        isEnabled: true,
        atMs: 5_000,
        command: {
          kind: "target-command",
          targetId: TARGET_ID,
          type: "select-tab",
          input: "tab_0000001",
        },
      },
      {
        kind: "trigger",
        id: "action000006",
        isEnabled: true,
        atMs: 6_000,
        command: { kind: "navigate-surface", surfaceId: "surface00002" },
      },
      {
        kind: "manual-wait",
        id: "action000007",
        isEnabled: true,
        atMs: 7_000,
        boundary: "before-actions",
      },
      {
        kind: "learner-wait",
        id: "action000008",
        isEnabled: true,
        atMs: 8_000,
        boundary: "after-actions",
        requirement: { kind: "event", targetId: TARGET_ID, type: "selected" },
      },
      {
        kind: "learner-wait",
        id: "action000009",
        isEnabled: true,
        atMs: 10_000,
        boundary: "after-actions",
        requirement: { kind: "state", targetId: TARGET_ID, key: "complete", equals: true },
      },
    ]);

    const parsed = PresentationConfigurationV1Schema.parse({
      ...(value as Record<string, unknown>),
      surfaces: [
        {
          ...((value as { surfaces: readonly Record<string, unknown>[] }).surfaces[0] ?? {}),
          narration: { source: { mode: "external", src: "https://example.test/audio.mp3" } },
          transition: { kind: "slide", durationMs: 450 },
        },
      ],
    });

    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
    expect(parsed.surfaces[0]?.actions.map((action) => action.kind)).toEqual([
      "animate",
      "animate",
      "animate",
      "trigger",
      "trigger",
      "manual-wait",
      "learner-wait",
      "learner-wait",
    ]);
    expectTypeOf(parsed).toEqualTypeOf<PresentationConfigurationV1>();
    expectTypeOf(parsed.surfaces[0]!.actions[0]!).toMatchTypeOf<TimelineActionV1>();
  });

  it("accepts every bounded visibility recipe and an instant transition without timed fields", () => {
    const transitions = [
      { kind: "instant" },
      { kind: "fade", durationMs: 100, easing: { kind: "preset", preset: "linear" } },
      {
        kind: "slide",
        direction: "left",
        durationMs: 100,
        easing: { kind: "preset", preset: "ease-in" },
      },
      {
        kind: "float",
        direction: "up",
        durationMs: 100,
        easing: { kind: "preset", preset: "ease-out" },
      },
      { kind: "scale", durationMs: 100, easing: { kind: "preset", preset: "ease-in-out" } },
      {
        kind: "wipe",
        direction: "right",
        durationMs: 100,
        easing: { kind: "preset", preset: "linear" },
      },
    ];

    for (const [index, transition] of transitions.entries()) {
      expect(
        PresentationConfigurationV1Schema.safeParse(
          configuration([
            {
              kind: "animate",
              id: `action00000${index}`,
              targetId: TARGET_ID,
              isEnabled: true,
              atMs: 0,
              visual: { kind: "reveal", transition },
            },
          ]),
        ).success,
      ).toBe(true);
    }
  });

  it.each([
    { field: "atMs", value: -1 },
    { field: "atMs", value: 1.5 },
    { field: "atMs", value: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects invalid safe-integer action time $field=$value", ({ field, value }) => {
    expect(
      PresentationConfigurationV1Schema.safeParse(
        configuration([
          {
            kind: "manual-wait",
            id: "action000001",
            isEnabled: true,
            atMs: 0,
            boundary: "before-actions",
            [field]: value,
          },
        ]),
      ).success,
    ).toBe(false);
  });

  it("rejects non-positive timed durations and actions that exceed the Surface duration", () => {
    for (const [atMs, durationMs] of [
      [0, 0],
      [9_750, 500],
      [10_001, 1],
    ]) {
      expect(
        PresentationConfigurationV1Schema.safeParse(
          configuration([
            {
              kind: "animate",
              id: "action000001",
              targetId: TARGET_ID,
              isEnabled: true,
              atMs,
              visual: {
                kind: "reveal",
                transition: {
                  kind: "fade",
                  durationMs,
                  easing: { kind: "preset", preset: "linear" },
                },
              },
            },
          ]),
        ).success,
      ).toBe(false);
    }
  });

  it("rejects duplicate Surface and action identities", () => {
    const action = {
      kind: "manual-wait",
      id: "action000001",
      isEnabled: true,
      atMs: 0,
      boundary: "before-actions",
    };
    const baseSurface = {
      surfaceId: SURFACE_ID,
      durationMs: 10_000,
      layerTracks: [],
      actions: [action, action],
    };

    expect(
      PresentationConfigurationV1Schema.safeParse({
        schemaVersion: 1,
        autoAdvance: false,
        allowPrevious: true,
        surfaces: [baseSurface],
      }).success,
    ).toBe(false);
    expect(
      PresentationConfigurationV1Schema.safeParse({
        schemaVersion: 1,
        autoAdvance: false,
        allowPrevious: true,
        surfaces: [
          { ...baseSurface, actions: [action] },
          { ...baseSurface, actions: [] },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects library/runtime fields instead of stripping them", () => {
    for (const value of [
      { ...(configuration() as Record<string, unknown>), timeline: { seek() {} } },
      configuration([
        {
          kind: "animate",
          id: "action000001",
          targetId: TARGET_ID,
          isEnabled: true,
          atMs: 0,
          visual: {
            kind: "reveal",
            transition: { kind: "instant", selector: "#target", opacity: [0, 1] },
          },
        },
      ]),
      {
        ...(configuration() as Record<string, unknown>),
        surfaces: [
          {
            surfaceId: SURFACE_ID,
            durationMs: 10_000,
            layerTracks: [],
            narration: {
              source: {
                mode: "external",
                src: "https://example.test/audio.mp3",
                element: { play() {} },
              },
            },
            actions: [],
          },
        ],
      },
    ]) {
      expect(PresentationConfigurationV1Schema.safeParse(value).success).toBe(false);
    }
  });

  it("requires explicit Wait boundary with no legacy default", () => {
    expect(
      PresentationConfigurationV1Schema.safeParse(
        configuration([{ kind: "manual-wait", id: "action000001", isEnabled: true, atMs: 100 }]),
      ).success,
    ).toBe(false);
  });

  it("allows disabled Waits to share a timestamp but rejects two enabled Waits", () => {
    const first = {
      kind: "manual-wait",
      id: "action000001",
      isEnabled: true,
      atMs: 100,
      boundary: "before-actions",
    };
    expect(
      PresentationConfigurationV1Schema.safeParse(
        configuration([first, { ...first, id: "action000002", isEnabled: false }]),
      ).success,
    ).toBe(true);
    expect(
      PresentationConfigurationV1Schema.safeParse(
        configuration([first, { ...first, id: "action000002" }]),
      ).success,
    ).toBe(false);
  });

  it("parses the current portable Layer track and rejects invalid schedules", () => {
    const base = configuration();
    const surface = (base as { surfaces: Record<string, unknown>[] }).surfaces[0]!;
    const track = {
      ownerId: OWNER_ID,
      initialLayerId: LAYER_ID,
      switches: [{ id: "switch000001", atMs: 5_000, layerId: SECOND_LAYER_ID }],
    };
    expect(
      PresentationConfigurationV1Schema.safeParse({
        ...(base as Record<string, unknown>),
        surfaces: [{ ...surface, layerTracks: [track] }],
      }).success,
    ).toBe(true);

    for (const invalidTrack of [
      { ...track, switches: [{ ...track.switches[0], atMs: 0 }] },
      { ...track, switches: [{ ...track.switches[0], atMs: 10_000 }] },
      { ...track, switches: [{ ...track.switches[0], layerId: LAYER_ID }] },
      { ...track, switches: [...track.switches, { ...track.switches[0], id: "switch000002" }] },
    ]) {
      expect(
        PresentationConfigurationV1Schema.safeParse({
          ...(base as Record<string, unknown>),
          surfaces: [{ ...surface, layerTracks: [invalidTrack] }],
        }).success,
      ).toBe(false);
    }

    expect(
      PresentationConfigurationV1Schema.safeParse({
        ...(base as Record<string, unknown>),
        surfaces: [{ ...surface, layerTracks: [track, track] }],
      }).success,
    ).toBe(false);

    expect(
      PresentationConfigurationV1Schema.safeParse({
        ...(base as Record<string, unknown>),
        surfaces: [
          {
            ...surface,
            layerTracks: [
              track,
              {
                ...track,
                ownerId: "owner0000002",
                switches: [{ ...track.switches[0], id: "switch000002" }],
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);

    expect(
      PresentationConfigurationV1Schema.safeParse({
        ...(base as Record<string, unknown>),
        surfaces: [
          {
            ...surface,
            layerTracks: [{ ...track, startMs: 0, memberLayerIds: [LAYER_ID] }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
