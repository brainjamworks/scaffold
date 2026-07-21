import type { AssessmentLearnerSnapshot, LearnerActivitySnapshot } from "@scaffold/contracts";
import type { ScaffoldArtifact } from "@scaffold/core/format";

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

export interface MoodlePayload {
  artifact: ScaffoldArtifact;
  assessmentSnapshot?: AssessmentLearnerSnapshot;
  learnerActivitySnapshot?: LearnerActivitySnapshot;
}
