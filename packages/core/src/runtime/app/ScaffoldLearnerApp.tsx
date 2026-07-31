import { useMemo } from "react";

import type { ScaffoldLearnerBootstrap, ScaffoldLearnerHostServices } from "@/host/contracts";
import type { SlideshowPlayerSizing } from "../players/player-types";
import type { ScaffoldLearnerColorModeProps } from "@/theme/state/learner-color-mode";
import type { ScaffoldThemeExtension } from "@/theme/model";

import { ContentRuntimeHost } from "./ContentRuntimeHost";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";

export interface ScaffoldLearnerAppProps extends ScaffoldLearnerColorModeProps {
  bootstrap: ScaffoldLearnerBootstrap;
  services: ScaffoldLearnerHostServices;
  slideshowSizing?: SlideshowPlayerSizing;
  themeExtension?: ScaffoldThemeExtension;
}

export function ScaffoldLearnerApp({
  bootstrap,
  hostColorMode,
  services,
  slideshowSizing = "embedded",
  themeExtension,
}: ScaffoldLearnerAppProps) {
  const ports = useMemo(
    () => ({
      assessment: services.assessment ?? null,
      learnerActivity: services.learnerActivity ?? null,
      media: services.media ?? null,
      xapi: services.xapi ?? null,
    }),
    [services.assessment, services.learnerActivity, services.media, services.xapi],
  );

  return (
    <ScaffoldServicesProvider ports={ports}>
      <ContentRuntimeHost
        artifactId={bootstrap.artifactId}
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
        {...(themeExtension === undefined ? {} : { themeExtension })}
      />
    </ScaffoldServicesProvider>
  );
}
