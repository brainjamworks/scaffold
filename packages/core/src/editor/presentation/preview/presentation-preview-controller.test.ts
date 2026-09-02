import { Result } from "better-result";
import type { EmbeddedNodeId, ScaffoldDocumentContent } from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type {
  PresentationPreviewDocument,
  PresentationPreviewLoadResult,
  PresentationPreviewPort,
  PresentationPreviewSnapshot,
} from "@/presentation/model/presentation-preview-port";

import {
  PresentationPreviewController,
  PresentationPreviewPortOwner,
} from "./presentation-preview-controller";

const SURFACE_ID = "preview-surf" as EmbeddedNodeId;
const NEXT_SURFACE_ID = "next-surface" as EmbeddedNodeId;

describe("PresentationPreviewController", () => {
  it("loads the current document before playing and publishes isolated runtime snapshots", async () => {
    const port = new FakePresentationPreviewPort();
    const controller = new PresentationPreviewController({ port });
    const listener = vi.fn();
    controller.subscribe(listener);

    const result = await controller.play(previewDocument(SURFACE_ID));

    expect(result.isOk()).toBe(true);
    expect(port.loadCalls).toEqual([previewDocument(SURFACE_ID)]);
    expect(port.playCalls).toBe(1);
    expect(controller.getSnapshot()).toEqual(readySnapshot(SURFACE_ID, 0, "playing"));
    expect(listener).toHaveBeenCalled();

    controller.dispose();
  });

  it("keeps only the latest asynchronous seek result", async () => {
    const port = new FakePresentationPreviewPort();
    const controller = new PresentationPreviewController({ port });
    const source = previewDocument(SURFACE_ID);
    await controller.loadCurrentDocument(source);
    const firstSeek = deferred<ReturnType<typeof Result.ok<{ kind: "applied"; timeMs: number }>>>();
    const secondSeek =
      deferred<ReturnType<typeof Result.ok<{ kind: "applied"; timeMs: number }>>>();
    port.seekResults.push(firstSeek.promise, secondSeek.promise);

    const first = controller.seek(source, 100);
    const second = controller.seek(source, 300);
    secondSeek.resolve(Result.ok({ kind: "applied", timeMs: 300 }));
    expect(await second).toMatchObject({ value: { kind: "applied", timeMs: 300 } });
    firstSeek.resolve(Result.ok({ kind: "applied", timeMs: 100 }));

    expect(await first).toMatchObject({ value: { kind: "superseded", timeMs: 100 } });
    expect(port.seekCalls).toEqual([100, 300]);

    controller.dispose();
  });

  it("supersedes an older seek when the current document is replaced", async () => {
    const port = new FakePresentationPreviewPort();
    const controller = new PresentationPreviewController({ port });
    const firstSource = previewDocument(SURFACE_ID);
    const nextSource = previewDocument(NEXT_SURFACE_ID);
    await controller.loadCurrentDocument(firstSource);
    const pendingSeek =
      deferred<ReturnType<typeof Result.ok<{ kind: "applied"; timeMs: number }>>>();
    port.seekResults.push(pendingSeek.promise);

    const seek = controller.seek(firstSource, 200);
    await controller.loadCurrentDocument(nextSource);
    pendingSeek.resolve(Result.ok({ kind: "applied", timeMs: 200 }));

    expect(await seek).toMatchObject({ value: { kind: "superseded", timeMs: 200 } });
    expect(port.loadCalls).toEqual([firstSource, nextSource]);

    controller.dispose();
  });

  it("preserves a reason-specific load refusal for its caller", async () => {
    const port = new FakePresentationPreviewPort();
    port.loadResult = Result.err({
      reason: "preview-surface-not-current",
      surfaceId: SURFACE_ID,
      currentSurfaceIds: [NEXT_SURFACE_ID],
    });
    const controller = new PresentationPreviewController({ port });

    const result = await controller.play(previewDocument(SURFACE_ID));

    expect(result.isErr() && result.error).toEqual({
      reason: "preview-surface-not-current",
      surfaceId: SURFACE_ID,
      currentSurfaceIds: [NEXT_SURFACE_ID],
    });
    expect(port.playCalls).toBe(0);

    controller.dispose();
  });

  it("preserves a recoverable runtime-loading cause for diagnostics", async () => {
    const cause = new Error("preview chunk unavailable");
    const port = new FakePresentationPreviewPort();
    port.loadResult = Result.err({ reason: "preview-runtime-unavailable", cause });
    const controller = new PresentationPreviewController({ port });

    expect(await controller.play(previewDocument(SURFACE_ID))).toMatchObject({
      error: { reason: "preview-runtime-unavailable", cause },
    });

    controller.dispose();
  });

  it("cancels pending ownership and closes the preview when disposed", async () => {
    const port = new FakePresentationPreviewPort();
    const close = vi.fn();
    const controller = new PresentationPreviewController({ port, close });
    const source = previewDocument(SURFACE_ID);
    await controller.loadCurrentDocument(source);
    const pendingSeek =
      deferred<ReturnType<typeof Result.ok<{ kind: "applied"; timeMs: number }>>>();
    port.seekResults.push(pendingSeek.promise);

    const seek = controller.seek(source, 400);
    controller.dispose();
    pendingSeek.resolve(Result.ok({ kind: "applied", timeMs: 400 }));

    expect(await seek).toMatchObject({ value: { kind: "superseded", timeMs: 400 } });
    expect(close).toHaveBeenCalledTimes(1);
    expect(() => controller.pause(source)).toThrowError(/disposed/i);
  });

  it("can close and reload the same document without retaining stale runtime ownership", async () => {
    const port = new FakePresentationPreviewPort();
    const close = vi.fn();
    const controller = new PresentationPreviewController({ port, close });
    const source = previewDocument(SURFACE_ID);
    await controller.loadCurrentDocument(source);

    controller.close();
    await controller.play(source);

    expect(close).toHaveBeenCalledOnce();
    expect(port.loadCalls).toEqual([source, source]);
    controller.dispose();
  });

  it("never controls a live Surface that differs from the requested document", async () => {
    const port = new FakePresentationPreviewPort();
    const controller = new PresentationPreviewController({ port });
    const source = previewDocument(SURFACE_ID);
    await controller.loadCurrentDocument(source);

    port.publish(readySnapshot(NEXT_SURFACE_ID, 200, "playing"));
    const pause = controller.pause(source);

    expect(pause).toMatchObject({
      error: {
        reason: "preview-surface-mismatch",
        operation: "pause",
        requestedSurfaceId: SURFACE_ID,
        liveSurfaceId: NEXT_SURFACE_ID,
      },
    });
    expect(port.pauseCalls).toBe(0);

    expect((await controller.play(source)).isOk()).toBe(true);
    expect(port.loadCalls).toEqual([source, source]);
    expect(port.playCalls).toBe(1);

    port.publish(readySnapshot(NEXT_SURFACE_ID, 300, "paused"));
    expect(await controller.seek(source, 400)).toMatchObject({
      value: { kind: "applied", timeMs: 400 },
    });
    expect(port.loadCalls).toEqual([source, source, source]);
    expect(port.seekCalls).toEqual([400]);

    controller.dispose();
  });
});

describe("PresentationPreviewPortOwner", () => {
  it("loads into a disposable runtime and publishes only the neutral playback port", async () => {
    const prepare = deferred<ReturnType<typeof Result.ok<void>>>();
    const close = vi.fn();
    const owner = new PresentationPreviewPortOwner({
      prepare: () => prepare.promise,
      close,
    });
    const source = previewDocument(SURFACE_ID);
    const load = owner.loadCurrentDocument(source);

    expect(owner.getSnapshot()).toEqual({ status: "loading", surfaceId: SURFACE_ID });
    prepare.resolve(Result.ok());
    await Promise.resolve();

    const playback = new FakePresentationPreviewPort();
    await playback.loadCurrentDocument(source);
    owner.connect(playback);

    expect((await load).isOk()).toBe(true);
    expect(owner.getSnapshot()).toEqual(readySnapshot(SURFACE_ID, 0, "awaiting-start"));
    owner.close();
    expect(close).toHaveBeenCalledOnce();
    expect(owner.getSnapshot()).toEqual({ status: "idle" });
  });

  it("settles a replaced runtime load as typed supersession", async () => {
    const ownerClose = vi.fn();
    const owner = new PresentationPreviewPortOwner({
      prepare: async () => Result.ok(),
      close: ownerClose,
    });
    const first = owner.loadCurrentDocument(previewDocument(SURFACE_ID));
    await Promise.resolve();

    void owner.loadCurrentDocument(previewDocument(NEXT_SURFACE_ID));

    expect(await first).toMatchObject({
      error: { reason: "preview-load-superseded", surfaceId: SURFACE_ID },
    });
    expect(ownerClose).toHaveBeenCalledOnce();
    owner.close();
  });
});

class FakePresentationPreviewPort implements PresentationPreviewPort {
  readonly loadCalls: PresentationPreviewDocument[] = [];
  readonly seekCalls: number[] = [];
  readonly seekResults: Array<
    Promise<ReturnType<typeof Result.ok<{ kind: "applied"; timeMs: number }>>>
  > = [];
  playCalls = 0;
  pauseCalls = 0;
  loadResult: PresentationPreviewLoadResult = Result.ok();
  #snapshot: PresentationPreviewSnapshot = { status: "idle" };
  readonly #listeners = new Set<() => void>();

  getSnapshot = () => this.#snapshot;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async loadCurrentDocument(input: PresentationPreviewDocument) {
    this.loadCalls.push(input);
    if (this.loadResult.isErr()) return this.loadResult;
    this.#publish(readySnapshot(input.surfaceId, 0, "awaiting-start"));
    return Result.ok();
  }

  play() {
    this.playCalls += 1;
    const snapshot = this.#requireReady();
    this.#publish({ ...snapshot, phase: "playing" });
    return Result.ok();
  }

  pause() {
    this.pauseCalls += 1;
    const snapshot = this.#requireReady();
    this.#publish({ ...snapshot, phase: "paused" });
    return Result.ok();
  }

  async seek(timeMs: number) {
    this.seekCalls.push(timeMs);
    return this.seekResults.shift() ?? Result.ok({ kind: "applied" as const, timeMs });
  }

  publish(snapshot: PresentationPreviewSnapshot) {
    this.#publish(snapshot);
  }

  #publish(snapshot: PresentationPreviewSnapshot) {
    this.#snapshot = Object.freeze(snapshot);
    for (const listener of this.#listeners) listener();
  }

  #requireReady() {
    if (this.#snapshot.status !== "ready") throw new Error("Expected a ready preview.");
    return this.#snapshot;
  }
}

function previewDocument(surfaceId: EmbeddedNodeId): PresentationPreviewDocument {
  return {
    surfaceId,
    document: { type: "doc" } as ScaffoldDocumentContent,
  };
}

function readySnapshot(
  surfaceId: EmbeddedNodeId,
  currentTimeMs: number,
  phase: Extract<PresentationPreviewSnapshot, { status: "ready" }>["phase"],
): PresentationPreviewSnapshot {
  return Object.freeze({
    status: "ready" as const,
    surfaceId,
    currentTimeMs,
    durationMs: 1_000,
    phase,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
