import type { CompiledSurfaceLearnerInteractionProgram } from "@/learner-interaction/model";
import type {
  CompiledPresentationPlaybackProgram,
  CompiledSurfacePresentationTimeline,
} from "@/presentation/model";
import type {
  SlideshowSurfaceRuntimeProgram,
  SlideshowSurfaceRuntimeProgramSource,
} from "@/runtime/players/slideshow/slideshow-surface-runtime-composition";

export function createSlideshowRuntimeProgramSource({
  presentation,
  learnerInteractions,
}: {
  readonly presentation?: Pick<CompiledPresentationPlaybackProgram, "autoAdvance" | "surfaceById">;
  readonly learnerInteractions?: ReadonlyMap<
    CompiledSurfaceLearnerInteractionProgram["surfaceId"],
    CompiledSurfaceLearnerInteractionProgram
  >;
}): SlideshowSurfaceRuntimeProgramSource {
  return (surfaceId) => {
    const timeline: CompiledSurfacePresentationTimeline | undefined =
      presentation?.surfaceById.get(surfaceId);
    const presentationFragment =
      timeline && presentation ? { timeline, autoAdvance: presentation.autoAdvance } : undefined;
    const interactionProgram = learnerInteractions?.get(surfaceId);
    if (!presentationFragment && !interactionProgram) return undefined;

    const program: SlideshowSurfaceRuntimeProgram = {
      ...(presentationFragment ? { presentation: presentationFragment } : {}),
      ...(interactionProgram ? { learnerInteractions: interactionProgram } : {}),
    };
    return Object.freeze(program);
  };
}
