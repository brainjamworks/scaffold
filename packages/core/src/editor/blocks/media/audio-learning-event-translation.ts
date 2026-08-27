import type { LearningEventReporter } from "@/runtime/learning-events/LearningEventRuntimeProvider";

import type { AudioPlaybackCommit } from "./audio-runtime-controller";

interface CreateAudioLearningEventConsumerInput {
  readonly report: LearningEventReporter["report"];
  readonly resourceId: string;
}

/** Applies Audio's governed, once-only Learning Event policy to committed learner occurrences. */
export function createAudioLearningEventConsumer({
  report,
  resourceId,
}: CreateAudioLearningEventConsumerInput): (commit: AudioPlaybackCommit) => void {
  let attempted = false;
  let completed = false;

  return (commit) => {
    if (commit.origin !== "learner") return;
    if (commit.type === "played" && !attempted) {
      try {
        report({ type: "resource.attempted", resourceId, resourceKind: "audio" });
        attempted = true;
      } catch {
        // Learning reporting is observational and cannot affect playback or Control Events.
      }
      return;
    }
    if (commit.type === "ended" && !completed) {
      try {
        report({ type: "resource.completed", resourceId, resourceKind: "audio" });
        completed = true;
      } catch {
        // Learning reporting is observational and cannot affect playback or Control Events.
      }
    }
  };
}
