import type { ScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import type { ScaffoldLearnerBootstrap, ScaffoldLearnerHostServices } from "@/host/contracts";
import type { ScaffoldProductAccess } from "@/host/contracts/product-access";
import type { ScaffoldColorMode } from "@/theme/state/color-mode";
import type { SlideshowPlayerSizing } from "../players/player-types";

import { ScaffoldRuntimeApp } from "./ScaffoldRuntimeApp";

export interface ScaffoldLearnerAppProps {
  bootstrap: ScaffoldLearnerBootstrap;
  composition: ScaffoldRuntimeComposition;
  hostColorMode?: ScaffoldColorMode;
  productAccess: ScaffoldProductAccess;
  services: ScaffoldLearnerHostServices;
  slideshowSizing?: SlideshowPlayerSizing;
}

export function ScaffoldLearnerApp(props: ScaffoldLearnerAppProps) {
  return <ScaffoldRuntimeApp {...props} surfaceExitPolicy="enforce" />;
}
