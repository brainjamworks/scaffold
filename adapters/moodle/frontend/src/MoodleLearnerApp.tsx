import { ScaffoldLearnerApp, createCoreScaffoldRuntimeComposition } from "@scaffold/core/runtime";
import type { ScaffoldProductAccess } from "@scaffold/core/runtime";
import type { ScaffoldLearnerPublication } from "@scaffold/core/ports";
import type { AssessmentLearnerSnapshot, LearnerActivitySnapshot } from "@scaffold/contracts";
import { useMemo } from "react";

import { createMoodleRuntimePorts } from "./ports";

const runtimeComposition = createCoreScaffoldRuntimeComposition();

export interface MoodleLearnerAppProps {
  readonly artifact: {
    readonly id: string;
    readonly title: string;
    readonly mode: "page" | "slideshow" | "branching";
  };
  readonly publication: ScaffoldLearnerPublication;
  readonly productAccess: ScaffoldProductAccess;
  readonly assessmentSnapshot?: AssessmentLearnerSnapshot;
  readonly learnerActivitySnapshot?: LearnerActivitySnapshot;
  readonly cmid: number;
  readonly wwwroot: string;
}

export function MoodleLearnerApp({
  artifact,
  publication,
  productAccess,
  assessmentSnapshot,
  learnerActivitySnapshot,
  cmid,
  wwwroot,
}: MoodleLearnerAppProps) {
  const services = useMemo(() => createMoodleRuntimePorts(cmid, wwwroot), [cmid, wwwroot]);
  return (
    <div className="sc-moodle-root sc-moodle-student-shell">
      <ScaffoldLearnerApp
        composition={runtimeComposition}
        productAccess={productAccess}
        bootstrap={{
          artifactId: artifact.id,
          title: artifact.title,
          mode: artifact.mode,
          publication,
          initialLearnerState: {
            ...(assessmentSnapshot === undefined ? {} : { assessmentSnapshot }),
            ...(learnerActivitySnapshot === undefined ? {} : { learnerActivitySnapshot }),
          },
        }}
        services={services}
      />
    </div>
  );
}
