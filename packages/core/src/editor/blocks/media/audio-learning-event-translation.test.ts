// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vite-plus/test";

import { createAudioLearningEventConsumer } from "./audio-learning-event-translation";

describe("Audio Learning Event translation", () => {
  it("deduplicates learner attempted and completed independently from repeatable Control events", () => {
    const report = vi.fn();
    const consume = createAudioLearningEventConsumer({
      report,
      resourceId: "audioOwner001",
    });

    consume({ type: "played", origin: "learner" });
    consume({ type: "paused", origin: "learner" });
    consume({ type: "played", origin: "learner" });
    consume({ type: "ended", origin: "learner" });
    consume({ type: "ended", origin: "learner" });
    consume({ type: "played", origin: "control-command" });
    consume({ type: "ended", origin: "reconciliation" });

    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenNthCalledWith(1, {
      type: "resource.attempted",
      resourceId: "audioOwner001",
      resourceKind: "audio",
    });
    expect(report).toHaveBeenNthCalledWith(2, {
      type: "resource.completed",
      resourceId: "audioOwner001",
      resourceKind: "audio",
    });
  });

  it("contains reporter failure and retries that governed occurrence later", () => {
    const report = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("learning port unavailable");
      })
      .mockImplementation(() => undefined);
    const consume = createAudioLearningEventConsumer({
      report,
      resourceId: "audioOwner001",
    });

    expect(() => consume({ type: "played", origin: "learner" })).not.toThrow();
    expect(() => consume({ type: "played", origin: "learner" })).not.toThrow();
    consume({ type: "played", origin: "learner" });

    expect(report).toHaveBeenCalledTimes(2);
  });
});
