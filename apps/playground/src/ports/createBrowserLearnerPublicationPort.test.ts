// @vitest-environment happy-dom
import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type {
  LearnerPublicationPayload,
  LearnerPublicationStatus,
  LearnerPublicationStatusResult,
  LearnerPublishResult,
} from "@scaffold/core/ports";

import { resetBrowserStorage } from "./browserStorageDb";
import { createBrowserLearnerPublicationPort } from "./createBrowserLearnerPublicationPort";
import { createBrowserPersistencePort } from "./createBrowserPersistencePort";

const artifactId = "artifact-1";

function publicationPayload(
  sourceArtifactRevision: string,
  title = "Published page",
): LearnerPublicationPayload {
  return {
    sourceArtifactRevision,
    artifact: {
      id: artifactId,
      title,
      mode: "page",
      requiresScaffoldPlus: false,
    },
    learnerContent: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: title }] }],
    },
    assessmentTargets: [],
    assessmentGroups: [],
  };
}

describe("createBrowserLearnerPublicationPort", () => {
  beforeEach(async () => {
    await resetBrowserStorage();
  });

  afterEach(async () => {
    await resetBrowserStorage();
  });

  it("starts not published and atomically activates the saved revision", async () => {
    const drafts = createBrowserPersistencePort({ saveLatencyMs: 0 });
    const publications = createBrowserLearnerPublicationPort(artifactId);
    const saved = savedValue(
      await drafts.saveArtifact({
        artifact: {
          id: artifactId,
          title: "Canonical draft",
          mode: "page",
          content: { type: "doc", content: [] },
        },
      }),
    );

    expect(publicationValue(await publications.getStatus())).toEqual({
      currentArtifactRevision: saved.artifactRevision,
      publishedArtifactRevision: null,
      publishedAt: null,
    });
    expect(await publications.loadPublication()).toBeNull();

    const payload = publicationPayload(saved.artifactRevision);
    const status = publicationValue(await publications.publish(payload));
    expect(status).toEqual({
      currentArtifactRevision: saved.artifactRevision,
      publishedArtifactRevision: saved.artifactRevision,
      publishedAt: expect.any(String),
    });
    expect(await publications.loadPublication()).toEqual({
      payload,
      publishedAt: status.publishedAt,
    });
  });

  it("keeps the active publication when a later save makes a request stale", async () => {
    const drafts = createBrowserPersistencePort({ saveLatencyMs: 0 });
    const publications = createBrowserLearnerPublicationPort(artifactId);
    const first = savedValue(
      await drafts.saveArtifact({
        artifact: {
          id: artifactId,
          title: "First draft",
          mode: "page",
          content: { type: "doc", content: [] },
        },
      }),
    );
    const firstPayload = publicationPayload(first.artifactRevision, "First publication");
    const firstStatus = publicationValue(await publications.publish(firstPayload));

    const second = savedValue(
      await drafts.saveArtifact({
        artifact: {
          id: artifactId,
          title: "Second draft",
          mode: "page",
          content: { type: "doc", content: [] },
        },
      }),
    );
    expect(publicationValue(await publications.getStatus())).toEqual({
      currentArtifactRevision: second.artifactRevision,
      publishedArtifactRevision: first.artifactRevision,
      publishedAt: firstStatus.publishedAt,
    });

    const stale = await publications.publish(firstPayload);
    expect(stale.isErr()).toBe(true);
    if (stale.isOk()) throw new Error("expected stale publication to fail");
    expect(stale.error).toMatchObject({
      reason: "stale-artifact-revision",
      artifactId,
      sourceArtifactRevision: first.artifactRevision,
      cause: expect.any(Error),
    });
    expect(await publications.loadPublication()).toEqual({
      payload: firstPayload,
      publishedAt: firstStatus.publishedAt,
    });

    const secondPayload = publicationPayload(second.artifactRevision, "Second publication");
    const secondStatus = publicationValue(await publications.publish(secondPayload));
    expect(secondStatus.publishedArtifactRevision).toBe(second.artifactRevision);
    expect(await publications.loadPublication()).toEqual({
      payload: secondPayload,
      publishedAt: secondStatus.publishedAt,
    });
  });

  it("reset clears both the canonical draft and publication records", async () => {
    const drafts = createBrowserPersistencePort({ saveLatencyMs: 0 });
    const publications = createBrowserLearnerPublicationPort(artifactId);
    const saved = savedValue(
      await drafts.saveArtifact({
        artifact: {
          id: artifactId,
          title: "Draft",
          mode: "page",
          content: { type: "doc", content: [] },
        },
      }),
    );
    await publications.publish(publicationPayload(saved.artifactRevision));

    await resetBrowserStorage();

    expect(await drafts.loadArtifact(artifactId)).toBeNull();
    expect(await publications.loadPublication()).toBeNull();
  });

  it("returns reason-specific invalid-payload and unavailable-storage failures", async () => {
    const publications = createBrowserLearnerPublicationPort(artifactId);
    const validPayload = publicationPayload("revision-1");
    const wrongArtifact = {
      ...validPayload,
      artifact: { ...validPayload.artifact, id: "another-artifact" },
    };

    const invalid = await publications.publish(wrongArtifact);
    expect(invalid.isErr()).toBe(true);
    if (invalid.isOk()) throw new Error("expected invalid payload failure");
    expect(invalid.error).toMatchObject({
      reason: "invalid-payload",
      artifactId,
      cause: expect.any(Error),
    });

    vi.stubGlobal("indexedDB", undefined);
    const statusFailure = await publications.getStatus();
    expect(statusFailure.isErr()).toBe(true);
    if (statusFailure.isOk()) throw new Error("expected unavailable storage status failure");
    expect(statusFailure.error).toMatchObject({
      reason: "storage-unavailable",
      artifactId,
      cause: expect.any(Error),
    });
    const publishFailure = await publications.publish(publicationPayload("revision-1"));
    expect(publishFailure.isErr()).toBe(true);
    if (publishFailure.isOk()) throw new Error("expected unavailable storage publish failure");
    expect(publishFailure.error).toMatchObject({
      reason: "storage-unavailable",
      artifactId,
      cause: expect.any(Error),
    });
    vi.unstubAllGlobals();
  });
});

function savedValue(
  result: Awaited<ReturnType<ReturnType<typeof createBrowserPersistencePort>["saveArtifact"]>>,
) {
  if (result.isErr()) throw new Error(`expected successful save, received ${result.error.reason}`);
  return result.value;
}

function publicationValue(
  result: LearnerPublicationStatusResult | LearnerPublishResult,
): LearnerPublicationStatus {
  if (result.isErr()) throw new Error("expected publication operation to succeed");
  return result.value;
}
