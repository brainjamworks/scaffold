import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  type VisibilityTransitionV1,
} from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { CompiledSurfacePresentationVisualProgram } from "./compiled-presentation-program";
import { sceneAt } from "./presentation-visual-scene";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const TARGET_ID = EmbeddedNodeIdSchema.parse("target000001");
const VISIBILITY_RECIPES: readonly VisibilityTransitionV1[] = [
  timedTransition("fade"),
  timedTransition("scale"),
  ...(["slide", "float", "wipe"] as const).flatMap((kind) =>
    (["up", "right", "down", "left"] as const).map((direction) => timedTransition(kind, direction)),
  ),
];

describe("sceneAt", () => {
  it.each([
    {
      timeMs: 499,
      availability: "withheld",
      paint: { kind: "none" },
    },
    {
      timeMs: 500,
      availability: "available",
      paint: { kind: "transition", progress: 0 },
    },
    {
      timeMs: 750,
      availability: "available",
      paint: { kind: "transition", progress: 0.5 },
    },
    {
      timeMs: 1_000,
      availability: "available",
      paint: { kind: "settled" },
    },
  ])("projects Reveal state at $timeMs ms", ({ timeMs, availability, paint }) => {
    const state = sceneAt(revealProgram(), timeMs, "normal").targetStates.get(TARGET_ID);

    expect(state).toMatchObject({ availability, paint });
  });

  it("reconstructs direct forward and backward seek without projector history", () => {
    const program = revealProgram();

    const after = sceneAt(program, 1_000, "normal");
    const before = sceneAt(program, 0, "normal");
    const afterAgain = sceneAt(program, 1_000, "normal");

    expect(before.targetStates.get(TARGET_ID)?.availability).toBe("withheld");
    expect(afterAgain).toEqual(after);
    expect(afterAgain).not.toBe(after);
  });

  it.each(
    (["reveal", "hide"] as const).flatMap((kind) =>
      VISIBILITY_RECIPES.map((transition) => ({ kind, transition })),
    ),
  )(
    "projects $kind $transition.kind/$transition.direction at every boundary",
    ({ kind, transition }) => {
      const program = visibilityProgram(kind, transition);
      const before = sceneAt(program, 499, "normal").targetStates.get(TARGET_ID);
      const start = sceneAt(program, 500, "normal").targetStates.get(TARGET_ID);
      const middle = sceneAt(program, 750, "normal").targetStates.get(TARGET_ID);
      const settled = sceneAt(program, 1_000, "normal").targetStates.get(TARGET_ID);

      expect(before).toMatchObject(
        kind === "reveal"
          ? { availability: "withheld", paint: { kind: "none" } }
          : {
              availability: "available",
              paint: { kind: "settled" },
            },
      );
      expect(start).toMatchObject({
        availability: kind === "reveal" ? "available" : "withheld",
        paint: { kind: "transition", progress: 0, visual: { kind, transition } },
      });
      expect(middle).toMatchObject({
        paint: { kind: "transition", progress: 0.5, visual: { kind, transition } },
      });
      expect(settled).toMatchObject(
        kind === "reveal"
          ? { availability: "available", paint: { kind: "settled" } }
          : { availability: "withheld", paint: { kind: "none" } },
      );
      expect(sceneAt(program, 500, "normal")).toEqual(sceneAt(program, 500, "normal"));
    },
  );

  it.each(["reveal", "hide"] as const)("applies instant %s at its exact boundary", (kind) => {
    const program = visibilityProgram(kind, { kind: "instant" });

    expect(sceneAt(program, 499, "normal").targetStates.get(TARGET_ID)?.availability).toBe(
      kind === "reveal" ? "withheld" : "available",
    );
    expect(sceneAt(program, 500, "normal").targetStates.get(TARGET_ID)).toMatchObject(
      kind === "reveal"
        ? { availability: "available", paint: { kind: "settled" } }
        : { availability: "withheld", paint: { kind: "none" } },
    );
  });

  it.each(["outline", "pulse"] as const)(
    "projects temporary %s emphasis and returns to baseline",
    (effect) => {
      const program = emphasizeProgram(effect);

      expect(sceneAt(program, 499, "normal").targetStates.get(TARGET_ID)?.paint).toEqual({
        kind: "settled",
      });
      expect(sceneAt(program, 750, "normal").targetStates.get(TARGET_ID)?.paint).toMatchObject({
        kind: "transition",
        progress: 0.5,
        visual: { kind: "emphasize", effect },
      });
      expect(sceneAt(program, 1_000, "normal").targetStates.get(TARGET_ID)?.paint).toEqual({
        kind: "settled",
      });
    },
  );

  it("keeps a target withheld when a later emphasis becomes active and settles", () => {
    const program = hiddenEmphasizeProgram();

    for (const timeMs of [1_250, 1_500]) {
      const state = sceneAt(program, timeMs, "normal").targetStates.get(TARGET_ID);
      expect(state).toMatchObject({ availability: "withheld", paint: { kind: "none" } });
      expect(sceneAt(program, timeMs, "normal")).toEqual(sceneAt(program, timeMs, "normal"));
    }
  });

  it("uses instant semantic results and a static outline substitute under reduced motion", () => {
    expect(
      sceneAt(
        visibilityProgram("hide", timedTransition("slide", "left")),
        500,
        "reduced-motion",
      ).targetStates.get(TARGET_ID),
    ).toMatchObject({
      availability: "withheld",
      paint: { kind: "none" },
    });
    expect(
      sceneAt(emphasizeProgram("pulse"), 750, "reduced-motion").targetStates.get(TARGET_ID)?.paint,
    ).toMatchObject({
      kind: "transition",
      visual: { kind: "emphasize", effect: "outline" },
    });
  });

  it("applies adjacent instant actions in stable segment order", () => {
    const program = revealProgram({
      segments: [
        instant("instant00001", "reveal", 500),
        instant("instant00002", "hide", 500),
        instant("instant00003", "reveal", 500),
      ],
    });

    expect(sceneAt(program, 499, "normal").targetStates.get(TARGET_ID)?.availability).toBe(
      "withheld",
    );
    expect(sceneAt(program, 500, "normal").targetStates.get(TARGET_ID)).toMatchObject({
      availability: "available",
      paint: { kind: "settled" },
    });
  });

  it("substitutes a settled boundary result in reduced-motion mode", () => {
    expect(
      sceneAt(revealProgram(), 500, "reduced-motion").targetStates.get(TARGET_ID),
    ).toMatchObject({
      availability: "available",
      paint: { kind: "settled" },
    });
  });

  it.each([-1, 1.5, 2_001, Number.MAX_SAFE_INTEGER + 1])(
    "throws for invalid scene time %s",
    (timeMs) => {
      expect(() => sceneAt(revealProgram(), timeMs, "normal")).toThrow(/time/i);
    },
  );

  it("throws for unknown targets and overlapping same-target segments", () => {
    const unknownTarget = EmbeddedNodeIdSchema.parse("unknown00001");
    expect(() =>
      sceneAt(
        revealProgram({
          segments: [
            {
              ...revealProgram().segments[0]!,
              targetId: unknownTarget,
            },
          ],
        }),
        750,
        "normal",
      ),
    ).toThrow(/unknown target/i);

    expect(() =>
      sceneAt(
        revealProgram({
          segments: [
            revealProgram().segments[0]!,
            {
              ...revealProgram().segments[0]!,
              id: EmbeddedDataIdSchema.parse("segment00002"),
              startMs: 750,
              endMs: 1_250,
            },
          ],
        }),
        750,
        "normal",
      ),
    ).toThrow(/overlap/i);
  });
});

function revealProgram(
  overrides: Partial<CompiledSurfacePresentationVisualProgram> = {},
): CompiledSurfacePresentationVisualProgram {
  return {
    surfaceId: SURFACE_ID,
    durationMs: 2_000,
    targetById: new Map([
      [TARGET_ID, { targetId: TARGET_ID, initialVisibility: "withheld" as const }],
    ]),
    segments: [
      {
        id: EmbeddedDataIdSchema.parse("segment00001"),
        targetId: TARGET_ID,
        startMs: 500,
        endMs: 1_000,
        visual: {
          kind: "reveal",
          transition: {
            kind: "fade",
            durationMs: 500,
            easing: { kind: "preset", preset: "linear" },
          },
        },
      },
    ],
    ...overrides,
  };
}

function instant(id: string, kind: "reveal" | "hide", atMs: number) {
  return {
    id: EmbeddedDataIdSchema.parse(id),
    targetId: TARGET_ID,
    startMs: atMs,
    endMs: atMs,
    visual: { kind, transition: { kind: "instant" as const } },
  } as const;
}

function timedTransition(
  kind: "fade" | "scale" | "slide" | "float" | "wipe",
  direction?: "up" | "right" | "down" | "left",
): VisibilityTransitionV1 {
  const timed = {
    kind,
    durationMs: 500,
    easing: { kind: "preset" as const, preset: "linear" as const },
  };
  return (
    direction ? { ...timed, kind: kind as "slide" | "float" | "wipe", direction } : timed
  ) as VisibilityTransitionV1;
}

function visibilityProgram(
  kind: "reveal" | "hide",
  transition: VisibilityTransitionV1,
): CompiledSurfacePresentationVisualProgram {
  return revealProgram({
    targetById: new Map([
      [
        TARGET_ID,
        { targetId: TARGET_ID, initialVisibility: kind === "reveal" ? "withheld" : "visible" },
      ],
    ]),
    segments: [
      {
        id: EmbeddedDataIdSchema.parse("visual000001"),
        targetId: TARGET_ID,
        startMs: 500,
        endMs: transition.kind === "instant" ? 500 : 1_000,
        visual: { kind, transition },
      },
    ],
  });
}

function emphasizeProgram(effect: "outline" | "pulse"): CompiledSurfacePresentationVisualProgram {
  return revealProgram({
    targetById: new Map([[TARGET_ID, { targetId: TARGET_ID, initialVisibility: "visible" }]]),
    segments: [
      {
        id: EmbeddedDataIdSchema.parse("emphasize001"),
        targetId: TARGET_ID,
        startMs: 500,
        endMs: 1_000,
        visual: {
          kind: "emphasize",
          durationMs: 500,
          easing: { kind: "preset", preset: "linear" },
          effect,
        },
      },
    ],
  });
}

function hiddenEmphasizeProgram(): CompiledSurfacePresentationVisualProgram {
  const effect = {
    id: EmbeddedDataIdSchema.parse("hiddenemph01"),
    targetId: TARGET_ID,
    startMs: 1_000,
    endMs: 1_500,
    visual: {
      kind: "emphasize" as const,
      durationMs: 500,
      easing: { kind: "preset" as const, preset: "linear" as const },
      effect: "pulse" as const,
    },
  };
  return revealProgram({
    targetById: new Map([[TARGET_ID, { targetId: TARGET_ID, initialVisibility: "visible" }]]),
    segments: [instant("hide00000001", "hide", 500), effect],
  });
}
