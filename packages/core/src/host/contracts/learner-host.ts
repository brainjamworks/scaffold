import type { JSONContent } from "@tiptap/core";
import type {
  AssessmentLearnerSnapshot,
  CourseMode,
  LearnerActivitySnapshot,
} from "@scaffold/contracts";

import type { AssessmentPort } from "../ports/assessment";
import type { LearnerActivityPort } from "../ports/learner-activity";
import type { LearningEventPort } from "../ports/learning-events";
import type { MediaPort } from "../ports/media";
import type { RequiresScaffoldPlusResult } from "./product-access";

export interface ScaffoldLearnerPublicationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: readonly (string | number)[];
}

export interface ScaffoldUnavailableContentRef {
  readonly kind: "block" | "layout" | "surface";
  readonly capabilityId: string;
  readonly stableId: string;
  readonly path: readonly (string | number)[];
}

export type ScaffoldLearnerPublication =
  | { readonly status: "supported"; readonly learnerContent: JSONContent }
  | { readonly status: "not-published" }
  | {
      readonly status: "unavailable-content";
      readonly unavailableContent: readonly ScaffoldUnavailableContentRef[];
    }
  | { readonly status: "invalid"; readonly issues: readonly ScaffoldLearnerPublicationIssue[] }
  | {
      readonly status: "unsupported-core-format";
      readonly documentVersion: number;
      readonly supportedVersion: number;
      readonly message: string;
    }
  | RequiresScaffoldPlusResult;

export interface ScaffoldLearnerInitialState {
  assessmentSnapshot?: AssessmentLearnerSnapshot;
  learnerActivitySnapshot?: LearnerActivitySnapshot;
}

export interface ScaffoldLearnerBootstrap {
  artifactId: string;
  title: string;
  mode: CourseMode;
  publication: ScaffoldLearnerPublication;
  initialLearnerState?: ScaffoldLearnerInitialState;
}

export interface ScaffoldLearnerHostServices {
  assessment?: AssessmentPort | null;
  learnerActivity?: LearnerActivityPort | null;
  learningEvents?: LearningEventPort | null;
  media?: MediaPort | null;
}
