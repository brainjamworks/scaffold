import { ScaffoldLearnerApp, createCoreScaffoldRuntimeComposition } from "@scaffold/core/runtime";
import { useMemo } from "react";

import type { ScaffoldXBlockInnerInitPayload } from "../types";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";
import { createXBlockLearnerHostServices } from "./ports";

const runtimeComposition = createCoreScaffoldRuntimeComposition();
const freeProductAccess = Object.freeze({ scaffoldPlusAuthorized: false });

interface XBlockStudentAppProps {
  data: ScaffoldXBlockInnerInitPayload;
  bridge: XBlockInnerBridge;
}

export function XBlockStudentApp({ data, bridge }: XBlockStudentAppProps) {
  if (data.artifactAccess.status !== "supported" || !data.artifact) {
    throw new Error("Supported XBlock learner payload must include an artifact.");
  }
  const artifact = data.artifact;
  const services = useMemo(
    () =>
      createXBlockLearnerHostServices(bridge, {
        mediaContext: data.mediaContext ?? "runtime",
        resolvedMedia: data.resolvedMedia,
        rootActivityId: `https://scaffold.ac/xapi/activities/openedx/${encodeURIComponent(
          artifact.id,
        )}`,
      }),
    [artifact.id, bridge, data.mediaContext, data.resolvedMedia],
  );

  return (
    <div className="sc-xblock-root sc-xblock-student-shell">
      <ScaffoldLearnerApp
        composition={runtimeComposition}
        productAccess={freeProductAccess}
        bootstrap={{
          artifactId: artifact.id,
          title: artifact.title,
          mode: artifact.mode,
          publication: data.learnerPublication,
          initialLearnerState: data.initialLearnerState,
        }}
        services={services}
      />
    </div>
  );
}
