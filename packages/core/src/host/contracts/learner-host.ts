import type { JSONContent } from "@tiptap/core";
import type {
  AssessmentLearnerSnapshot,
  CourseMode,
  LearnerActivitySnapshot,
} from "@scaffold/contracts";

import type { AssessmentPort } from "../ports/assessment";
import type { LearnerActivityPort } from "../ports/learner-activity";
import type { MediaPort } from "../ports/media";

export interface ScaffoldLearnerInitialState {
  assessmentSnapshot?: AssessmentLearnerSnapshot;
  learnerActivitySnapshot?: LearnerActivitySnapshot;
}

export interface ScaffoldLearnerBootstrap {
  artifactId: string;
  title: string;
  mode: CourseMode;
  learnerContent: JSONContent;
  initialLearnerState?: ScaffoldLearnerInitialState;
}

export interface ScaffoldLearnerHostServices {
  assessment?: AssessmentPort | null;
  learnerActivity?: LearnerActivityPort | null;
  media?: MediaPort | null;
}
