import type { AssessmentLearnerSnapshot, LearnerActivitySnapshot } from "@scaffold/contracts";
import type { ScaffoldArtifact } from "@scaffold/core/format";
import type { LearnerPublicationStatus, ScaffoldLearnerPublication } from "@scaffold/core/ports";

export type MoodleSurface = "authoring" | "learner";

interface MoodleApplicationBaseConfig {
  cmid: number;
  scaffoldid: number;
  wwwroot: string;
  sesskey: string;
}

export type MoodleApplicationConfig = MoodleApplicationBaseConfig &
  (
    | {
        surface: "authoring";
        returnUrl: string;
      }
    | {
        surface: "learner";
        returnUrl?: never;
      }
  );

export type MoodleOuterBootstrapConfig = MoodleApplicationConfig & {
  bundleUrl: string;
  innerUrl: string;
};

export interface MoodleArtifactMetadata {
  readonly id: string;
  readonly title: string;
  readonly mode: ScaffoldArtifact["mode"];
}

export type MoodleArtifactAccess =
  | {
      readonly status: "supported";
      readonly artifact: MoodleArtifactMetadata;
    }
  | {
      readonly status: "not-published";
      readonly artifact: MoodleArtifactMetadata;
    }
  | {
      readonly status: "requires-scaffold-plus";
      readonly artifact: MoodleArtifactMetadata;
    }
  | {
      readonly status: "invalid";
      readonly artifact: MoodleArtifactMetadata;
    }
  | {
      readonly status: "unsupported-core-format";
      readonly artifact: MoodleArtifactMetadata;
      readonly documentVersion: number;
      readonly supportedVersion: number;
    };

export interface MoodlePayload {
  artifactAccess: MoodleArtifactAccess;
  artifact: ScaffoldArtifact | null;
  assessmentSnapshot?: AssessmentLearnerSnapshot;
  learnerActivitySnapshot?: LearnerActivitySnapshot;
  learnerPublication?: ScaffoldLearnerPublication;
  publicationStatus?: LearnerPublicationStatus;
}
