import type {
  LearnerPublicationPayload,
  LearnerPublicationPort,
  LearnerPublicationPortError,
  LearnerPublicationPortErrorCode,
  LearnerPublicationStatus,
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
      return authoritativeStatus;
    },

    async publish(payload: LearnerPublicationPayload) {
      const response = await bridge.request<PublishContentResponse>("publication.publish", payload);
      if (response.success === false) {
        throw publicationHandlerError(response.error);
      }
      authoritativeStatus = parseXBlockPublicationStatus(response.publicationStatus);
      return authoritativeStatus;
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

function publicationHandlerError(value: unknown): LearnerPublicationPortError | Error {
  const message = typeof value === "string" ? value : "XBlock Publish was refused";
  const code: LearnerPublicationPortErrorCode | null = message.includes("stale-artifact-revision")
    ? "stale-artifact-revision"
    : message.includes("permission")
      ? "forbidden"
      : message.includes("payload") || message.includes("publication")
        ? "invalid-payload"
        : null;
  return code === null ? new Error(message) : Object.assign(new Error(message), { code });
}
