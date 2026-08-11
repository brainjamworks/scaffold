import type { JSONContent } from "@tiptap/core";
import type { ScaffoldArtifact, CourseMode } from "@scaffold/contracts";
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

export interface ArtifactPersistencePort {
  saveArtifact: (payload: ArtifactSavePayload) => Promise<ArtifactSaveResult>;
}
