import type {
  LearnerPublishFailure,
  LearnerPublicationPayload,
  LearnerPublicationPort,
  LearnerPublicationStatus,
} from "@scaffold/core/ports";
import {
  learnerPublicationStatusSucceeded,
  learnerPublishFailed,
  learnerPublishSucceeded,
} from "@scaffold/core/ports";

import { MoodleServiceError, moodleCall, type MoodleAjaxResponse } from "./api";

interface PublishContentResponse extends MoodleAjaxResponse {
  publicationStatusJson?: unknown;
}

export function createMoodleLearnerPublicationPort(
  cmid: number,
  initialStatus: LearnerPublicationStatus,
): LearnerPublicationPort {
  let authoritativeStatus = initialStatus;
  return {
    async getStatus() {
      return learnerPublicationStatusSucceeded(authoritativeStatus);
    },

    async publish(payload: LearnerPublicationPayload) {
      try {
        const response = await moodleCall<PublishContentResponse>("mod_scaffold_publish_content", {
          cmid,
          sourceartifactrevision: payload.sourceArtifactRevision,
          artifactmetadatajson: JSON.stringify(payload.artifact),
          learnercontentjson: JSON.stringify(payload.learnerContent),
          assessmenttargetsjson: JSON.stringify(payload.assessmentTargets),
          assessmentgroupsjson: JSON.stringify(payload.assessmentGroups),
        });
        authoritativeStatus = parseMoodlePublicationStatus(response.publicationStatusJson);
        return learnerPublishSucceeded(authoritativeStatus);
      } catch (cause) {
        if (!(cause instanceof MoodleServiceError)) throw cause;
        const failure = classifyMoodlePublicationFailure(cause, payload);
        if (failure === null) throw cause;
        return learnerPublishFailed(failure);
      }
    },
  };
}

export function parseMoodlePublicationStatus(value: unknown): LearnerPublicationStatus {
  let parsed: unknown;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw new Error("Moodle publication status is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Moodle publication status must be an object");
  }
  const status = parsed as Record<string, unknown>;
  const publishedRevision = status["publishedArtifactRevision"];
  const publishedAt = status["publishedAt"];
  if (
    typeof status["currentArtifactRevision"] !== "string" ||
    !status["currentArtifactRevision"] ||
    (publishedRevision !== null && typeof publishedRevision !== "string") ||
    (publishedAt !== null && typeof publishedAt !== "string") ||
    (publishedRevision === null) !== (publishedAt === null)
  ) {
    throw new Error("Moodle publication status is invalid");
  }
  return {
    currentArtifactRevision: status["currentArtifactRevision"],
    publishedArtifactRevision: publishedRevision,
    publishedAt,
  };
}

function classifyMoodlePublicationFailure(
  cause: MoodleServiceError,
  payload: LearnerPublicationPayload,
): LearnerPublishFailure | null {
  if (cause.service.errorCode === "publicationstaleartifactrevision") {
    return {
      reason: "stale-artifact-revision",
      artifactId: payload.artifact.id,
      sourceArtifactRevision: payload.sourceArtifactRevision,
      cause,
    };
  }
  if (cause.service.errorCode === "nopermissions") {
    return { reason: "forbidden", artifactId: payload.artifact.id, cause };
  }
  if (cause.service.errorCode === "invalidparameter") {
    return { reason: "invalid-payload", artifactId: payload.artifact.id, cause };
  }
  return null;
}
