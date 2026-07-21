import type { ArtifactSaveBundle, SaveableScaffoldArtifact } from "@/host/ports";

import { projectAssessmentDocument } from "./document-projection";

export interface ArtifactSaveProjectionInput {
  artifact: SaveableScaffoldArtifact;
}

export const ARTIFACT_SAVE_PAYLOAD_LIMITS = {
  artifactContentBytes: 2 * 1024 * 1024,
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

function assertPayloadSize(label: string, bytes: number, limit: number): void {
  if (bytes <= limit) return;
  throw new ArtifactSavePayloadError(
    `${label} is too large to save (${bytes} bytes, limit ${limit} bytes).`,
  );
}

export function validateArtifactSaveBundleSize(bundle: ArtifactSaveBundle): void {
  assertPayloadSize(
    "Artifact content",
    jsonByteLength(bundle.artifact.content),
    ARTIFACT_SAVE_PAYLOAD_LIMITS.artifactContentBytes,
  );
  assertPayloadSize(
    "Learner content",
    jsonByteLength(bundle.learnerContent),
    ARTIFACT_SAVE_PAYLOAD_LIMITS.learnerContentBytes,
  );
  assertPayloadSize(
    "Assessment targets",
    jsonByteLength(bundle.assessmentTargets),
    ARTIFACT_SAVE_PAYLOAD_LIMITS.assessmentTargetsBytes,
  );
  assertPayloadSize(
    "Assessment groups",
    jsonByteLength(bundle.assessmentGroups),
    ARTIFACT_SAVE_PAYLOAD_LIMITS.assessmentGroupsBytes,
  );
}

export function projectArtifactSaveBundle(input: ArtifactSaveProjectionInput): ArtifactSaveBundle {
  const projection = projectAssessmentDocument(input.artifact.content);
  return {
    artifact: input.artifact,
    learnerContent: projection.learnerDocument,
    assessmentTargets: projection.targets,
    assessmentGroups: projection.groups,
  };
}
