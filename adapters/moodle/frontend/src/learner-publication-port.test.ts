import { describe, expect, it, vi } from "vite-plus/test";

import type {
  LearnerPublicationPayload,
  LearnerPublicationStatus,
  LearnerPublicationStatusResult,
  LearnerPublishResult,
} from "@scaffold/core/ports";

const mocks = vi.hoisted(() => ({
  moodleCall: vi.fn(),
  MoodleServiceError: class MoodleServiceError extends Error {
    constructor(
      message: string,
      readonly service = {
        errorCode: null as string | null,
        debugInfo: null as string | null,
        exceptionName: null as string | null,
      },
    ) {
      super(message);
    }
  },
}));

vi.mock("./api", () => ({
  moodleCall: mocks.moodleCall,
  MoodleServiceError: mocks.MoodleServiceError,
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

    expect(publicationValue(await port.getStatus())).toBe(initialStatus);
    expect(publicationValue(await port.publish(payload))).toEqual(publishedStatus);
    expect(publicationValue(await port.getStatus())).toEqual(publishedStatus);
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
    const cause = new mocks.MoodleServiceError(
      "The saved Scaffold content changed before publication.",
      {
        errorCode: "publicationstaleartifactrevision",
        debugInfo: null,
        exceptionName: "moodle_exception",
      },
    );
    mocks.moodleCall.mockRejectedValueOnce(cause);
    const port = createMoodleLearnerPublicationPort(42, initialStatus);

    const result = await port.publish(payload);
    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("expected stale publication to fail");
    expect(result.error).toEqual({
      reason: "stale-artifact-revision",
      artifactId: "moodle-cm-42",
      sourceArtifactRevision: "revision-1",
      cause,
    });
    expect(publicationValue(await port.getStatus())).toBe(initialStatus);
  });

  it.each([
    { errorCode: "nopermissions", detail: null, reason: "forbidden" },
    {
      errorCode: "invalidparameter",
      detail: "Published learner content is not supported",
      reason: "invalid-payload",
    },
  ] as const)(
    "classifies $reason at the Moodle boundary",
    async ({ errorCode, detail, reason }) => {
      const cause = new mocks.MoodleServiceError("Moodle service refused publication", {
        errorCode,
        debugInfo: detail,
        exceptionName: "moodle_exception",
      });
      mocks.moodleCall.mockRejectedValueOnce(cause);
      const port = createMoodleLearnerPublicationPort(42, initialStatus);

      const result = await port.publish(payload);

      expect(result.isErr()).toBe(true);
      if (result.isOk()) throw new Error(`expected ${reason} publication failure`);
      expect(result.error).toEqual({
        reason,
        artifactId: "moodle-cm-42",
        cause,
      });
    },
  );

  it("keeps an unknown Moodle service failure observable", async () => {
    const cause = new mocks.MoodleServiceError("Database write failed", {
      errorCode: "dmlwriteexception",
      debugInfo: "Unexpected storage failure",
      exceptionName: "dml_write_exception",
    });
    mocks.moodleCall.mockRejectedValueOnce(cause);
    const port = createMoodleLearnerPublicationPort(42, initialStatus);

    await expect(port.publish(payload)).rejects.toBe(cause);
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

function publicationValue(
  result: LearnerPublicationStatusResult | LearnerPublishResult,
): LearnerPublicationStatus {
  if (result.isErr()) throw new Error("expected publication operation to succeed");
  return result.value;
}
