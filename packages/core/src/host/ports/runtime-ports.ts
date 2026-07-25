import type { AssessmentPort } from "./assessment";
import type { LearnerActivityPort } from "./learner-activity";
import type { MediaPort } from "./media";
import type { XapiPort } from "./xapi";

export interface ScaffoldRuntimePorts {
  assessment?: AssessmentPort | null;
  learnerActivity?: LearnerActivityPort | null;
  media?: MediaPort | null;
  xapi?: XapiPort | null;
}
