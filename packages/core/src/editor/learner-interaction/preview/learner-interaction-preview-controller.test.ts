import type { EmbeddedNodeId, ScaffoldDocumentContent } from "@scaffold/contracts";
import { Result } from "better-result";
import { describe, expect, it, vi } from "vite-plus/test";

import type {
  LearnerInteractionPreviewDocument,
  LearnerInteractionPreviewLoadError,
  LearnerInteractionPreviewLoadResult,
  LearnerInteractionPreviewPort,
  LearnerInteractionPreviewReportsPort,
  LearnerInteractionPreviewSnapshot,
  LearnerInteractionTurnReport,
} from "@/learner-interaction/model";

import {
  LearnerInteractionPreviewController,
  LearnerInteractionPreviewPortOwner,
} from "./learner-interaction-preview-controller";

const SURFACE_ID = "preview-surface" as EmbeddedNodeId;
const NEXT_SURFACE_ID = "next-surface" as EmbeddedNodeId;

describe("LearnerInteractionPreviewController", () => {
  it("loads a saved document and forwards snapshots and reports", async () => {
    const port = new FakeLearnerInteractionPreviewPort();
    const controller = new LearnerInteractionPreviewController({ port });
    const snapshotListener = vi.fn();
    const reportListener = vi.fn();
    controller.subscribe(snapshotListener);
    controller.subscribeReports(reportListener);

    const result = await controller.loadCurrentDocument(previewDocument(SURFACE_ID));
    const report = turnReport(1);
    port.publishReport(report);

    expect(result.isOk()).toBe(true);
    expect(port.loadCalls).toEqual([previewDocument(SURFACE_ID)]);
    expect(controller.getSnapshot()).toEqual({ status: "ready", surfaceId: SURFACE_ID });
    expect(snapshotListener).toHaveBeenCalled();
    expect(reportListener).toHaveBeenCalledWith(report);

    controller.dispose();
  });

  it("keeps a newer document current when an older load settles late", async () => {
    const port = new FakeLearnerInteractionPreviewPort();
    const first = deferred<LearnerInteractionPreviewLoadResult>();
    const second = deferred<LearnerInteractionPreviewLoadResult>();
    port.loadResults.push(first.promise, second.promise);
    const controller = new LearnerInteractionPreviewController({ port });

    const olderLoad = controller.loadCurrentDocument(previewDocument(SURFACE_ID));
    const newerLoad = controller.loadCurrentDocument(previewDocument(NEXT_SURFACE_ID));
    second.resolve(Result.ok());
    expect((await newerLoad).isOk()).toBe(true);
    first.resolve(Result.err({ reason: "preview-load-superseded", surfaceId: SURFACE_ID }));

    expect(await olderLoad).toMatchObject({
      error: { reason: "preview-load-superseded", surfaceId: SURFACE_ID },
    });

    controller.dispose();
  });

  it("reuses the current ready document instead of replacing its runtime", async () => {
    const port = new FakeLearnerInteractionPreviewPort();
    const controller = new LearnerInteractionPreviewController({ port });
    const input = previewDocument(SURFACE_ID);

    await controller.loadCurrentDocument(input);
    const result = await controller.loadCurrentDocument(input);

    expect(result.isOk()).toBe(true);
    expect(port.loadCalls).toEqual([input]);
    controller.dispose();
  });

  it("closes without retaining listeners and throws on post-disposal misuse", async () => {
    const port = new FakeLearnerInteractionPreviewPort();
    const close = vi.fn();
    const controller = new LearnerInteractionPreviewController({ port, close });
    const reportListener = vi.fn();
    controller.subscribeReports(reportListener);
    await controller.loadCurrentDocument(previewDocument(SURFACE_ID));

    controller.close();
    port.publishReport(turnReport(1));
    expect(close).toHaveBeenCalledOnce();
    expect(reportListener).not.toHaveBeenCalled();

    await controller.loadCurrentDocument(previewDocument(SURFACE_ID));
    controller.dispose();
    expect(close).toHaveBeenCalledTimes(2);
    expect(() => controller.close()).toThrowError(/disposed/i);
    await expect(controller.loadCurrentDocument(previewDocument(SURFACE_ID))).rejects.toThrow(
      /disposed/i,
    );
  });
});

describe("LearnerInteractionPreviewPortOwner", () => {
  it("waits for preparation and a late reports connector before becoming ready", async () => {
    const prepared = deferred<ReturnType<typeof Result.ok<void>>>();
    const close = vi.fn();
    const owner = new LearnerInteractionPreviewPortOwner({
      prepare: () => prepared.promise,
      close,
    });
    const input = previewDocument(SURFACE_ID);
    const load = owner.loadCurrentDocument(input);

    expect(owner.getSnapshot()).toEqual({ status: "loading", surfaceId: SURFACE_ID });
    prepared.resolve(Result.ok());
    await Promise.resolve();
    expect(owner.getSnapshot()).toEqual({ status: "loading", surfaceId: SURFACE_ID });

    const reports = new FakeReportsPort();
    owner.connect(reports);

    expect((await load).isOk()).toBe(true);
    expect(owner.getSnapshot()).toEqual({ status: "ready", surfaceId: SURFACE_ID });
    owner.close();
    expect(close).toHaveBeenCalledOnce();
    expect(owner.getSnapshot()).toEqual({ status: "idle" });
  });

  it("forwards reports only from the current connector", async () => {
    const owner = new LearnerInteractionPreviewPortOwner({
      prepare: async () => Result.ok(),
      close: vi.fn(),
    });
    const reports = new FakeReportsPort();
    const nextReports = new FakeReportsPort();
    const listener = vi.fn();
    owner.subscribeReports(listener);

    const firstLoad = owner.loadCurrentDocument(previewDocument(SURFACE_ID));
    await Promise.resolve();
    owner.connect(reports);
    await firstLoad;
    reports.publish(turnReport(1));

    const nextLoad = owner.loadCurrentDocument(previewDocument(NEXT_SURFACE_ID));
    await Promise.resolve();
    reports.publish(turnReport(2));
    owner.connect(nextReports);
    await nextLoad;
    nextReports.publish(turnReport(3));

    expect(listener.mock.calls).toEqual([[turnReport(1)], [turnReport(3)]]);
    owner.close();
    nextReports.publish(turnReport(4));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("settles replaced and closed loads as typed supersession", async () => {
    const close = vi.fn();
    const owner = new LearnerInteractionPreviewPortOwner({
      prepare: async () => Result.ok(),
      close,
    });
    const first = owner.loadCurrentDocument(previewDocument(SURFACE_ID));
    await Promise.resolve();
    const second = owner.loadCurrentDocument(previewDocument(NEXT_SURFACE_ID));
    await Promise.resolve();

    expect(await first).toMatchObject({
      error: { reason: "preview-load-superseded", surfaceId: SURFACE_ID },
    });
    owner.close();
    expect(await second).toMatchObject({
      error: { reason: "preview-load-superseded", surfaceId: NEXT_SURFACE_ID },
    });
    expect(close).toHaveBeenCalledTimes(2);
  });

  it.each(loadErrors())("preserves the $reason load failure with all facts", async (error) => {
    const owner = new LearnerInteractionPreviewPortOwner({
      prepare: async () => Result.err(error),
      close: vi.fn(),
    });

    const result = await owner.loadCurrentDocument(previewDocument(SURFACE_ID));

    expect(result).toMatchObject({ error });
    expect(owner.getSnapshot()).toEqual({ status: "error", surfaceId: SURFACE_ID, error });
  });

  it("rejects an unsolicited reports connector as an invariant defect", () => {
    const owner = new LearnerInteractionPreviewPortOwner({
      prepare: async () => Result.ok(),
      close: vi.fn(),
    });

    expect(() => owner.connect(new FakeReportsPort())).toThrowError(/without a pending load/i);
  });
});

class FakeLearnerInteractionPreviewPort implements LearnerInteractionPreviewPort {
  readonly loadCalls: LearnerInteractionPreviewDocument[] = [];
  readonly loadResults: Promise<LearnerInteractionPreviewLoadResult>[] = [];
  #snapshot: LearnerInteractionPreviewSnapshot = { status: "idle" };
  readonly #snapshotListeners = new Set<() => void>();
  readonly #reportListeners = new Set<(report: LearnerInteractionTurnReport) => void>();

  getSnapshot = () => this.#snapshot;

  subscribe = (listener: () => void) => {
    this.#snapshotListeners.add(listener);
    return () => this.#snapshotListeners.delete(listener);
  };

  subscribeReports = (listener: (report: LearnerInteractionTurnReport) => void) => {
    this.#reportListeners.add(listener);
    return () => this.#reportListeners.delete(listener);
  };

  async loadCurrentDocument(input: LearnerInteractionPreviewDocument) {
    this.loadCalls.push(input);
    const queued = this.loadResults.shift();
    if (queued) return queued;
    this.#snapshot = Object.freeze({ status: "ready", surfaceId: input.surfaceId });
    for (const listener of this.#snapshotListeners) listener();
    return Result.ok();
  }

  publishReport(report: LearnerInteractionTurnReport) {
    for (const listener of this.#reportListeners) listener(report);
  }
}

class FakeReportsPort implements LearnerInteractionPreviewReportsPort {
  readonly #listeners = new Set<(report: LearnerInteractionTurnReport) => void>();

  subscribeReports(listener: (report: LearnerInteractionTurnReport) => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  publish(report: LearnerInteractionTurnReport) {
    for (const listener of this.#listeners) listener(report);
  }
}

function previewDocument(surfaceId: EmbeddedNodeId): LearnerInteractionPreviewDocument {
  return { surfaceId, document: { type: "doc" } as ScaffoldDocumentContent };
}

function turnReport(turnNumber: number): LearnerInteractionTurnReport {
  return {
    turnNumber,
    event: {
      targetId: SURFACE_ID,
      type: "select",
    },
    ruleEvaluations: [],
    commandExecutions: [],
    end: "completed",
  };
}

function loadErrors(): LearnerInteractionPreviewLoadError[] {
  const cause = new Error("unavailable");
  return [
    { reason: "preview-not-slideshow", mode: "page" },
    {
      reason: "preview-surface-not-current",
      surfaceId: SURFACE_ID,
      currentSurfaceIds: [NEXT_SURFACE_ID],
    },
    { reason: "preview-surface-not-configured", surfaceId: SURFACE_ID },
    { reason: "preview-document-invalid", issues: [{ path: ["content"], message: "Invalid" }] },
    { reason: "preview-requires-scaffold-plus" },
    { reason: "preview-unsupported-core-format", documentVersion: 2, supportedVersion: 1 },
    {
      reason: "preview-unavailable-content",
      unavailableContent: [{ kind: "block", capabilityId: "missing", stableId: "missing-block" }],
    },
    { reason: "preview-projection-warning", warningCount: 1 },
    { reason: "preview-payload-too-large" },
    { reason: "preview-runtime-unavailable", cause },
    { reason: "preview-services-unavailable", cause },
  ];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
