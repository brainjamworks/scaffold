import { CourseDocumentAttrsSchema, type ScaffoldDocumentContent } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import type { ControlCapabilityCatalogue } from "@/document/control-binding/control-capability-catalogue";
import type { ProjectedCourseStructure } from "@/document/model/course-structure";
import type { DocumentTreeSnapshot } from "@/document/model/document-tree";
import {
  compileLearnerInteractions,
  type LearnerInteractionCompilation,
  type LearnerInteractionCompileDiagnostic,
} from "@/learner-interaction/model";

export type LearnerInteractionPublicationCheck =
  | {
      readonly status: "ready";
      readonly compilation: LearnerInteractionCompilation | null;
    }
  | {
      readonly status: "diagnostic";
      readonly diagnostics: readonly LearnerInteractionCompileDiagnostic[];
    };

export function checkLearnerInteractionPublication({
  document,
  courseStructure,
  semanticSnapshot,
  controlCapabilities,
}: {
  readonly document: ScaffoldDocumentContent;
  readonly courseStructure: ProjectedCourseStructure;
  readonly semanticSnapshot: DocumentTreeSnapshot;
  readonly controlCapabilities: ControlCapabilityCatalogue;
}): LearnerInteractionPublicationCheck {
  if (courseStructure.kind === "page") return { status: "ready", compilation: null };

  const courseDocument = (document as JSONContent).content?.[0];
  if (courseDocument?.type !== "courseDocument") {
    throw new Error("Learner Interaction publication requires a Course Document root.");
  }
  const configuration = CourseDocumentAttrsSchema.parse(courseDocument.attrs).learnerInteractions;
  if (!configuration) return { status: "ready", compilation: null };

  const compilation = compileLearnerInteractions({
    configuration,
    courseStructure,
    semanticSnapshot,
    controlCapabilities,
  });
  return compilation.diagnostics.length === 0
    ? { status: "ready", compilation }
    : { status: "diagnostic", diagnostics: compilation.diagnostics };
}
