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

import type { BridgeHandlerResponse } from "./handler-response";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

interface PublishContentResponse extends BridgeHandlerResponse {
  publicationStatus?: unknown;
}

export function createXBlockLearnerPublicationPort(
  bridge: XBlockInnerBridge,
  initialStatus: LearnerPublicationStatus,
): LearnerPublicationPort {
  let authoritativeStatus = initialStatus;
  return {
    async getStatus() {
      return learnerPublicationStatusSucceeded(authoritativeStatus);
    },

    async publish(payload: LearnerPublicationPayload) {
      const response = await bridge.request<PublishContentResponse>("publication.publish", payload);
      if (response.success === false) {
        return learnerPublishFailed(publicationHandlerFailure(response.error, payload));
      }
      authoritativeStatus = parseXBlockPublicationStatus(response.publicationStatus);
      return learnerPublishSucceeded(authoritativeStatus);
    },
  };
}

export function parseXBlockPublicationStatus(value: unknown): LearnerPublicationStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("XBlock publication status must be an object");
  }
  const status = value as Record<string, unknown>;
  const publishedRevision = status["publishedArtifactRevision"];
  const publishedAt = status["publishedAt"];
  if (
    typeof status["currentArtifactRevision"] !== "string" ||
    !status["currentArtifactRevision"] ||
    (publishedRevision !== null && typeof publishedRevision !== "string") ||
    (publishedAt !== null && typeof publishedAt !== "string") ||
    (publishedRevision === null) !== (publishedAt === null)
  ) {
    throw new Error("XBlock publication status is invalid");
  }
  return {
    currentArtifactRevision: status["currentArtifactRevision"],
    publishedArtifactRevision: publishedRevision,
    publishedAt,
  };
}

function publicationHandlerFailure(
  value: unknown,
  payload: LearnerPublicationPayload,
): LearnerPublishFailure {
  if (typeof value !== "string") {
    throw new Error("XBlock publication refusal is malformed", { cause: value });
  }
  const message = value;
  const cause = new Error(message);
  if (message === "stale-artifact-revision") {
    return {
      reason: "stale-artifact-revision",
      artifactId: payload.artifact.id,
      sourceArtifactRevision: payload.sourceArtifactRevision,
      cause,
    };
  }
  if (message === "authoring permission required") {
    return { reason: "forbidden", artifactId: payload.artifact.id, cause };
  }
  if (message.startsWith("invalid-publication: ")) {
    return { reason: "invalid-payload", artifactId: payload.artifact.id, cause };
  }
  if (message === "publication-write-failed") {
    return { reason: "write-aborted", artifactId: payload.artifact.id, cause };
  }
  throw new Error(`Unknown XBlock publication refusal: ${message}`, { cause });
}
