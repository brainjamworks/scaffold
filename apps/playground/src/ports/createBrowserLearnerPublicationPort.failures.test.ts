// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test";

import type { LearnerPublicationPayload } from "@scaffold/core/ports";

const mocks = vi.hoisted(() => ({ getBrowserStorageDb: vi.fn() }));

vi.mock("./browserStorageDb", () => ({
  ARTIFACT_STORE: "artifact",
  PUBLICATION_STORE: "publication",
  getBrowserStorageDb: mocks.getBrowserStorageDb,
}));

import { createBrowserLearnerPublicationPort } from "./createBrowserLearnerPublicationPort";

const artifactId = "artifact-1";
const payload: LearnerPublicationPayload = {
  sourceArtifactRevision: "revision-1",
  artifact: {
    id: artifactId,
    title: "Published page",
    mode: "page",
    requiresScaffoldPlus: false,
  },
  learnerContent: { type: "doc", content: [] },
  assessmentTargets: [],
  assessmentGroups: [],
};

describe("browser learner publication failures", () => {
  it.each([
    { name: "AbortError", reason: "read-aborted" },
    { name: "SecurityError", reason: "storage-unavailable" },
  ] as const)("classifies $reason while reading status", async ({ name, reason }) => {
    const cause = new DOMException("read failed", name);
    mocks.getBrowserStorageDb.mockReturnValueOnce(Promise.reject(cause));

    const result = await createBrowserLearnerPublicationPort(artifactId).getStatus();

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error(`expected ${reason} status failure`);
    expect(result.error).toEqual({ reason, artifactId, cause });
  });

  it.each([
    { name: "QuotaExceededError", reason: "quota-exceeded" },
    { name: "AbortError", reason: "write-aborted" },
    { name: "InvalidStateError", reason: "storage-unavailable" },
  ] as const)("classifies $reason while publishing", async ({ name, reason }) => {
    const cause = new DOMException("write failed", name);
    mocks.getBrowserStorageDb.mockReturnValueOnce(Promise.reject(cause));

    const result = await createBrowserLearnerPublicationPort(artifactId).publish(payload);

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error(`expected ${reason} publication failure`);
    expect(result.error).toEqual({ reason, artifactId, cause });
  });

  it("keeps an unknown storage defect observable", async () => {
    const defect = new Error("broken IndexedDB invariant");
    mocks.getBrowserStorageDb.mockReturnValueOnce(Promise.reject(defect));

    await expect(createBrowserLearnerPublicationPort(artifactId).publish(payload)).rejects.toBe(
      defect,
    );
  });
});
