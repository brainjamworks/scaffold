import { Result } from "better-result";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ArtifactPersistenceResult, ArtifactSavePayload } from "@/host/ports";

import { createAuthoringSaveController } from "./authoring-save-controller";
import type { AuthoringDocumentState } from "./use-authoring-document";

afterEach(() => vi.useRealTimers());

function ignoreSavedMetadata() {}

describe("authoring save controller", () => {
  it("debounces and coalesces observed edits into the latest immutable snapshot", async () => {
    vi.useFakeTimers();
    const saveArtifact = vi.fn(async (_payload: ArtifactSavePayload) =>
      Result.ok({ artifactRevision: "revision-2" }),
    );
    const controller = createAuthoringSaveController(
      valid(0, "Initial"),
      { saveArtifact },
      ignoreSavedMetadata,
    );

    controller.observeDocument(valid(1, "First"));
    controller.observeDocument(valid(2, "Second"));
    expect(controller.getSnapshot().activity).toBe("scheduled");
    expect(saveArtifact).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    await flush();

    expect(saveArtifact).toHaveBeenCalledTimes(1);
    expect(saveArtifact.mock.calls[0]?.[0].artifact.title).toBe("Second");
    expect(controller.getSnapshot().lastSaved).toEqual({
      localRevision: 2,
      artifactRevision: "revision-2",
    });
  });

  it("uses the same queue for explicit Save and clears redundant debounce", async () => {
    vi.useFakeTimers();
    const saveArtifact = vi.fn(async (_payload: ArtifactSavePayload) =>
      Result.ok({ artifactRevision: "revision-1" }),
    );
    const controller = createAuthoringSaveController(
      valid(0, "Initial"),
      { saveArtifact },
      ignoreSavedMetadata,
    );
    controller.observeDocument(valid(1, "Changed"));

    const saved = controller.saveNow();
    await expect(saved).resolves.toMatchObject({ value: { localRevision: 1 } });
    vi.advanceTimersByTime(500);
    await flush();

    expect(saveArtifact).toHaveBeenCalledTimes(1);
  });

  it("acknowledges a non-empty title only for a current successful save", async () => {
    const acknowledgeSavedMetadata = vi.fn();
    const controller = createAuthoringSaveController(
      valid(3, "Authored title"),
      {
        saveArtifact: async () =>
          Result.ok({
            artifactRevision: "revision-3",
            artifact: { title: "Persisted title" },
          }),
      },
      acknowledgeSavedMetadata,
    );

    await controller.saveNow();

    expect(acknowledgeSavedMetadata).toHaveBeenCalledOnce();
    expect(acknowledgeSavedMetadata).toHaveBeenCalledWith({
      localRevision: 3,
      title: "Persisted title",
    });
  });

  it("does not acknowledge an omitted persisted title", async () => {
    const acknowledgeSavedMetadata = vi.fn();
    const controller = createAuthoringSaveController(
      valid(0, "Authored title"),
      {
        saveArtifact: async () => Result.ok({ artifactRevision: "revision-0" }),
      },
      acknowledgeSavedMetadata,
    );

    await controller.saveNow();

    expect(acknowledgeSavedMetadata).not.toHaveBeenCalled();
  });

  it("waits for a newer edit and never marks it saved from an older completion", async () => {
    vi.useFakeTimers();
    const first = deferred<ArtifactPersistenceResult>();
    const second = deferred<ArtifactPersistenceResult>();
    const saveArtifact = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const acknowledgeSavedMetadata = vi.fn();
    const controller = createAuthoringSaveController(
      valid(0, "Initial"),
      { saveArtifact },
      acknowledgeSavedMetadata,
    );

    controller.observeDocument(valid(1, "First"));
    const requested = controller.saveNow();
    controller.observeDocument(valid(2, "Second"));
    first.resolve(
      Result.ok({ artifactRevision: "revision-1", artifact: { title: "Stale persisted title" } }),
    );
    await flush();

    expect(acknowledgeSavedMetadata).not.toHaveBeenCalled();

    expect(controller.getSnapshot()).toMatchObject({
      currentLocalRevision: 2,
      lastSaved: { localRevision: 1, artifactRevision: "revision-1" },
      activity: "scheduled",
    });
    let settled = false;
    void requested.then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);

    vi.advanceTimersByTime(500);
    await flush();
    second.resolve(
      Result.ok({ artifactRevision: "revision-2", artifact: { title: "Current persisted title" } }),
    );
    await expect(requested).resolves.toMatchObject({
      value: { localRevision: 2, artifactRevision: "revision-2" },
    });
    expect(acknowledgeSavedMetadata).toHaveBeenCalledWith({
      localRevision: 2,
      title: "Current persisted title",
    });
  });

  it("captures title/theme metadata in the queued artifact", async () => {
    const saveArtifact = vi.fn(async (_payload: ArtifactSavePayload) =>
      Result.ok({ artifactRevision: "revision-theme" }),
    );
    const state = valid(1, "Theme title", { schemaVersion: 1 });
    const controller = createAuthoringSaveController(state, { saveArtifact }, ignoreSavedMetadata);

    await controller.saveNow();

    expect(saveArtifact.mock.calls[0]?.[0].artifact).toMatchObject({
      title: "Theme title",
      content: {
        content: [{ attrs: { theme: { schemaVersion: 1 } } }],
      },
    });
  });

  it("returns every expected persistence failure with original facts", async () => {
    const causes = {
      "storage-unavailable": new Error("unavailable"),
      "quota-exceeded": new DOMException("full", "QuotaExceededError"),
      "write-aborted": new DOMException("aborted", "AbortError"),
    } as const;

    for (const reason of Object.keys(causes) as Array<keyof typeof causes>) {
      const failure = { reason, artifactId: "artifact-save", cause: causes[reason] };
      const controller = createAuthoringSaveController(
        valid(3, "Draft"),
        {
          saveArtifact: async () => Result.err(failure),
        },
        ignoreSavedMetadata,
      );
      const result = await controller.saveNow();
      expect(result.isErr()).toBe(true);
      if (result.isOk()) throw new Error("expected persistence failure");
      expect(result.error).toEqual({
        reason: "persistence-failed",
        requestedRevision: 3,
        failure,
      });
      expect(controller.getSnapshot().lastSaved).toBeNull();
    }
  });

  it("leaves unexpected persistence defects observable as rejected Save promises", async () => {
    const defect = new Error("broken adapter invariant");
    const controller = createAuthoringSaveController(
      valid(0, "Draft"),
      {
        saveArtifact: async () => {
          throw defect;
        },
      },
      ignoreSavedMetadata,
    );

    await expect(controller.saveNow()).rejects.toBe(defect);
  });

  it("invalidates pending callers and cancels unsent work", async () => {
    const first = deferred<ArtifactPersistenceResult>();
    const saveArtifact = vi.fn(() => first.promise);
    const controller = createAuthoringSaveController(
      valid(0, "Initial"),
      { saveArtifact },
      ignoreSavedMetadata,
    );
    controller.observeDocument(valid(1, "First"));
    const firstSave = controller.saveNow();
    controller.observeDocument(valid(2, "Second"));
    const secondSave = controller.saveNow();

    controller.observeDocument(invalid(3));

    await expect(firstSave).resolves.toMatchObject({
      error: { reason: "document-invalidated", requestedRevision: 1 },
    });
    await expect(secondSave).resolves.toMatchObject({
      error: { reason: "document-invalidated", requestedRevision: 2 },
    });
    first.resolve(Result.ok({ artifactRevision: "stale" }));
    await flush();
    expect(saveArtifact).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      documentStatus: "invalid",
      currentLocalRevision: 3,
    });
  });

  it("returns invalid-document for explicit Save and retains the authoring failure", async () => {
    const state = invalid(4);
    const controller = createAuthoringSaveController(
      state,
      { saveArtifact: vi.fn() },
      ignoreSavedMetadata,
    );

    const result = await controller.saveNow();

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("expected invalid document failure");
    expect(result.error).toEqual({ reason: "invalid-document", failure: state.failure });
  });

  it("settles callers on disposal and ignores a late completion", async () => {
    const pending = deferred<ArtifactPersistenceResult>();
    const acknowledgeSavedMetadata = vi.fn();
    const controller = createAuthoringSaveController(
      valid(5, "Draft"),
      {
        saveArtifact: () => pending.promise,
      },
      acknowledgeSavedMetadata,
    );
    const saved = controller.saveNow();

    controller.dispose();

    await expect(saved).resolves.toMatchObject({
      error: { reason: "session-closed", requestedRevision: 5 },
    });
    pending.resolve(
      Result.ok({ artifactRevision: "late", artifact: { title: "Late persisted title" } }),
    );
    await flush();
    expect(controller.getSnapshot().lastSaved).toBeNull();
    expect(acknowledgeSavedMetadata).not.toHaveBeenCalled();
  });

  it("seeds only an unchanged initial revision and never overwrites a completed save", async () => {
    const controller = createAuthoringSaveController(
      valid(0, "Initial"),
      {
        saveArtifact: async () => Result.ok({ artifactRevision: "saved-locally" }),
      },
      ignoreSavedMetadata,
    );
    controller.seedInitialSavedRevision("initial-host");
    expect(controller.getSnapshot().lastSaved?.artifactRevision).toBe("initial-host");

    controller.observeDocument(valid(1, "Changed"));
    await controller.saveNow();
    controller.seedInitialSavedRevision("late-host");

    expect(controller.getSnapshot().lastSaved).toEqual({
      localRevision: 1,
      artifactRevision: "saved-locally",
    });
  });
});

function valid(
  revision: number,
  title: string,
  theme: { schemaVersion: 1 } | null = null,
): AuthoringDocumentState {
  return {
    status: "valid",
    snapshot: {
      revision,
      artifact: {
        id: "artifact-save",
        title,
        mode: "page",
        content: {
          type: "doc",
          content: [{ type: "courseDocument", attrs: { theme } }],
        },
      },
    },
  };
}

function invalid(revision: number): Extract<AuthoringDocumentState, { status: "invalid" }> {
  return {
    status: "invalid",
    revision,
    failure: { status: "canonicalization-failed", issues: [] },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
