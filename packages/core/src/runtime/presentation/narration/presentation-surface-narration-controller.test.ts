// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema, type MediaSource } from "@scaffold/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createPresentationSurfaceNarrationController,
  type PresentationSurfaceNarrationSnapshot,
} from "./presentation-surface-narration-controller";

const surfaceId = EmbeddedNodeIdSchema.parse("surface00001");
const externalSource = {
  mode: "external",
  src: "https://media.example.test/narration.mp3",
} satisfies MediaSource;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PresentationSurfaceNarrationController", () => {
  it("loads, controls and observes one Surface narration from confirmed media state", async () => {
    const media = createTestAudio();
    const controller = createPresentationSurfaceNarrationController({
      surfaceId,
      mediaPort: null,
      createAudioElement: () => media.audio,
    });
    const snapshots: PresentationSurfaceNarrationSnapshot[] = [];
    controller.subscribe(() => snapshots.push(controller.getSnapshot()));

    const loading = controller.load({ source: externalSource });
    expect(controller.getSnapshot()).toEqual({
      status: "loading",
      currentTimeMs: 0,
      durationMs: null,
      error: null,
    });
    await vi.waitFor(() => expect(media.audio.src).toBe(externalSource.src));

    media.confirmMetadata(12.5);
    await expect(loading).resolves.toMatchObject({ isOk: expect.any(Function) });
    expect((await loading).isOk()).toBe(true);
    expect(controller.getSnapshot()).toEqual({
      status: "paused",
      currentTimeMs: 0,
      durationMs: 12_500,
      error: null,
    });

    const playing = controller.play();
    media.confirmPlay();
    await expect(playing).resolves.toMatchObject({ isOk: expect.any(Function) });
    expect((await playing).isOk()).toBe(true);
    media.confirmTime(2.25);
    expect(controller.getSnapshot()).toMatchObject({ status: "playing", currentTimeMs: 2_250 });
    media.native.currentTime = 2.75;
    expect(controller.getClockTimeMs()).toBe(2_750);
    expect(controller.getSnapshot()).toMatchObject({ currentTimeMs: 2_250 });

    controller.pause();
    expect(media.pause).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({ status: "paused", currentTimeMs: 2_750 });

    const seeking = controller.seek(8_000);
    expect(controller.getSnapshot()).toMatchObject({ status: "seeking", currentTimeMs: 2_750 });
    expect(media.currentTimeAssignments).toEqual([8]);
    media.confirmSeek(8);
    expect((await seeking).isOk()).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ status: "paused", currentTimeMs: 8_000 });
    expect(snapshots.every(Object.isFrozen)).toBe(true);
  });

  it("resolves managed media and cancels a superseded load without mounting its late source", async () => {
    const firstResolution = deferred<string>();
    const mountedMedia = createTestAudio();
    const createAudioElement = vi.fn<() => HTMLAudioElement>(() => mountedMedia.audio);
    const resolve = vi.fn((mediaId: string) =>
      mediaId === "old" ? firstResolution.promise : Promise.resolve("https://cdn.test/new.mp3"),
    );
    const controller = createPresentationSurfaceNarrationController({
      surfaceId,
      mediaPort: { resolve },
      createAudioElement,
    });

    const oldLoad = controller.load({ source: { mode: "managed", mediaId: "old" } });
    const newLoad = controller.load({ source: { mode: "managed", mediaId: "new" } });
    await vi.waitFor(() => expect(createAudioElement).toHaveBeenCalledOnce());
    const cancelled = await oldLoad;
    if (cancelled.isOk()) throw new Error("Expected the superseded load to be cancelled.");
    expect(cancelled.error).toEqual({
      reason: "cancelled",
      surfaceId,
      operation: "load",
    });
    expect(createAudioElement).toHaveBeenCalledOnce();
    mountedMedia.confirmMetadata(20);
    expect((await newLoad).isOk()).toBe(true);

    firstResolution.resolve("https://cdn.test/old.mp3");
    await Promise.resolve();
    expect(createAudioElement).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({ currentTimeMs: 0, durationMs: 20_000 });
  });

  it("returns play cancellation facts when source replacement supersedes native play", async () => {
    const first = createTestAudio();
    const second = createTestAudio();
    const playCompletion = deferred<undefined>();
    first.play.mockReturnValueOnce(playCompletion.promise);
    const createAudioElement = vi
      .fn<() => HTMLAudioElement>()
      .mockReturnValueOnce(first.audio)
      .mockReturnValueOnce(second.audio);
    const controller = createPresentationSurfaceNarrationController({
      surfaceId,
      mediaPort: null,
      createAudioElement,
    });
    const loading = controller.load({ source: externalSource });
    await vi.waitFor(() => expect(first.audio.src).toBe(externalSource.src));
    first.confirmMetadata(10);
    await loading;

    const playing = controller.play();
    const replacement = controller.load({
      source: { mode: "external", src: "https://media.example.test/replacement.mp3" },
    });

    const result = await playing;
    if (result.isOk()) throw new Error("Expected the superseded play to be cancelled.");
    expect(result.error).toEqual({ reason: "cancelled", surfaceId, operation: "play" });
    playCompletion.resolve(undefined);
    await vi.waitFor(() => expect(createAudioElement).toHaveBeenCalledTimes(2));
    second.confirmMetadata(20);
    await replacement;
  });

  it("does not touch disposed media when a cancelled native play resolves late", async () => {
    const media = createTestAudio();
    const playCompletion = deferred<undefined>();
    media.play.mockReturnValueOnce(playCompletion.promise);
    const controller = createPresentationSurfaceNarrationController({
      surfaceId,
      mediaPort: null,
      createAudioElement: () => media.audio,
    });
    const loading = controller.load({ source: externalSource });
    await vi.waitFor(() => expect(media.audio.src).toBe(externalSource.src));
    media.confirmMetadata(10);
    await loading;

    const playing = controller.play();
    controller.dispose();
    const pauseCallsAfterDispose = media.pause.mock.calls.length;
    playCompletion.resolve(undefined);

    await expect(playing).resolves.toMatchObject({
      error: { reason: "cancelled", surfaceId, operation: "play" },
    });
    await Promise.resolve();
    expect(media.pause).toHaveBeenCalledTimes(pauseCallsAfterDispose);
  });

  it("returns seek cancellation facts when pause interrupts native seeking", async () => {
    const media = createTestAudio();
    const controller = createPresentationSurfaceNarrationController({
      surfaceId,
      mediaPort: null,
      createAudioElement: () => media.audio,
    });
    const loading = controller.load({ source: externalSource });
    await vi.waitFor(() => expect(media.audio.src).toBe(externalSource.src));
    media.confirmMetadata(10);
    await loading;

    const seeking = controller.seek(5_000);
    controller.pause();

    const result = await seeking;
    if (result.isOk()) throw new Error("Expected the interrupted seek to be cancelled.");
    expect(result.error).toEqual({ reason: "cancelled", surfaceId, operation: "seek" });
    const interruptedSnapshot = controller.getSnapshot();
    media.confirmSeek(5);
    expect(controller.getSnapshot()).toBe(interruptedSnapshot);
  });

  it("returns unavailable source facts and preserves its resolution cause outside snapshots", async () => {
    const cause = new Error("asset is missing");
    const controller = createPresentationSurfaceNarrationController({
      surfaceId,
      mediaPort: { resolve: vi.fn(async () => Promise.reject(cause)) },
      createAudioElement: () => createTestAudio().audio,
    });
    const source = { mode: "managed", mediaId: "missing" } as const;

    const result = await controller.load({ source });

    if (result.isOk()) throw new Error("Expected missing narration to be unavailable.");
    expect(result.error).toEqual({
      reason: "narration-unavailable",
      surfaceId,
      source,
      mediaErrorCode: null,
      cause,
    });
    expect(controller.getSnapshot()).toEqual({
      status: "failed",
      currentTimeMs: 0,
      durationMs: null,
      error: { reason: "narration-unavailable", mediaErrorCode: null },
    });
    expect(Object.isFrozen(controller.getSnapshot().error)).toBe(true);

    const play = await controller.play();
    if (play.isOk()) throw new Error("Expected unavailable narration to refuse play.");
    expect(play.error).toBe(result.error);
    const seek = await controller.seek(1_000);
    if (seek.isOk()) throw new Error("Expected unavailable narration to refuse seek.");
    expect(seek.error).toBe(result.error);
    expect(() => controller.pause()).not.toThrow();
  });

  it("classifies blocked play and keeps unknown play defects observable", async () => {
    const media = createTestAudio();
    const controller = createPresentationSurfaceNarrationController({
      surfaceId,
      mediaPort: null,
      createAudioElement: () => media.audio,
    });
    const loading = controller.load({ source: externalSource });
    await vi.waitFor(() => expect(media.audio.src).toBe(externalSource.src));
    media.confirmMetadata(30);
    await loading;
    const blocked = new DOMException("gesture required", "NotAllowedError");
    media.play.mockRejectedValueOnce(blocked);

    const refused = await controller.play();

    if (refused.isOk()) throw new Error("Expected native playback to be refused.");
    expect(refused.error).toEqual({ reason: "playback-not-allowed", surfaceId, cause: blocked });
    expect(controller.getSnapshot()).toMatchObject({
      status: "paused",
      error: { reason: "playback-not-allowed" },
    });

    const defect = new Error("broken audio implementation");
    media.play.mockRejectedValueOnce(defect);
    await expect(controller.play()).rejects.toBe(defect);
  });

  it("returns out-of-range and unsupported seek refusals with required facts", async () => {
    const media = createTestAudio();
    const controller = createPresentationSurfaceNarrationController({
      surfaceId,
      mediaPort: null,
      createAudioElement: () => media.audio,
    });
    const loading = controller.load({ source: externalSource });
    await vi.waitFor(() => expect(media.audio.src).toBe(externalSource.src));
    media.confirmMetadata(10);
    await loading;

    const outsideRange = await controller.seek(10_001);
    if (outsideRange.isOk()) throw new Error("Expected the seek to be out of range.");
    expect(outsideRange.error).toEqual({
      reason: "seek-out-of-range",
      surfaceId,
      requestedTimeMs: 10_001,
      durationMs: 10_000,
    });

    media.native.duration = Number.NaN;
    media.audio.dispatchEvent(new Event("durationchange"));
    const unsupported = await controller.seek(1_000);
    if (unsupported.isOk()) throw new Error("Expected seeking without duration to be unsupported.");
    expect(unsupported.error).toEqual({
      reason: "seek-unsupported",
      surfaceId,
      requestedTimeMs: 1_000,
      durationMs: null,
      cause: null,
    });
  });

  it("refuses seek with the loaded source facts after native media becomes unavailable", async () => {
    const media = createTestAudio();
    const controller = createPresentationSurfaceNarrationController({
      surfaceId,
      mediaPort: null,
      createAudioElement: () => media.audio,
    });
    const loading = controller.load({ source: externalSource });
    await vi.waitFor(() => expect(media.audio.src).toBe(externalSource.src));
    media.confirmMetadata(10);
    await loading;
    media.native.error = { code: 3 } as MediaError;
    media.audio.dispatchEvent(new Event("error"));

    const result = await controller.seek(1_000);

    if (result.isOk()) throw new Error("Expected unavailable narration to refuse seek.");
    expect(result.error).toEqual({
      reason: "narration-unavailable",
      surfaceId,
      source: externalSource,
      mediaErrorCode: 3,
      cause: null,
    });
  });

  it("detaches replacement and disposed media so stale events cannot publish", async () => {
    const first = createTestAudio();
    const second = createTestAudio();
    const createAudioElement = vi
      .fn<() => HTMLAudioElement>()
      .mockReturnValueOnce(first.audio)
      .mockReturnValueOnce(second.audio);
    const controller = createPresentationSurfaceNarrationController({
      surfaceId,
      mediaPort: null,
      createAudioElement,
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    const firstLoad = controller.load({ source: externalSource });
    await vi.waitFor(() => expect(first.audio.src).toBe(externalSource.src));
    first.confirmMetadata(15);
    await firstLoad;
    const firstPlay = controller.play();
    first.confirmPlay();
    await firstPlay;

    const secondLoad = controller.load({
      source: { mode: "external", src: "https://media.example.test/replacement.mp3" },
    });
    expect(first.pause).toHaveBeenCalledOnce();
    expect(first.audio.getAttribute("src")).toBeNull();
    await vi.waitFor(() => expect(createAudioElement).toHaveBeenCalledTimes(2));
    second.confirmMetadata(25);
    await secondLoad;
    const replacementSnapshot = controller.getSnapshot();
    first.confirmTime(12);
    first.audio.dispatchEvent(new Event("error"));
    expect(controller.getSnapshot()).toBe(replacementSnapshot);

    const secondPlay = controller.play();
    second.confirmPlay();
    await secondPlay;
    controller.dispose();
    controller.dispose();
    expect(second.pause).toHaveBeenCalledOnce();
    const callsAfterDispose = listener.mock.calls.length;
    second.confirmTime(13);
    second.audio.dispatchEvent(new Event("ended"));
    expect(listener).toHaveBeenCalledTimes(callsAfterDispose);
    expect(() => controller.play()).toThrow("Surface narration controller is disposed.");
  });
});

function createTestAudio() {
  const audio = document.createElement("audio");
  const native = {
    currentTime: 0,
    duration: Number.NaN,
    ended: false,
    error: null as MediaError | null,
    paused: true,
    readyState: 0,
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
    readyState: { configurable: true, get: () => native.readyState },
  });
  const load = vi.fn();
  Object.defineProperty(audio, "load", { configurable: true, value: load });
  const play = vi.fn(async () => undefined);
  Object.defineProperty(audio, "play", { configurable: true, value: play });
  const pause = vi.fn(() => {
    native.paused = true;
  });
  Object.defineProperty(audio, "pause", { configurable: true, value: pause });

  return {
    audio,
    currentTimeAssignments,
    load,
    native,
    pause,
    play,
    confirmMetadata(durationSeconds: number) {
      native.duration = durationSeconds;
      native.readyState = HTMLMediaElement.HAVE_METADATA;
      audio.dispatchEvent(new Event("loadedmetadata"));
    },
    confirmPlay() {
      native.paused = false;
      native.ended = false;
      audio.dispatchEvent(new Event("play"));
    },
    confirmTime(seconds: number) {
      native.currentTime = seconds;
      audio.dispatchEvent(new Event("timeupdate"));
    },
    confirmSeek(seconds: number) {
      native.currentTime = seconds;
      audio.dispatchEvent(new Event("seeked"));
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
