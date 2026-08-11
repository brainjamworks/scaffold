import { useEffect, useState } from "react";

import {
  AssessmentLearnerSnapshotSchema,
  LearnerActivitySnapshotSchema,
} from "@scaffold/contracts";
import { ScaffoldArtifactSchema, type ScaffoldArtifact } from "@scaffold/core/format";
import type { ScaffoldLearnerPublication } from "@scaffold/core/ports";

import { moodleCall, parseJsonField, type MoodleAjaxResponse } from "./api";
import { parseMoodlePublicationStatus } from "./learner-publication-port";
import type {
  MoodleApplicationConfig,
  MoodleArtifactAccess,
  MoodleArtifactMetadata,
  MoodlePayload,
} from "./types";

interface PayloadResponse extends MoodleAjaxResponse {
  artifactAccessJson?: unknown;
  artifactJson?: unknown;
  assessmentSnapshotJson?: unknown;
  learnerActivitySnapshotJson?: unknown;
  learnerPublicationJson?: unknown;
  publicationStatusJson?: unknown;
}

export function useMoodlePayload(config: MoodleApplicationConfig): {
  readonly payload: MoodlePayload | null;
  readonly loadError: string | null;
} {
  const [payload, setPayload] = useState<MoodlePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const surface = config.surface;

  useEffect(() => {
    let cancelled = false;

    async function loadPayload() {
      try {
        const response = await moodleCall<PayloadResponse>("mod_scaffold_get_payload", {
          cmid: config.cmid,
          purpose: surface,
        });
        if (cancelled) return;
        const artifactAccess = parseArtifactAccess(
          parseJsonField(response.artifactAccessJson, null),
        );
        const isSupported = artifactAccess.status === "supported";
        if (surface === "learner" && !isJsonNull(response.artifactJson)) {
          throw new Error("Learner payload must not include a canonical artifact.");
        }
        if (surface === "authoring" && !isSupported && !isJsonNull(response.artifactJson)) {
          throw new Error("Withheld Scaffold content must not include an artifact.");
        }
        const parsedArtifact =
          surface === "authoring" && isSupported
            ? ScaffoldArtifactSchema.safeParse(parseJsonField(response.artifactJson, null))
            : null;
        if (parsedArtifact && !parsedArtifact.success) {
          throw new Error(parsedArtifact.error.message);
        }
        const artifact = parsedArtifact?.data ?? null;
        if (
          surface === "authoring" &&
          artifact &&
          !artifactMatchesMetadata(artifact, artifactAccess.artifact)
        ) {
          throw new Error("Scaffold artifact metadata does not match its access result.");
        }
        const assessmentSnapshot =
          surface === "learner" && isSupported
            ? AssessmentLearnerSnapshotSchema.parse(
                parseJsonField(response.assessmentSnapshotJson, null),
              )
            : undefined;
        const learnerActivitySnapshot =
          surface === "learner" && isSupported
            ? LearnerActivitySnapshotSchema.parse(
                parseJsonField(response.learnerActivitySnapshotJson, null),
              )
            : undefined;
        const learnerPublication =
          surface === "learner"
            ? parseLearnerPublication(parseJsonField(response.learnerPublicationJson, null))
            : undefined;
        const publicationStatus =
          surface === "authoring" && isSupported
            ? parseMoodlePublicationStatus(response.publicationStatusJson)
            : undefined;
        if (
          surface === "learner" &&
          !isSupported &&
          learnerPublication?.status !== artifactAccess.status
        ) {
          throw new Error("Learner publication does not match the artifact access result.");
        }
        setPayload({
          artifactAccess,
          artifact,
          ...(assessmentSnapshot === undefined ? {} : { assessmentSnapshot }),
          ...(learnerActivitySnapshot === undefined ? {} : { learnerActivitySnapshot }),
          ...(learnerPublication === undefined ? {} : { learnerPublication }),
          ...(publicationStatus === undefined ? {} : { publicationStatus }),
        });
      } catch (error) {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : "Scaffold content could not be loaded.",
        );
      }
    }

    void loadPayload();

    return () => {
      cancelled = true;
    };
  }, [config.cmid, surface]);

  return { payload, loadError };
}

function parseLearnerPublication(value: unknown): ScaffoldLearnerPublication {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Learner publication must be a JSON object.");
  }
  const publication = value as Record<string, unknown>;
  if (publication.status === "supported" && publication.learnerContent) {
    return publication as unknown as ScaffoldLearnerPublication;
  }
  if (
    publication.status === "unavailable-content" ||
    publication.status === "invalid" ||
    publication.status === "unsupported-core-format" ||
    publication.status === "requires-scaffold-plus" ||
    publication.status === "not-published"
  ) {
    return publication as unknown as ScaffoldLearnerPublication;
  }
  throw new Error("Learner publication status is invalid.");
}

function parseArtifactAccess(value: unknown): MoodleArtifactAccess {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Artifact access must be a JSON object.");
  }

  const access = value as Record<string, unknown>;
  const artifact = parseArtifactMetadata(access["artifact"]);
  if (
    access["status"] === "supported" ||
    access["status"] === "not-published" ||
    access["status"] === "requires-scaffold-plus" ||
    access["status"] === "invalid"
  ) {
    return { status: access["status"], artifact };
  }
  if (
    access["status"] === "unsupported-core-format" &&
    typeof access["documentVersion"] === "number" &&
    Number.isInteger(access["documentVersion"]) &&
    typeof access["supportedVersion"] === "number" &&
    Number.isInteger(access["supportedVersion"])
  ) {
    return {
      status: "unsupported-core-format",
      artifact,
      documentVersion: access["documentVersion"],
      supportedVersion: access["supportedVersion"],
    };
  }

  throw new Error("Artifact access status is invalid.");
}

function parseArtifactMetadata(value: unknown): MoodleArtifactMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Artifact access metadata must be a JSON object.");
  }
  const metadata = value as Record<string, unknown>;
  if (
    typeof metadata["id"] !== "string" ||
    typeof metadata["title"] !== "string" ||
    (metadata["mode"] !== "page" &&
      metadata["mode"] !== "slideshow" &&
      metadata["mode"] !== "branching")
  ) {
    throw new Error("Artifact access metadata is invalid.");
  }
  return {
    id: metadata["id"],
    title: metadata["title"],
    mode: metadata["mode"],
  };
}

function artifactMatchesMetadata(
  artifact: ScaffoldArtifact,
  metadata: MoodleArtifactMetadata,
): boolean {
  return (
    artifact.id === metadata.id &&
    artifact.title === metadata.title &&
    artifact.mode === metadata.mode
  );
}

function isJsonNull(value: unknown): boolean {
  return typeof value === "string" && value.trim() === "null";
}
