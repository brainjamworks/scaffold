// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createAudioRuntimeController } from "./audio-runtime-controller";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Audio runtime controller", () => {
  it("commits learner play, pause and natural completion only after native confirmation", async () => {
    const media = createTestAudio();
    const controller = createAudioRuntimeController();
    controller.attach(media.audio, "source-a");
    const commits: unknown[] = [];
    controller.subscribeToCommits((commit) => {
      commits.push({ commit, status: controller.getStatus() });
    });

    const play = controller.play("learner", new AbortController().signal);
    expect(controller.getStatus()).toBe("idle");
    expect(commits).toEqual([]);
    media.confirmPlay();
    await expect(play).resolves.toEqual({ kind: "success" });
    expect(commits).toEqual([{ commit: { type: "played", origin: "learner" }, status: "playing" }]);

    const pause = controller.pause("learner", new AbortController().signal);
    expect(controller.getStatus()).toBe("playing");
    media.confirmPause();
    await expect(pause).resolves.toEqual({ kind: "success" });
    expect(commits.at(-1)).toEqual({
      commit: { type: "paused", origin: "learner" },
      status: "paused",
    });

    const resume = controller.play("learner", new AbortController().signal);
    media.confirmPlay();
    await resume;
    media.confirmEnded();
    expect(commits.at(-1)).toEqual({
      commit: { type: "ended", origin: "learner" },
      status: "ended",
    });
  });

  it("keeps programmatic confirmation observable but idempotent and source reset silent", async () => {
    const first = createTestAudio();
    const controller = createAudioRuntimeController();
    const detach = controller.attach(first.audio, "source-a");
    const commits: unknown[] = [];
    controller.subscribeToCommits((commit) => commits.push(commit));

    await expect(
      controller.pause("control-command", new AbortController().signal),
    ).resolves.toEqual({ kind: "success" });
    expect(first.pause).not.toHaveBeenCalled();

    const play = controller.play("control-command", new AbortController().signal);
    first.confirmPlay();
    await expect(play).resolves.toEqual({ kind: "success" });
    await expect(controller.play("control-command", new AbortController().signal)).resolves.toEqual(
      { kind: "success" },
    );
    expect(first.play).toHaveBeenCalledOnce();

    const pause = controller.pause("control-command", new AbortController().signal);
    first.confirmPause();
    await expect(pause).resolves.toEqual({ kind: "success" });
    await controller.pause("control-command", new AbortController().signal);
    expect(first.pause).toHaveBeenCalledOnce();
    expect(commits).toEqual([
      { type: "played", origin: "control-command" },
      { type: "paused", origin: "control-command" },
    ]);

    detach();
    const second = createTestAudio();
    controller.attach(second.audio, "source-b");
    expect(controller.getStatus()).toBe("idle");
    expect(commits).toHaveLength(2);
  });

  it("waits for metadata and native seeking before validating and confirming seconds", async () => {
    const media = createTestAudio();
    media.native.duration = Number.NaN;
    const controller = createAudioRuntimeController();
    controller.attach(media.audio, "source-a");
    const commits: unknown[] = [];
    controller.subscribeToCommits((commit) => commits.push(commit));

    const outsideRange = controller.seekTo(61, "control-command", new AbortController().signal);
    expect(media.currentTimeAssignments).toEqual([]);
    media.native.duration = 60;
    media.audio.dispatchEvent(new Event("loadedmetadata"));
    await expect(outsideRange).resolves.toEqual({
      kind: "seek-out-of-range",
      requestedSeconds: 61,
      durationSeconds: 60,
    });

    let settled = false;
    const seek = controller.seekTo(30, "control-command", new AbortController().signal);
    void seek.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(media.currentTimeAssignments).toEqual([30]);
    expect(settled).toBe(false);
    media.audio.dispatchEvent(new Event("seeked"));
    await expect(seek).resolves.toEqual({ kind: "success" });
    expect(controller.getStatus()).toBe("idle");
    expect(commits).toEqual([]);

    const preAborted = new AbortController();
    preAborted.abort();
    await expect(controller.seekTo(10, "control-command", preAborted.signal)).resolves.toEqual({
      kind: "cancelled",
    });
    const midFlight = new AbortController();
    const cancelled = controller.seekTo(20, "control-command", midFlight.signal);
    midFlight.abort();
    await expect(cancelled).resolves.toEqual({ kind: "cancelled" });
  });

  it("classifies demonstrated native play failures and rethrows unknown defects", async () => {
    const media = createTestAudio();
    const controller = createAudioRuntimeController();
    controller.attach(media.audio, "source-a");

    media.play.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
    await expect(controller.play("control-command", new AbortController().signal)).resolves.toEqual(
      { kind: "playback-not-allowed" },
    );

    media.native.error = { code: 4 } as MediaError;
    media.play.mockRejectedValueOnce(new DOMException("unsupported", "NotSupportedError"));
    await expect(controller.play("control-command", new AbortController().signal)).resolves.toEqual(
      { kind: "media-unavailable", mediaErrorCode: 4 },
    );

    const defect = new Error("broken play implementation");
    media.play.mockImplementationOnce(() => {
      throw defect;
    });
    await expect(controller.play("control-command", new AbortController().signal)).rejects.toBe(
      defect,
    );
  });

  it("cancels in-flight playback without misclassifying its later native confirmation", async () => {
    const media = createTestAudio();
    const controller = createAudioRuntimeController();
    controller.attach(media.audio, "source-a");
    const commits: unknown[] = [];
    controller.subscribeToCommits((commit) => commits.push(commit));
    const abort = new AbortController();

    const play = controller.play("control-command", abort.signal);
    abort.abort();
    await expect(play).resolves.toEqual({ kind: "cancelled" });
    media.confirmPlay();

    expect(controller.getStatus()).toBe("playing");
    expect(commits).toEqual([{ type: "played", origin: "reconciliation" }]);
  });

  it("keeps metadata failure typed and contradictory native seek confirmation observable", async () => {
    const media = createTestAudio();
    media.native.duration = Number.NaN;
    const controller = createAudioRuntimeController();
    controller.attach(media.audio, "source-a");

    const unavailable = controller.seekTo(10, "control-command", new AbortController().signal);
    media.native.error = { code: 3 } as MediaError;
    media.audio.dispatchEvent(new Event("error"));
    await expect(unavailable).resolves.toEqual({ kind: "media-unavailable", mediaErrorCode: 3 });

    media.native.error = null;
    media.native.duration = 60;
    const contradictory = controller.seekTo(20, "control-command", new AbortController().signal);
    media.native.currentTime = 19;
    media.audio.dispatchEvent(new Event("seeked"));
    await expect(contradictory).rejects.toThrow(
      "Audio native authority confirmed a contradictory seek position.",
    );
  });
});

function createTestAudio() {
  const audio = document.createElement("audio");
  const native = {
    currentTime: 0,
    duration: 120,
    ended: false,
    error: null as MediaError | null,
    paused: true,
  };
  const currentTimeAssignments: number[] = [];
  Object.defineProperties(audio, {
    currentTime: {
      configurable: true,
      get: () => native.currentTime,
      set: (value: number) => {
        native.currentTime = value;
        currentTimeAssignments.push(value);
      },
    },
    duration: { configurable: true, get: () => native.duration },
    ended: { configurable: true, get: () => native.ended },
    error: { configurable: true, get: () => native.error },
    paused: { configurable: true, get: () => native.paused },
  });
  const play = vi.fn(async () => undefined);
  Object.defineProperty(audio, "play", {
    configurable: true,
    value: play,
  });
  const pause = vi.fn(() => undefined);
  Object.defineProperty(audio, "pause", {
    configurable: true,
    value: pause,
  });

  return {
    audio,
    currentTimeAssignments,
    native,
    pause,
    play,
    confirmPlay() {
      native.paused = false;
      native.ended = false;
      audio.dispatchEvent(new Event("play"));
    },
    confirmPause() {
      native.paused = true;
      audio.dispatchEvent(new Event("pause"));
    },
    confirmEnded() {
      native.paused = true;
      native.ended = true;
      audio.dispatchEvent(new Event("ended"));
    },
  };
}
