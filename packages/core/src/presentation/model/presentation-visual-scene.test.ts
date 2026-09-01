import { EmbeddedDataIdSchema, EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { CompiledSurfacePresentationVisualProgram } from "./compiled-presentation-program";
import { sceneAt } from "./presentation-visual-scene";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const TARGET_ID = EmbeddedNodeIdSchema.parse("target000001");

describe("sceneAt", () => {
  it.each([
    {
      timeMs: 499,
      availability: "withheld",
      layoutParticipation: "none",
      paint: { kind: "none" },
    },
    {
      timeMs: 500,
      availability: "available",
      layoutParticipation: "normal",
      paint: { kind: "transition", progress: 0 },
    },
    {
      timeMs: 750,
      availability: "available",
      layoutParticipation: "normal",
      paint: { kind: "transition", progress: 0.5 },
    },
    {
      timeMs: 1_000,
      availability: "available",
      layoutParticipation: "normal",
      paint: { kind: "settled" },
    },
  ])(
    "projects Reveal state at $timeMs ms",
    ({ timeMs, availability, layoutParticipation, paint }) => {
      const state = sceneAt(revealProgram(), timeMs, "normal").targetStates.get(TARGET_ID);

      expect(state).toMatchObject({ availability, layoutParticipation, paint });
    },
  );

  it("reconstructs direct forward and backward seek without projector history", () => {
    const program = revealProgram();

    const after = sceneAt(program, 1_000, "normal");
    const before = sceneAt(program, 0, "normal");
    const afterAgain = sceneAt(program, 1_000, "normal");

    expect(before.targetStates.get(TARGET_ID)?.availability).toBe("withheld");
    expect(afterAgain).toEqual(after);
    expect(afterAgain).not.toBe(after);
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
    expect(sceneAt(revealProgram(), 500, "reduced-motion").targetStates.get(TARGET_ID)).toMatchObject(
      {
        availability: "available",
        paint: { kind: "settled" },
      },
    );
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
      [
        TARGET_ID,
        { targetId: TARGET_ID, initialVisibility: "withheld" as const },
      ],
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
    sequenceContainers: [],
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
