import type { JSONContent } from "@tiptap/core";
import type {
  AssessmentGroupContract,
  AssessmentTargetContract,
  ScaffoldArtifact,
  CourseMode,
} from "@scaffold/contracts";

export type SaveableScaffoldArtifact = Omit<ScaffoldArtifact, "content"> & {
  content: JSONContent;
};

export interface ArtifactSaveBundle {
  /** Authoring copy, including private authoring data and answer keys. */
  artifact: SaveableScaffoldArtifact;
  /** Runtime document shown to learners; private assessment data is redacted. */
  learnerContent: JSONContent;
  /** Private per-question grading contracts for the host/backend. */
  assessmentTargets: AssessmentTargetContract[];
  /** Group contracts such as Quiz target order and review/timer settings. */
  assessmentGroups: AssessmentGroupContract[];
}

export interface ArtifactSaveResult {
  artifact?:
    | {
        title?: string | undefined;
        mode?: CourseMode | undefined;
      }
    | undefined;
}

export interface ArtifactPersistencePort {
  saveArtifact: (bundle: ArtifactSaveBundle) => Promise<ArtifactSaveResult | void>;
}
