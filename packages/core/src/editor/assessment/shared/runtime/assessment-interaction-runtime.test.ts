import { describe, expect, it } from "vite-plus/test";

import type { ProblemScope } from "./use-assessment-runtime";
import {
  choiceStateForProblem,
  createSpatialPlacementInteractionRuntime,
} from "./assessment-interaction-runtime";

describe("choiceStateForProblem", () => {
  it("marks selected multiselect choices correct when the submitted overall result is correct", () => {
    const problem = {
      answerKeyVisible: false,
      feedbackResult: null,
      officialResult: { isCorrect: true, score: { scaled: 1 }, feedback: null, items: {} },
      state: { submitted: true, revealedAnswer: null },
    } as ProblemScope;

    expect(
      choiceStateForProblem({
        choiceId: "a",
        kind: "multi-select",
        problem,
        selected: new Set(["a", "b"]),
      }),
    ).toBe("correct");
  });
});

describe("spatial-placement interaction runtime", () => {
  const interaction = {
    kind: "spatial-placement" as const,
    markers: [
      { id: "marker000001" as const, label: "London" },
      { id: "marker000002" as const, label: "Paris" },
    ],
  };

  it("immutably places, replaces, removes and resets through whole-response writes", () => {
    const source = { placements: { marker000001: { x: 10, y: 20 } } };
    const writes: unknown[] = [];
    const runtime = createSpatialPlacementInteractionRuntime({
      interaction,
      locked: false,
      response: source,
      replaceResponse: (response) => {
        writes.push(response);
        return true;
      },
    });

    expect(runtime.setPlacement("marker000001", { x: 30, y: 40 })).toEqual({
      status: "updated",
    });
    expect(runtime.setPlacement("marker000002", { x: 50, y: 60 })).toEqual({
      status: "updated",
    });
    expect(runtime.removePlacement("marker000001")).toEqual({ status: "updated" });
    expect(runtime.resetPlacements()).toEqual({ status: "updated" });
    expect(writes).toEqual([
      { placements: { marker000001: { x: 30, y: 40 } } },
      {
        placements: {
          marker000001: { x: 10, y: 20 },
          marker000002: { x: 50, y: 60 },
        },
      },
      { placements: {} },
      { placements: {} },
    ]);
    expect(source).toEqual({ placements: { marker000001: { x: 10, y: 20 } } });
  });

  it("returns typed lock and unavailable outcomes without masking invariant defects", () => {
    const replaceResponse = () => false;
    const locked = createSpatialPlacementInteractionRuntime({
      interaction,
      locked: true,
      response: { placements: {} },
      replaceResponse,
    });
    const unavailable = createSpatialPlacementInteractionRuntime({
      interaction,
      locked: false,
      response: { placements: {} },
      replaceResponse,
    });

    expect(locked.setPlacement("marker000001", { x: 25, y: 75 })).toEqual({
      status: "attempt-locked",
    });
    expect(locked.removePlacement("marker000001")).toEqual({ status: "attempt-locked" });
    expect(locked.resetPlacements()).toEqual({ status: "attempt-locked" });
    expect(unavailable.setPlacement("marker000001", { x: 25, y: 75 })).toEqual({
      status: "unavailable",
    });
    expect(() => unavailable.setPlacement("marker999999", { x: 25, y: 75 })).toThrow(
      'unknown marker "marker999999"',
    );
    expect(() => unavailable.setPlacement("marker000001", { x: Number.NaN, y: 75 })).toThrow();
  });
});
