import {
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  projectContentLayout,
  type ContentLayoutProjectionInput,
  type ContentLayoutProjectionOutcome,
  type DirectChildContentLayoutState,
} from "./content-layout-projection";

const FLOW = PresentationContentLayout.Flow;
const SEQUENCE = PresentationContentLayout.Sequence;
const CONTAINER_ID = id("region000001");
const CHILD_IDS = [id("child-000001"), id("child-000002"), id("child-000003")] as const;

describe("projectContentLayout", () => {
  it("projects an empty Flow container with no child states", () => {
    const outcome = projectContentLayout(
      input({ contentLayout: FLOW, directChildIds: [], activeChildId: null }),
    );

    expect(outcome).toEqual({
      kind: "flow",
      containerId: CONTAINER_ID,
      childStates: [],
    });
  });

  it("projects every Flow child as ordinary content in source order", () => {
    const outcome = projectContentLayout(
      input({
        contentLayout: FLOW,
        directChildIds: CHILD_IDS,
        activeChildId: id("child-000099"),
      }),
    );

    expect(outcome).toEqual({
      kind: "flow",
      containerId: CONTAINER_ID,
      childStates: CHILD_IDS.map(normalState),
    });
  });

  it("fails open for duplicate Flow child IDs despite transient active identity", () => {
    const outcome = projectContentLayout(
      input({
        contentLayout: FLOW,
        directChildIds: [CHILD_IDS[0], CHILD_IDS[0]],
        activeChildId: id("child-000099"),
      }),
    );

    expect(outcome).toEqual({
      kind: "projection-unavailable",
      containerId: CONTAINER_ID,
      issue: {
        kind: "duplicate-direct-child-id",
        containerId: CONTAINER_ID,
        childId: CHILD_IDS[0],
      },
    });
    expectFrozenProjectionUnavailable(outcome);
  });

  it("accepts an empty Sequence only when no child is active", () => {
    const outcome = projectContentLayout(
      input({ contentLayout: SEQUENCE, directChildIds: [], activeChildId: null }),
    );

    expect(outcome).toEqual({
      kind: "empty-sequence",
      containerId: CONTAINER_ID,
      childStates: [],
    });
  });

  it.each(CHILD_IDS.map((activeChildId, ordinal) => [ordinal, activeChildId] as const))(
    "projects the active Sequence child at ordinal %i",
    (_ordinal, activeChildId) => {
      const outcome = projectContentLayout(
        input({
          contentLayout: SEQUENCE,
          directChildIds: CHILD_IDS,
          activeChildId,
        }),
      );

      expect(outcome).toEqual({
        kind: "projected-sequence",
        containerId: CONTAINER_ID,
        childStates: CHILD_IDS.map((childId) =>
          childId === activeChildId ? availableState(childId) : withheldState(childId),
        ),
      });

      if (outcome.kind !== "projected-sequence") return;
      expect(
        outcome.childStates.filter(
          (state) =>
            state.availability === "available" &&
            state.interaction === "enabled" &&
            state.accessibility === "exposed",
        ),
      ).toHaveLength(1);
      expect(outcome.childStates.map((state) => state.childId)).toEqual(CHILD_IDS);
    },
  );

  it.each([
    [
      "missing active",
      input({ contentLayout: SEQUENCE, directChildIds: CHILD_IDS, activeChildId: null }),
      {
        kind: "projection-unavailable",
        containerId: CONTAINER_ID,
        issue: {
          kind: "missing-active-child",
          containerId: CONTAINER_ID,
        },
      },
    ],
    [
      "active on empty Sequence",
      input({ contentLayout: SEQUENCE, directChildIds: [], activeChildId: CHILD_IDS[0] }),
      {
        kind: "projection-unavailable",
        containerId: CONTAINER_ID,
        issue: {
          kind: "active-child-on-empty-sequence",
          containerId: CONTAINER_ID,
          activeChildId: CHILD_IDS[0],
        },
      },
    ],
    [
      "non-direct active",
      input({
        contentLayout: SEQUENCE,
        directChildIds: CHILD_IDS,
        activeChildId: id("child-000099"),
      }),
      {
        kind: "projection-unavailable",
        containerId: CONTAINER_ID,
        issue: {
          kind: "active-child-not-direct",
          containerId: CONTAINER_ID,
          activeChildId: id("child-000099"),
        },
      },
    ],
    [
      "duplicate IDs",
      input({
        contentLayout: SEQUENCE,
        directChildIds: [CHILD_IDS[0], CHILD_IDS[1], CHILD_IDS[0]],
        activeChildId: CHILD_IDS[1],
      }),
      {
        kind: "projection-unavailable",
        containerId: CONTAINER_ID,
        issue: {
          kind: "duplicate-direct-child-id",
          containerId: CONTAINER_ID,
          childId: CHILD_IDS[0],
        },
      },
    ],
  ] as const)(
    "fails open and freezes the %s projection output",
    (_name, projectionInput, expected) => {
      const outcome = projectContentLayout(projectionInput);

      expect(outcome).toEqual(expected);
      expectFrozenProjectionUnavailable(outcome);
    },
  );

  it("does not mutate the projection input", () => {
    const directChildIds = [...CHILD_IDS];
    const projectionInput = input({
      contentLayout: SEQUENCE,
      directChildIds,
      activeChildId: CHILD_IDS[1],
    });
    const inputBeforeProjection = {
      ...projectionInput,
      directChildIds: [...projectionInput.directChildIds],
    };

    projectContentLayout(projectionInput);

    expect(projectionInput).toEqual(inputBeforeProjection);
    expect(directChildIds).toEqual(CHILD_IDS);
  });

  it.each([
    ["Flow", input({ contentLayout: FLOW, directChildIds: CHILD_IDS, activeChildId: null })],
    ["empty Sequence", input({ contentLayout: SEQUENCE, directChildIds: [], activeChildId: null })],
    [
      "projected Sequence",
      input({
        contentLayout: SEQUENCE,
        directChildIds: CHILD_IDS,
        activeChildId: CHILD_IDS[1],
      }),
    ],
    [
      "projection-unavailable",
      input({ contentLayout: SEQUENCE, directChildIds: CHILD_IDS, activeChildId: null }),
    ],
  ] as const)("freezes every newly-created %s output value", (_name, projectionInput) => {
    const outcome = projectContentLayout(projectionInput);

    expect(Object.isFrozen(outcome)).toBe(true);

    if (outcome.kind === "projection-unavailable") {
      expect(Object.isFrozen(outcome.issue)).toBe(true);
      return;
    }

    expect(Object.isFrozen(outcome.childStates)).toBe(true);
    for (const state of outcome.childStates) {
      expect(Object.isFrozen(state)).toBe(true);
    }
  });
});

function input(overrides: Partial<ContentLayoutProjectionInput>): ContentLayoutProjectionInput {
  return {
    containerId: CONTAINER_ID,
    contentLayout: FLOW,
    directChildIds: [],
    activeChildId: null,
    ...overrides,
  };
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}

function normalState(childId: EmbeddedNodeId): DirectChildContentLayoutState {
  return {
    childId,
    availability: "normal",
    layoutParticipation: "normal",
    interaction: "enabled",
    accessibility: "exposed",
  };
}

function availableState(childId: EmbeddedNodeId): DirectChildContentLayoutState {
  return {
    childId,
    availability: "available",
    layoutParticipation: "shared-position",
    interaction: "enabled",
    accessibility: "exposed",
  };
}

function withheldState(childId: EmbeddedNodeId): DirectChildContentLayoutState {
  return {
    childId,
    availability: "withheld",
    layoutParticipation: "shared-position",
    interaction: "inert",
    accessibility: "hidden",
  };
}

function expectFrozenProjectionUnavailable(outcome: ContentLayoutProjectionOutcome): void {
  expect(outcome.kind).toBe("projection-unavailable");
  if (outcome.kind !== "projection-unavailable") return;

  expect(Object.isFrozen(outcome)).toBe(true);
  expect(Object.isFrozen(outcome.issue)).toBe(true);
  expect(outcome).not.toHaveProperty("childStates");
}
