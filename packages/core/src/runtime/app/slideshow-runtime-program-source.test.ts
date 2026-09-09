import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { CompiledSurfaceLearnerInteractionProgram } from "@/learner-interaction/model";
import type { CompiledSurfacePresentationTimeline } from "@/presentation/model";

import { createSlideshowRuntimeProgramSource } from "./slideshow-runtime-program-source";

const FIRST_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const SECOND_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00002");
const THIRD_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00003");

describe("createSlideshowRuntimeProgramSource", () => {
  it("returns undefined when neither sibling has a Surface fragment", () => {
    const source = createSlideshowRuntimeProgramSource({});

    expect(source(FIRST_SURFACE_ID)).toBeUndefined();
  });

  it("returns an Interaction-only Surface fragment", () => {
    const learnerInteractions = learnerProgram(FIRST_SURFACE_ID);
    const source = createSlideshowRuntimeProgramSource({
      learnerInteractions: new Map([[FIRST_SURFACE_ID, learnerInteractions]]),
    });

    expect(source(FIRST_SURFACE_ID)).toEqual({ learnerInteractions });
  });

  it("returns a Presentation-only Surface fragment", () => {
    const timeline = presentationTimeline(FIRST_SURFACE_ID);
    const source = createSlideshowRuntimeProgramSource({
      presentation: { autoAdvance: true, surfaceById: new Map([[FIRST_SURFACE_ID, timeline]]) },
    });

    expect(source(FIRST_SURFACE_ID)).toEqual({ presentation: { timeline, autoAdvance: true } });
  });

  it("merges both siblings for one Surface without fabricating different coverage", () => {
    const timeline = presentationTimeline(FIRST_SURFACE_ID);
    const learnerInteractions = learnerProgram(FIRST_SURFACE_ID);
    const secondLearnerInteractions = learnerProgram(SECOND_SURFACE_ID);
    const secondTimeline = presentationTimeline(THIRD_SURFACE_ID);
    const source = createSlideshowRuntimeProgramSource({
      presentation: {
        autoAdvance: false,
        surfaceById: new Map([
          [FIRST_SURFACE_ID, timeline],
          [THIRD_SURFACE_ID, secondTimeline],
        ]),
      },
      learnerInteractions: new Map([
        [FIRST_SURFACE_ID, learnerInteractions],
        [SECOND_SURFACE_ID, secondLearnerInteractions],
      ]),
    });

    expect(source(FIRST_SURFACE_ID)).toEqual({
      presentation: { timeline, autoAdvance: false },
      learnerInteractions,
    });
    expect(source(SECOND_SURFACE_ID)).toEqual({ learnerInteractions: secondLearnerInteractions });
    expect(source(THIRD_SURFACE_ID)).toEqual({
      presentation: { timeline: secondTimeline, autoAdvance: false },
    });
  });
});

function learnerProgram(
  surfaceId: typeof FIRST_SURFACE_ID,
): CompiledSurfaceLearnerInteractionProgram {
  return Object.freeze({ surfaceId, rulesByEvent: new Map() });
}

function presentationTimeline(
  surfaceId: typeof FIRST_SURFACE_ID,
): CompiledSurfacePresentationTimeline {
  return Object.freeze({
    surfaceId,
    durationMs: 1_000,
    transition: null,
    layerTracks: Object.freeze([]),
    layerTrackByOwnerId: new Map(),
    cues: [],
    waits: [],
    visualProgram: {
      surfaceId,
      durationMs: 1_000,
      targetById: new Map(),
      segments: [],
    },
  });
}
