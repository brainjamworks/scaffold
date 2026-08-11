// @vitest-environment happy-dom
import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import type { LearnerPublicationPayload } from "@scaffold/core/ports";

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
    const saved = await drafts.saveArtifact({
      artifact: {
        id: artifactId,
        title: "Canonical draft",
        mode: "page",
        content: { type: "doc", content: [] },
      },
    });

    await expect(publications.getStatus()).resolves.toEqual({
      currentArtifactRevision: saved.artifactRevision,
      publishedArtifactRevision: null,
      publishedAt: null,
    });
    expect(await publications.loadPublication()).toBeNull();

    const payload = publicationPayload(saved.artifactRevision);
    const status = await publications.publish(payload);
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
    const first = await drafts.saveArtifact({
      artifact: {
        id: artifactId,
        title: "First draft",
        mode: "page",
        content: { type: "doc", content: [] },
      },
    });
    const firstPayload = publicationPayload(first.artifactRevision, "First publication");
    const firstStatus = await publications.publish(firstPayload);

    const second = await drafts.saveArtifact({
      artifact: {
        id: artifactId,
        title: "Second draft",
        mode: "page",
        content: { type: "doc", content: [] },
      },
    });
    await expect(publications.getStatus()).resolves.toEqual({
      currentArtifactRevision: second.artifactRevision,
      publishedArtifactRevision: first.artifactRevision,
      publishedAt: firstStatus.publishedAt,
    });

    await expect(publications.publish(firstPayload)).rejects.toMatchObject({
      code: "stale-artifact-revision",
    });
    expect(await publications.loadPublication()).toEqual({
      payload: firstPayload,
      publishedAt: firstStatus.publishedAt,
    });

    const secondPayload = publicationPayload(second.artifactRevision, "Second publication");
    const secondStatus = await publications.publish(secondPayload);
    expect(secondStatus.publishedArtifactRevision).toBe(second.artifactRevision);
    expect(await publications.loadPublication()).toEqual({
      payload: secondPayload,
      publishedAt: secondStatus.publishedAt,
    });
  });

  it("reset clears both the canonical draft and publication records", async () => {
    const drafts = createBrowserPersistencePort({ saveLatencyMs: 0 });
    const publications = createBrowserLearnerPublicationPort(artifactId);
    const saved = await drafts.saveArtifact({
      artifact: {
        id: artifactId,
        title: "Draft",
        mode: "page",
        content: { type: "doc", content: [] },
      },
    });
    await publications.publish(publicationPayload(saved.artifactRevision));

    await resetBrowserStorage();

    expect(await drafts.loadArtifact(artifactId)).toBeNull();
    expect(await publications.loadPublication()).toBeNull();
  });
});
