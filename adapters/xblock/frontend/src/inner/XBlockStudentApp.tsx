import { ScaffoldLearnerApp } from "@scaffold/core/runtime";
import { useMemo } from "react";

import type { ScaffoldXBlockInnerInitPayload } from "../types";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";
import { prepareXBlockArtifact } from "./xblock-content";
import { createXBlockLearnerHostServices } from "./ports";

interface XBlockStudentAppProps {
  data: ScaffoldXBlockInnerInitPayload;
  bridge: XBlockInnerBridge;
}

export function XBlockStudentApp({ data, bridge }: XBlockStudentAppProps) {
  const artifactState = useMemo(() => prepareXBlockArtifact(data.artifact), [data.artifact]);
  const services = useMemo(
    () =>
      createXBlockLearnerHostServices(bridge, {
        mediaContext: data.mediaContext ?? "runtime",
        resolvedMedia: data.resolvedMedia,
      }),
    [bridge, data.mediaContext, data.resolvedMedia],
  );

  if (artifactState.status === "error") {
    return (
      <div className="sc-xblock-root sc-xblock-error" role="alert">
        <strong>Scaffold document could not be loaded.</strong>
        <span>{artifactState.message}</span>
      </div>
    );
  }
  if (artifactState.status === "empty") {
    return (
      <div className="sc-xblock-root sc-xblock-error" role="alert">
        <strong>Scaffold document could not be loaded.</strong>
        <span>Scaffold content has not been created yet.</span>
      </div>
    );
  }

  return (
    <div className="sc-xblock-root sc-xblock-student-shell">
      <ScaffoldLearnerApp
        bootstrap={{
          artifactId: artifactState.artifact.id,
          title: artifactState.artifact.title,
          mode: artifactState.artifact.mode,
          learnerContent: artifactState.artifact.content,
          initialLearnerState: data.initialLearnerState,
        }}
        services={services}
      />
    </div>
  );
}
