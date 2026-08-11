import { describe, expect, it, vi } from "vite-plus/test";

import type { LearnerPublicationPayload } from "@scaffold/core/ports";

const mocks = vi.hoisted(() => ({
  moodleCall: vi.fn(),
}));

vi.mock("./api", () => ({
  moodleCall: mocks.moodleCall,
}));

import { createMoodleLearnerPublicationPort } from "./learner-publication-port";

const initialStatus = {
  currentArtifactRevision: "revision-1",
  publishedArtifactRevision: null,
  publishedAt: null,
};

const payload: LearnerPublicationPayload = {
  sourceArtifactRevision: "revision-1",
  artifact: {
    id: "moodle-cm-42",
    title: "Published title",
    mode: "page",
    requiresScaffoldPlus: false,
  },
  learnerContent: { type: "doc", content: [] },
  assessmentTargets: [],
  assessmentGroups: [],
};

describe("createMoodleLearnerPublicationPort", () => {
  it("returns the bootstrap status and sends one publication-only request", async () => {
    const publishedStatus = {
      currentArtifactRevision: "revision-1",
      publishedArtifactRevision: "revision-1",
      publishedAt: "2026-08-10T10:00:00Z",
    };
    mocks.moodleCall.mockResolvedValueOnce({
      success: true,
      publicationStatusJson: JSON.stringify(publishedStatus),
    });
    const port = createMoodleLearnerPublicationPort(42, initialStatus);

    await expect(port.getStatus()).resolves.toBe(initialStatus);
    await expect(port.publish(payload)).resolves.toEqual(publishedStatus);
    await expect(port.getStatus()).resolves.toEqual(publishedStatus);
    expect(mocks.moodleCall).toHaveBeenCalledWith("mod_scaffold_publish_content", {
      cmid: 42,
      sourceartifactrevision: "revision-1",
      artifactmetadatajson: JSON.stringify(payload.artifact),
      learnercontentjson: JSON.stringify(payload.learnerContent),
      assessmenttargetsjson: JSON.stringify(payload.assessmentTargets),
      assessmentgroupsjson: JSON.stringify(payload.assessmentGroups),
    });
    expect(mocks.moodleCall).not.toHaveBeenCalledWith(
      "mod_scaffold_save_content",
      expect.anything(),
    );
  });

  it("returns a typed stale refusal without changing the previous status", async () => {
    mocks.moodleCall.mockRejectedValueOnce(new Error("stale-artifact-revision"));
    const port = createMoodleLearnerPublicationPort(42, initialStatus);

    await expect(port.publish(payload)).rejects.toMatchObject({
      code: "stale-artifact-revision",
    });
    await expect(port.getStatus()).resolves.toBe(initialStatus);
  });

  it("rejects malformed authoritative status responses", async () => {
    mocks.moodleCall.mockResolvedValueOnce({
      success: true,
      publicationStatusJson: JSON.stringify({
        currentArtifactRevision: "revision-1",
        publishedArtifactRevision: 7,
        publishedAt: null,
      }),
    });
    const port = createMoodleLearnerPublicationPort(42, initialStatus);

    await expect(port.publish(payload)).rejects.toThrow("publication status");
  });
});
