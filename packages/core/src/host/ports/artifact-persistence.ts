import type { JSONContent } from "@tiptap/core";
import type { ScaffoldArtifact, CourseMode } from "@scaffold/contracts";
import { Result, type Result as ResultType } from "better-result";
import type { ArtifactRevision } from "./learner-publication";

export type SaveableScaffoldArtifact = Omit<ScaffoldArtifact, "content"> & {
  content: JSONContent;
};

export interface ArtifactSavePayload {
  /** Canonical authoring copy, including private authoring data and answer keys. */
  artifact: SaveableScaffoldArtifact;
}

export interface ArtifactSaveResult {
  artifactRevision: ArtifactRevision;
  artifact?:
    | {
        title?: string | undefined;
        mode?: CourseMode | undefined;
      }
    | undefined;
}

export type ArtifactPersistenceFailure =
  | {
      readonly reason: "storage-unavailable";
      readonly artifactId: string;
      readonly cause: unknown;
    }
  | {
      readonly reason: "quota-exceeded";
      readonly artifactId: string;
      readonly cause: unknown;
    }
  | {
      readonly reason: "write-aborted";
      readonly artifactId: string;
      readonly cause: unknown;
    };

export type ArtifactPersistenceResult = ResultType<ArtifactSaveResult, ArtifactPersistenceFailure>;

export function artifactSaveSucceeded(result: ArtifactSaveResult): ArtifactPersistenceResult {
  return Result.ok(result);
}

export function artifactSaveFailed(failure: ArtifactPersistenceFailure): ArtifactPersistenceResult {
  return Result.err(failure);
}

export interface ArtifactPersistencePort {
  saveArtifact: (payload: ArtifactSavePayload) => Promise<ArtifactPersistenceResult>;
}
