import { useMemo } from "react";

import type { ScaffoldLearnerBootstrap, ScaffoldLearnerHostServices } from "@/host/contracts";
import type { SlideshowPlayerSizing } from "../players/player-types";

import { ContentRuntimeHost } from "./ContentRuntimeHost";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";

export interface ScaffoldLearnerAppProps {
  bootstrap: ScaffoldLearnerBootstrap;
  services: ScaffoldLearnerHostServices;
  slideshowSizing?: SlideshowPlayerSizing;
}

export function ScaffoldLearnerApp({
  bootstrap,
  services,
  slideshowSizing = "embedded",
}: ScaffoldLearnerAppProps) {
  const ports = useMemo(
    () => ({
      assessment: services.assessment ?? null,
      learnerActivity: services.learnerActivity ?? null,
      media: services.media ?? null,
    }),
    [services.assessment, services.learnerActivity, services.media],
  );

  return (
    <ScaffoldServicesProvider ports={ports}>
      <ContentRuntimeHost
        artifactId={bootstrap.artifactId}
        {...(bootstrap.initialLearnerState?.assessmentSnapshot === undefined
          ? {}
          : {
              initialAssessmentSnapshot: bootstrap.initialLearnerState.assessmentSnapshot,
            })}
        {...(bootstrap.initialLearnerState?.learnerActivitySnapshot === undefined
          ? {}
          : {
              initialLearnerActivitySnapshot: bootstrap.initialLearnerState.learnerActivitySnapshot,
            })}
        initialContent={bootstrap.learnerContent}
        slideshowSizing={slideshowSizing}
      />
    </ScaffoldServicesProvider>
  );
}
