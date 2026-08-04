import type { AssessmentPort } from "./assessment";
import type { LearnerActivityPort } from "./learner-activity";
import type { LearningEventPort } from "./learning-events";
import type { MediaPort } from "./media";
import type { XapiPort } from "./xapi";

export interface ScaffoldRuntimePorts {
  assessment?: AssessmentPort | null;
  learnerActivity?: LearnerActivityPort | null;
  learningEvents?: LearningEventPort | null;
  media?: MediaPort | null;
  xapi?: XapiPort | null;
}
