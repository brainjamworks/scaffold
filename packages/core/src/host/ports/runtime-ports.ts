import type { AssessmentPort } from "./assessment";
import type { LearnerActivityPort } from "./learner-activity";
import type { MediaPort } from "./media";

export interface ScaffoldRuntimePorts {
  assessment?: AssessmentPort | null;
  learnerActivity?: LearnerActivityPort | null;
  media?: MediaPort | null;
}
