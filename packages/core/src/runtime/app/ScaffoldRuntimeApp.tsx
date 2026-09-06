import { useMemo } from "react";

import type { ScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import type { ScaffoldLearnerBootstrap, ScaffoldLearnerHostServices } from "@/host/contracts";
import type { ScaffoldProductAccess } from "@/host/contracts/product-access";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import type { ScaffoldColorMode } from "@/theme/state/color-mode";
import type { SlideshowPlayerSizing } from "../players/player-types";
import type { SurfaceExitPolicy } from "../players/slideshow/slideshow-surface-change";

import {
  ContentRuntimeHostWithSurfaceExitPolicy,
  type AuthorPreviewRuntimeMount,
} from "./ContentRuntimeHost";

interface ScaffoldRuntimeAppProps {
  bootstrap: ScaffoldLearnerBootstrap;
  composition: ScaffoldRuntimeComposition;
  hostColorMode?: ScaffoldColorMode;
  productAccess: ScaffoldProductAccess;
  services: ScaffoldLearnerHostServices;
  slideshowSizing?: SlideshowPlayerSizing;
  surfaceExitPolicy: SurfaceExitPolicy;
  authorPreviewRuntimeMount?: AuthorPreviewRuntimeMount;
}

/** @internal Shared implementation for fixed learner and author Preview entry points. */
export function ScaffoldRuntimeApp({
  bootstrap,
  composition,
  hostColorMode,
  productAccess,
  services,
  slideshowSizing = "embedded",
  surfaceExitPolicy,
  authorPreviewRuntimeMount,
}: ScaffoldRuntimeAppProps) {
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
      <ContentRuntimeHostWithSurfaceExitPolicy
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
        publication={bootstrap.publication}
        productAccess={productAccess}
        {...(hostColorMode === undefined ? {} : { hostColorMode })}
        slideshowSizing={slideshowSizing}
        surfaceExitPolicy={surfaceExitPolicy}
        {...(authorPreviewRuntimeMount ? { authorPreviewRuntimeMount } : {})}
      />
    </ScaffoldServicesProvider>
  );
}
