import type { ArtifactSavePayload, SaveableScaffoldArtifact } from "@/host/ports";

import type { LearnerPublicationProjection } from "./document-projection";

export interface ArtifactSaveProjectionInput {
  artifact: SaveableScaffoldArtifact;
}

export const ARTIFACT_SAVE_PAYLOAD_LIMITS = {
  learnerContentBytes: 2 * 1024 * 1024,
  assessmentTargetsBytes: 1 * 1024 * 1024,
  assessmentGroupsBytes: 512 * 1024,
} as const;

export class ArtifactSavePayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactSavePayloadError";
  }
}

function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function assertPayloadSize(
  label: string,
  verb: "is" | "are",
  action: "publish" | "save",
  bytes: number,
  limit: number,
) {
  if (bytes <= limit) return;
  throw new ArtifactSavePayloadError(
    `${label} ${verb} too large to ${action} (${bytes} bytes, limit ${limit} bytes).`,
  );
}

export function createArtifactSavePayload(input: ArtifactSaveProjectionInput): ArtifactSavePayload {
  return { artifact: input.artifact };
}

export function validateLearnerPublicationPayloadSize(
  publication: Extract<LearnerPublicationProjection, { readonly status: "supported" }>,
): void {
  assertPayloadSize(
    "Learner content",
    "is",
    "publish",
    jsonByteLength(publication.learnerContent),
    ARTIFACT_SAVE_PAYLOAD_LIMITS.learnerContentBytes,
  );
  assertPayloadSize(
    "Assessment targets",
    "are",
    "publish",
    jsonByteLength(publication.assessmentTargets),
    ARTIFACT_SAVE_PAYLOAD_LIMITS.assessmentTargetsBytes,
  );
  assertPayloadSize(
    "Assessment groups",
    "are",
    "publish",
    jsonByteLength(publication.assessmentGroups),
    ARTIFACT_SAVE_PAYLOAD_LIMITS.assessmentGroupsBytes,
  );
}
