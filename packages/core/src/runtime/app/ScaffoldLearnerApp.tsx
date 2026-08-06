import { useMemo } from "react";

import type { ScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import type { ScaffoldLearnerBootstrap, ScaffoldLearnerHostServices } from "@/host/contracts";
import type { ScaffoldColorMode } from "@/theme/state/color-mode";
import type { SlideshowPlayerSizing } from "../players/player-types";

import { ContentRuntimeHost } from "./ContentRuntimeHost";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";

export interface ScaffoldLearnerAppProps {
  bootstrap: ScaffoldLearnerBootstrap;
  composition: ScaffoldRuntimeComposition;
  hostColorMode?: ScaffoldColorMode;
  services: ScaffoldLearnerHostServices;
  slideshowSizing?: SlideshowPlayerSizing;
}

export function ScaffoldLearnerApp({
  bootstrap,
  composition,
  hostColorMode,
  services,
  slideshowSizing = "embedded",
}: ScaffoldLearnerAppProps) {
  const ports = useMemo(
    () => ({
      assessment: services.assessment ?? null,
      learnerActivity: services.learnerActivity ?? null,
      learningEvents: services.learningEvents ?? null,
      media: services.media ?? null,
    }),
    [services.assessment, services.learnerActivity, services.learningEvents, services.media],
  );

  return (
    <ScaffoldServicesProvider ports={ports}>
      <ContentRuntimeHost
        artifactId={bootstrap.artifactId}
        composition={composition}
        courseTitle={bootstrap.title}
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
        {...(hostColorMode === undefined ? {} : { hostColorMode })}
        slideshowSizing={slideshowSizing}
      />
    </ScaffoldServicesProvider>
  );
}
