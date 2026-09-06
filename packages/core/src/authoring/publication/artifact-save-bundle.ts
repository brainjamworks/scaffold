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

export type LearnerPublicationPayloadPart =
  | "learner-content"
  | "assessment-targets"
  | "assessment-groups";

export class ArtifactSavePayloadError extends Error {
  readonly part: LearnerPublicationPayloadPart;
  readonly measuredBytes: number;
  readonly limitBytes: number;

  constructor({
    part,
    label,
    verb,
    bytes,
    limit,
  }: {
    readonly part: LearnerPublicationPayloadPart;
    readonly label: string;
    readonly verb: "is" | "are";
    readonly bytes: number;
    readonly limit: number;
  }) {
    super(`${label} ${verb} too large to publish (${bytes} bytes, limit ${limit} bytes).`);
    this.name = "ArtifactSavePayloadError";
    this.part = part;
    this.measuredBytes = bytes;
    this.limitBytes = limit;
  }
}

function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function assertPayloadSize(
  part: LearnerPublicationPayloadPart,
  label: string,
  verb: "is" | "are",
  bytes: number,
  limit: number,
) {
  if (bytes <= limit) return;
  throw new ArtifactSavePayloadError({ part, label, verb, bytes, limit });
}

export function createArtifactSavePayload(input: ArtifactSaveProjectionInput): ArtifactSavePayload {
  return { artifact: input.artifact };
}

export function validateLearnerPublicationPayloadSize(
  publication: Extract<LearnerPublicationProjection, { readonly status: "supported" }>,
): void {
  assertPayloadSize(
    "learner-content",
    "Learner content",
    "is",
    jsonByteLength(publication.learnerContent),
    ARTIFACT_SAVE_PAYLOAD_LIMITS.learnerContentBytes,
  );
  assertPayloadSize(
    "assessment-targets",
    "Assessment targets",
    "are",
    jsonByteLength(publication.assessmentTargets),
    ARTIFACT_SAVE_PAYLOAD_LIMITS.assessmentTargetsBytes,
  );
  assertPayloadSize(
    "assessment-groups",
    "Assessment groups",
    "are",
    jsonByteLength(publication.assessmentGroups),
    ARTIFACT_SAVE_PAYLOAD_LIMITS.assessmentGroupsBytes,
  );
}
