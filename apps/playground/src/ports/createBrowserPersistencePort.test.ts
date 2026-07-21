// @vitest-environment happy-dom
import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import type { ArtifactSaveBundle } from "@scaffold/core/ports";

import { createBrowserPersistencePort } from "./createBrowserPersistencePort";
import { resetBrowserStorage } from "./browserStorageDb";

const sampleBundle = (overrides: Partial<ArtifactSaveBundle> = {}): ArtifactSaveBundle => ({
  artifact: {
    id: "artifact-1",
    title: "Untitled",
    mode: "page",
    content: { type: "doc", content: [] },
  },
  learnerContent: { type: "doc", content: [] },
  assessmentTargets: [],
  assessmentGroups: [],
  ...overrides,
});

describe("createBrowserPersistencePort", () => {
  beforeEach(async () => {
    await resetBrowserStorage();
  });

  afterEach(async () => {
    await resetBrowserStorage();
  });

  it("persists a saved artifact and reads it back", async () => {
    const port = createBrowserPersistencePort({ saveLatencyMs: 0 });
    const result = await port.saveArtifact(
      sampleBundle({
        artifact: {
          ...sampleBundle().artifact,
          title: "Page one",
        },
      }),
    );
    expect(result).toEqual({ artifact: { title: "Page one" } });

    const loaded = await port.loadArtifact("artifact-1");
    expect(loaded).not.toBeNull();
    expect(loaded?.artifact.title).toBe("Page one");
    expect(loaded?.artifact.id).toBe("artifact-1");
    expect(loaded?.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns null for an unknown artifact", async () => {
    const port = createBrowserPersistencePort({ saveLatencyMs: 0 });
    const loaded = await port.loadArtifact("missing");
    expect(loaded).toBeNull();
  });

  it("overwrites the same artifact id on subsequent saves", async () => {
    const port = createBrowserPersistencePort({ saveLatencyMs: 0 });
    await port.saveArtifact(
      sampleBundle({
        artifact: { ...sampleBundle().artifact, title: "First" },
      }),
    );
    await port.saveArtifact(
      sampleBundle({
        artifact: { ...sampleBundle().artifact, title: "Second" },
      }),
    );
    const loaded = await port.loadArtifact("artifact-1");
    expect(loaded?.artifact.title).toBe("Second");
  });

  it("clearArtifact removes a single artifact and leaves others intact", async () => {
    const port = createBrowserPersistencePort({ saveLatencyMs: 0 });
    await port.saveArtifact(
      sampleBundle({
        artifact: { ...sampleBundle().artifact, id: "artifact-1" },
      }),
    );
    await port.saveArtifact(
      sampleBundle({
        artifact: { ...sampleBundle().artifact, id: "artifact-2" },
      }),
    );
    await port.clearArtifact("artifact-1");
    expect(await port.loadArtifact("artifact-1")).toBeNull();
    expect(await port.loadArtifact("artifact-2")).not.toBeNull();
  });

  it("applies synthetic latency when configured", async () => {
    const port = createBrowserPersistencePort({ saveLatencyMs: 50 });
    const start = Date.now();
    await port.saveArtifact(sampleBundle());
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });
});
