import type {
  LearnerPublicationPayload,
  LearnerPublicationPort,
  LearnerPublicationPortError,
  LearnerPublicationPortErrorCode,
  LearnerPublicationStatus,
} from "@scaffold/core/ports";

import { moodleCall, type MoodleAjaxResponse } from "./api";

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
      return authoritativeStatus;
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
        return authoritativeStatus;
      } catch (error) {
        throw typedPublicationError(error);
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

function typedPublicationError(error: unknown): unknown {
  const message = error instanceof Error ? error.message : String(error);
  const code: LearnerPublicationPortErrorCode | null = message.includes("stale-artifact-revision")
    ? "stale-artifact-revision"
    : message.includes("not authorized") || message.includes("permission")
      ? "forbidden"
      : null;
  if (code === null) return error;
  return Object.assign(new Error(message), { code }) satisfies LearnerPublicationPortError;
}
