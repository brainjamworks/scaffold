import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { Result } from "better-result";
import { describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldDocumentContent } from "@/format/artifact";
import type {
  LearnerInteractionPreviewReportsPort,
  LearnerInteractionTurnReport,
} from "@/learner-interaction/model";
import type {
  PresentationPreviewPlaybackPort,
  PresentationPreviewSnapshot,
} from "@/presentation/model";

import type { PreparedAuthorPreview } from "./author-preview-preparation";
import { AuthorPreviewSessionController } from "./author-preview-session-controller";
import type { AuthoringDocumentSnapshot, AuthoringDocumentState } from "./use-authoring-document";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("preview00001");
const NEXT_SURFACE_ID = EmbeddedNodeIdSchema.parse("preview00002");

describe("AuthorPreviewSessionController", () => {
  it("enters one paused attempt and exposes transport/report readiness only after attachment", async () => {
    const services = {} as PreparedAuthorPreview["services"];
    const prepare = vi.fn(async () => Result.ok(prepared(services)));
    const controller = new AuthorPreviewSessionController({ prepare });

    expect(controller.getSnapshot()).toEqual({ status: "editing", failure: null });
    await expect(controller.enter(documentSnapshot(1), SURFACE_ID)).resolves.toMatchObject({
      value: undefined,
    });
    const snapshot = controller.getSnapshot();
    expect(snapshot).toMatchObject({
      status: "preview",
      active: { entryId: 1, runtimeGeneration: 1, surfaceId: SURFACE_ID, services },
    });
    expect(controller.transport.getSnapshot()).toEqual({
      status: "loading",
      surfaceId: SURFACE_ID,
    });
    expect(controller.reports.getSnapshot()).toEqual({ status: "loading", surfaceId: SURFACE_ID });

    const playback = new FakePlaybackPort(SURFACE_ID);
    const reports = new FakeReportsPort();
    controller.connectPresentationPlayback(1, playback);
    controller.connectLearnerInteractionReports(1, reports);

    expect(controller.transport.getSnapshot()).toMatchObject({
      status: "ready",
      surfaceId: SURFACE_ID,
      phase: "awaiting-start",
    });
    expect(controller.reports.getSnapshot()).toEqual({ status: "ready", surfaceId: SURFACE_ID });
    expect(playback.playCalls).toBe(0);

    controller.exit();
    expect(playback.pauseCalls).toBe(1);
    expect(controller.transport.getSnapshot()).toEqual({ status: "idle" });
    expect(controller.reports.getSnapshot()).toEqual({ status: "idle" });
  });

  it("refuses playback outside Preview and guards every operation by Surface", async () => {
    const controller = controllerWithPrepared();
    expect(controller.transport.play(SURFACE_ID)).toMatchObject({
      error: { reason: "preview-not-ready", operation: "play", status: "idle" },
    });
    await controller.enter(documentSnapshot(1), SURFACE_ID);
    controller.connectPresentationPlayback(1, new FakePlaybackPort(SURFACE_ID));

    expect(controller.transport.play(NEXT_SURFACE_ID)).toMatchObject({
      error: {
        reason: "preview-surface-mismatch",
        operation: "play",
        requestedSurfaceId: NEXT_SURFACE_ID,
        liveSurfaceId: SURFACE_ID,
      },
    });
    expect(await controller.transport.seek(NEXT_SURFACE_ID, 12)).toMatchObject({
      error: { reason: "preview-surface-mismatch", operation: "seek" },
    });
    expect(controller.transport.pause(NEXT_SURFACE_ID)).toMatchObject({
      error: { reason: "preview-surface-mismatch", operation: "pause" },
    });
  });

  it("invalidates pending entry on exit so stale work cannot reactivate Preview", async () => {
    const pending = deferred<ReturnType<typeof Result.ok<PreparedAuthorPreview>>>();
    const controller = new AuthorPreviewSessionController({ prepare: () => pending.promise });
    const entry = controller.enter(documentSnapshot(1), SURFACE_ID);

    expect(controller.getSnapshot()).toEqual({ status: "entering", surfaceId: SURFACE_ID });
    controller.exit();
    pending.resolve(Result.ok(prepared()));

    await expect(entry).resolves.toMatchObject({
      error: { reason: "preview-load-superseded", surfaceId: SURFACE_ID },
    });
    expect(controller.getSnapshot()).toEqual({ status: "editing", failure: null });
  });

  it("finishes entry from the newest observed configuration without recreating services", async () => {
    const services = {} as PreparedAuthorPreview["services"];
    const initial = deferred<ReturnType<typeof Result.ok<PreparedAuthorPreview>>>();
    let calls = 0;
    const prepare = vi.fn(async (_input, retained) => {
      calls += 1;
      return calls === 1 ? initial.promise : Result.ok(prepared(retained ?? services));
    });
    const controller = new AuthorPreviewSessionController({ prepare });
    const entry = controller.enter(documentSnapshot(1), SURFACE_ID);

    controller.observeDocument(validState(2, "Course", { schemaVersion: 1, surfaces: [] }));
    initial.resolve(Result.ok(prepared(services)));

    await expect(entry).resolves.toMatchObject({ value: undefined });
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenNthCalledWith(2, expect.objectContaining({ revision: 2 }), services);
    expect(controller.getSnapshot()).toMatchObject({
      status: "preview",
      active: { entryId: 1, runtimeGeneration: 2, services },
    });
  });

  it("retains entry services, pauses before refresh and never auto-plays", async () => {
    const services = {} as PreparedAuthorPreview["services"];
    const prepare = vi.fn(async (_input, retained) => Result.ok(prepared(retained ?? services)));
    const controller = new AuthorPreviewSessionController({ prepare });
    await controller.enter(documentSnapshot(1), SURFACE_ID);
    const playback = new FakePlaybackPort(SURFACE_ID);
    controller.connectPresentationPlayback(1, playback);

    await expect(controller.showSurface(NEXT_SURFACE_ID)).resolves.toMatchObject({
      value: undefined,
    });
    expect(playback.pauseCalls).toBe(1);
    expect(playback.playCalls).toBe(0);
    expect(prepare).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ surfaceId: NEXT_SURFACE_ID }),
      services,
    );
    expect(controller.getSnapshot()).toMatchObject({
      status: "preview",
      active: { entryId: 1, runtimeGeneration: 2, surfaceId: NEXT_SURFACE_ID, services },
    });
  });

  it("keeps the prior paused stage on refresh failure and a later valid Apply recovers", async () => {
    let calls = 0;
    const prepare = vi.fn(async (_input, retained) => {
      calls += 1;
      return calls === 2
        ? Result.err({ reason: "preview-runtime-unavailable" as const, cause: "offline" })
        : Result.ok(prepared(retained ?? undefined));
    });
    const controller = new AuthorPreviewSessionController({ prepare });
    await controller.enter(documentSnapshot(1), SURFACE_ID);
    const playback = new FakePlaybackPort(SURFACE_ID);
    controller.connectPresentationPlayback(1, playback);

    await controller.showSurface(NEXT_SURFACE_ID);
    expect(controller.getSnapshot()).toMatchObject({
      status: "refresh-failed",
      active: { surfaceId: SURFACE_ID },
      failure: { reason: "preview-runtime-unavailable", cause: "offline" },
    });
    expect(controller.transport.play(SURFACE_ID)).toMatchObject({
      error: { reason: "preview-not-ready", operation: "play", status: "loading" },
    });

    await controller.showSurface(NEXT_SURFACE_ID);
    expect(controller.getSnapshot()).toMatchObject({
      status: "preview",
      active: { surfaceId: NEXT_SURFACE_ID, runtimeGeneration: 3 },
    });
  });

  it("pauses and gates an invalid observed document until a valid observation recovers", async () => {
    const controller = controllerWithPrepared();
    await controller.enter(documentSnapshot(1), SURFACE_ID);
    const playback = new FakePlaybackPort(SURFACE_ID);
    controller.connectPresentationPlayback(1, playback);

    controller.observeDocument({
      status: "invalid",
      revision: 2,
      failure: { status: "requires-scaffold-plus" },
    });

    expect(playback.pauseCalls).toBe(1);
    expect(controller.getSnapshot()).toMatchObject({
      status: "refresh-failed",
      failure: { reason: "preview-requires-scaffold-plus" },
    });
    expect(controller.transport.play(SURFACE_ID)).toMatchObject({
      error: { reason: "preview-not-ready", status: "loading" },
    });

    controller.observeDocument(validState(3));
    await vi.waitFor(() =>
      expect(controller.getSnapshot()).toMatchObject({
        status: "preview",
        active: { runtimeGeneration: 2 },
      }),
    );
  });

  it("does not let an in-flight refresh overwrite a later invalid observation", async () => {
    const services = {} as PreparedAuthorPreview["services"];
    const pending = deferred<ReturnType<typeof Result.ok<PreparedAuthorPreview>>>();
    let calls = 0;
    const controller = new AuthorPreviewSessionController({
      prepare: async (_input, retained) => {
        calls += 1;
        if (calls === 2) return pending.promise;
        return Result.ok(prepared(retained ?? services));
      },
    });
    await controller.enter(documentSnapshot(1), SURFACE_ID);

    const staleRefresh = controller.showSurface(NEXT_SURFACE_ID);
    controller.observeDocument({
      status: "invalid",
      revision: 2,
      failure: { status: "requires-scaffold-plus" },
    });
    pending.resolve(Result.ok(prepared(services)));

    await expect(staleRefresh).resolves.toMatchObject({
      error: { reason: "preview-load-superseded", surfaceId: NEXT_SURFACE_ID },
    });
    expect(controller.getSnapshot()).toMatchObject({
      status: "refresh-failed",
      active: { surfaceId: SURFACE_ID },
      failure: { reason: "preview-requires-scaffold-plus" },
    });
  });

  it("lets the newest refresh win when an earlier refresh finishes late", async () => {
    const services = {} as PreparedAuthorPreview["services"];
    const older = deferred<ReturnType<typeof Result.ok<PreparedAuthorPreview>>>();
    const newer = deferred<ReturnType<typeof Result.ok<PreparedAuthorPreview>>>();
    let calls = 0;
    const controller = new AuthorPreviewSessionController({
      prepare: async (_input, _retained) => {
        calls += 1;
        if (calls === 1) return Result.ok(prepared(services));
        return calls === 2 ? older.promise : newer.promise;
      },
    });
    await controller.enter(documentSnapshot(1), SURFACE_ID);

    const supersededRefresh = controller.showSurface(NEXT_SURFACE_ID);
    const currentRefresh = controller.showSurface(SURFACE_ID);
    newer.resolve(Result.ok(prepared(services)));
    await expect(currentRefresh).resolves.toMatchObject({ value: undefined });
    older.resolve(Result.ok(prepared(services)));
    await expect(supersededRefresh).resolves.toMatchObject({
      error: { reason: "preview-load-superseded", surfaceId: NEXT_SURFACE_ID },
    });

    expect(controller.getSnapshot()).toMatchObject({
      status: "preview",
      active: { runtimeGeneration: 3, surfaceId: SURFACE_ID },
    });
  });

  it("supersedes a pending A-to-B refresh when canonical configuration returns to A", async () => {
    const services = {} as PreparedAuthorPreview["services"];
    const pendingB = deferred<ReturnType<typeof Result.ok<PreparedAuthorPreview>>>();
    let calls = 0;
    const prepare = vi.fn(async (_input, retained) => {
      calls += 1;
      if (calls === 2) return pendingB.promise;
      return Result.ok(prepared(retained ?? services));
    });
    const controller = new AuthorPreviewSessionController({ prepare });
    await controller.enter(documentSnapshot(1), SURFACE_ID);

    controller.observeDocument(validState(2, "Course", { schemaVersion: 1, surfaces: [] }));
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
    controller.observeDocument(validState(3));

    await vi.waitFor(() =>
      expect(controller.getSnapshot()).toMatchObject({
        status: "preview",
        active: { runtimeGeneration: 3, surfaceId: SURFACE_ID, services },
      }),
    );
    expect(prepare).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ revision: 3, surfaceId: SURFACE_ID }),
      services,
    );

    pendingB.resolve(Result.ok(prepared(services)));
    await Promise.resolve();
    expect(controller.getSnapshot()).toMatchObject({
      status: "preview",
      active: { runtimeGeneration: 3, surfaceId: SURFACE_ID, services },
    });
  });

  it("ignores title-only observations but refreshes a changed Preview configuration", async () => {
    const prepare = vi.fn(async (_input, retained) => Result.ok(prepared(retained ?? undefined)));
    const controller = new AuthorPreviewSessionController({ prepare });
    await controller.enter(documentSnapshot(1), SURFACE_ID);

    controller.observeDocument(validState(2, "Renamed"));
    expect(prepare).toHaveBeenCalledTimes(1);

    controller.observeDocument(validState(3, "Renamed", { schemaVersion: 1, surfaces: [] }));
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
    expect(controller.getSnapshot()).toMatchObject({ status: "preview", active: { entryId: 1 } });
  });

  it("rejects stale connector attachment and cleanup without detaching the current runtime", async () => {
    const controller = controllerWithPrepared();
    await controller.enter(documentSnapshot(1), SURFACE_ID);
    await controller.showSurface(NEXT_SURFACE_ID);
    const current = new FakePlaybackPort(NEXT_SURFACE_ID);
    controller.connectPresentationPlayback(2, current);

    controller.connectPresentationPlayback(1, new FakePlaybackPort(SURFACE_ID));
    controller.connectPresentationPlayback(1, null);

    expect(controller.transport.play(NEXT_SURFACE_ID).isOk()).toBe(true);
    expect(current.playCalls).toBe(1);
  });

  it("disposes connectors, rejects stale work and leaves programming defects observable", async () => {
    const defect = new Error("broken compiler invariant");
    const controller = new AuthorPreviewSessionController({
      prepare: async () => {
        throw defect;
      },
    });

    await expect(controller.enter(documentSnapshot(1), SURFACE_ID)).rejects.toBe(defect);
    controller.dispose();
    controller.dispose();
    expect(() => controller.connectPresentationPlayback(1, null)).not.toThrow();
    expect(() => controller.connectLearnerInteractionReports(1, null)).not.toThrow();
    expect(() => controller.transport.play(SURFACE_ID)).toThrow("disposed Author Preview Session");
  });
});

class FakePlaybackPort implements PresentationPreviewPlaybackPort {
  playCalls = 0;
  pauseCalls = 0;
  constructor(readonly surfaceId: typeof SURFACE_ID) {}
  getSnapshot = (): PresentationPreviewSnapshot => ({
    status: "ready",
    surfaceId: this.surfaceId,
    phase: "awaiting-start",
    currentTimeMs: 0,
    durationMs: 1_000,
  });
  subscribe = () => () => undefined;
  play() {
    this.playCalls += 1;
    return Result.ok();
  }
  pause() {
    this.pauseCalls += 1;
    return Result.ok();
  }
  async seek(timeMs: number) {
    return Result.ok({ kind: "applied" as const, timeMs });
  }
}

class FakeReportsPort implements LearnerInteractionPreviewReportsPort {
  subscribeReports(_listener: (report: LearnerInteractionTurnReport) => void) {
    return () => undefined;
  }
}

function controllerWithPrepared() {
  return new AuthorPreviewSessionController({
    prepare: async (_input, retained) => Result.ok(prepared(retained ?? undefined)),
  });
}

function prepared(services?: PreparedAuthorPreview["services"]): PreparedAuthorPreview {
  return {
    content: {
      learnerContent: createScaffoldDocumentContent({ mode: "page" }),
      assessmentGroups: [],
      assessmentTargets: [],
    },
    services: services ?? ({} as PreparedAuthorPreview["services"]),
    program: null,
  };
}

function documentSnapshot(
  revision: number,
  title = "Course",
  learnerInteractions: unknown = null,
): AuthoringDocumentSnapshot {
  return validState(revision, title, learnerInteractions).snapshot;
}

function validState(
  revision: number,
  title = "Course",
  learnerInteractions: unknown = null,
): Extract<AuthoringDocumentState, { status: "valid" }> {
  const content = createScaffoldDocumentContent({ mode: "page", surfaceId: SURFACE_ID });
  if (learnerInteractions !== null) {
    content.content![0]!.attrs = { ...content.content![0]!.attrs, learnerInteractions };
  }
  return {
    status: "valid",
    snapshot: {
      revision,
      artifact: {
        id: "preview-artifact",
        title,
        mode: "page",
        content,
      },
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
