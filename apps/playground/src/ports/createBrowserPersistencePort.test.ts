// @vitest-environment happy-dom
import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ArtifactSavePayload } from "@scaffold/core/ports";

import { createBrowserPersistencePort } from "./createBrowserPersistencePort";
import * as browserStorage from "./browserStorageDb";

const samplePayload = (overrides: Partial<ArtifactSavePayload> = {}): ArtifactSavePayload => ({
  artifact: {
    id: "artifact-1",
    title: "Untitled",
    mode: "page",
    content: { type: "doc", content: [] },
  },
  ...overrides,
});

describe("createBrowserPersistencePort", () => {
  beforeEach(async () => {
    await browserStorage.resetBrowserStorage();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await browserStorage.resetBrowserStorage();
  });

  it("persists a saved artifact and reads it back", async () => {
    const port = createBrowserPersistencePort({ saveLatencyMs: 0 });
    const result = await port.saveArtifact(
      samplePayload({
        artifact: {
          ...samplePayload().artifact,
          title: "Page one",
        },
      }),
    );
    expect(savedValue(result)).toEqual({
      artifact: { title: "Page one" },
      artifactRevision: expect.any(String),
    });

    const loaded = await port.loadArtifact("artifact-1");
    expect(loaded).not.toBeNull();
    expect(loaded?.artifact.title).toBe("Page one");
    expect(loaded?.artifact.id).toBe("artifact-1");
    expect(loaded?.artifactRevision).toBe(savedValue(result).artifactRevision);
    expect(loaded?.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns null for an unknown artifact", async () => {
    const port = createBrowserPersistencePort({ saveLatencyMs: 0 });
    const loaded = await port.loadArtifact("missing");
    expect(loaded).toBeNull();
  });

  it("overwrites the same artifact id on subsequent saves", async () => {
    const port = createBrowserPersistencePort({ saveLatencyMs: 0 });
    const first = await port.saveArtifact(
      samplePayload({
        artifact: { ...samplePayload().artifact, title: "First" },
      }),
    );
    const second = await port.saveArtifact(
      samplePayload({
        artifact: { ...samplePayload().artifact, title: "Second" },
      }),
    );
    const loaded = await port.loadArtifact("artifact-1");
    expect(loaded?.artifact.title).toBe("Second");
    expect(savedValue(second).artifactRevision).not.toBe(savedValue(first).artifactRevision);
    expect(loaded?.artifactRevision).toBe(savedValue(second).artifactRevision);
  });

  it("clearArtifact removes a single artifact and leaves others intact", async () => {
    const port = createBrowserPersistencePort({ saveLatencyMs: 0 });
    await port.saveArtifact(
      samplePayload({
        artifact: { ...samplePayload().artifact, id: "artifact-1" },
      }),
    );
    await port.saveArtifact(
      samplePayload({
        artifact: { ...samplePayload().artifact, id: "artifact-2" },
      }),
    );
    await port.clearArtifact("artifact-1");
    expect(await port.loadArtifact("artifact-1")).toBeNull();
    expect(await port.loadArtifact("artifact-2")).not.toBeNull();
  });

  it("applies synthetic latency when configured", async () => {
    const port = createBrowserPersistencePort({ saveLatencyMs: 50 });
    const start = Date.now();
    await port.saveArtifact(samplePayload());
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });

  it("returns storage-unavailable with the artifact id and cause", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const port = createBrowserPersistencePort({ saveLatencyMs: 0 });

    const result = await port.saveArtifact(samplePayload());

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("expected storage-unavailable");
    expect(result.error).toMatchObject({
      reason: "storage-unavailable",
      artifactId: "artifact-1",
      cause: expect.any(Error),
    });
  });

  it.each([
    ["QuotaExceededError", "quota-exceeded"],
    ["AbortError", "write-aborted"],
  ] as const)("classifies %s at the browser write boundary", async (name, reason) => {
    const cause = new DOMException(name, name);
    vi.spyOn(browserStorage, "getBrowserStorageDb").mockReturnValue(
      Promise.resolve({ put: vi.fn().mockRejectedValue(cause) } as never),
    );
    const port = createBrowserPersistencePort({ saveLatencyMs: 0 });

    const result = await port.saveArtifact(samplePayload());

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error(`expected ${reason}`);
    expect(result.error).toEqual({ reason, artifactId: "artifact-1", cause });
  });

  it("does not flatten an unknown adapter defect", async () => {
    const defect = new Error("programming defect");
    vi.spyOn(browserStorage, "getBrowserStorageDb").mockReturnValue(
      Promise.resolve({ put: vi.fn().mockRejectedValue(defect) } as never),
    );
    const port = createBrowserPersistencePort({ saveLatencyMs: 0 });

    await expect(port.saveArtifact(samplePayload())).rejects.toBe(defect);
  });
});

function savedValue(
  result: Awaited<ReturnType<ReturnType<typeof createBrowserPersistencePort>["saveArtifact"]>>,
) {
  if (result.isErr()) throw new Error(`expected successful save, received ${result.error.reason}`);
  return result.value;
}
