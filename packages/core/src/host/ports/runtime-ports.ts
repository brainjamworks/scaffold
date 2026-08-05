import type { AssessmentPort } from "./assessment";
import type { LearnerActivityPort } from "./learner-activity";
import type { LearningEventPort } from "./learning-events";
import type { MediaPort } from "./media";

export interface ScaffoldRuntimePorts {
  assessment?: AssessmentPort | null;
  learnerActivity?: LearnerActivityPort | null;
  learningEvents?: LearningEventPort | null;
  media?: MediaPort | null;
}
