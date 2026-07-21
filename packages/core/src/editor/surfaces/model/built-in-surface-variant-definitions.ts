import { pageDefaultSurfaceDefinition } from "./templates/page-default";
import { slideCentredStageSurfaceDefinition } from "./templates/slide-centred-stage";
import { slideContentSurfaceDefinition } from "./templates/slide-content";
import { slideCoverSurfaceDefinition } from "./templates/slide-cover";
import { slideDiptychSurfaceDefinition } from "./templates/slide-diptych";
import { slideEditorialSurfaceDefinition } from "./templates/slide-editorial";
import { slideFullBleedImageSurfaceDefinition } from "./templates/slide-full-bleed-image";
import { slideImageBackdropPanelSurfaceDefinition } from "./templates/slide-image-backdrop-panel";
import { slideImageBandSurfaceDefinition } from "./templates/slide-image-band";
import { slideImageContentSplitSurfaceDefinition } from "./templates/slide-image-content-split";
import { slideImageContentStackedSurfaceDefinition } from "./templates/slide-image-content-stacked";
import { slideImageCoverSurfaceDefinition } from "./templates/slide-image-cover";
import { slideModuleCoverSurfaceDefinition } from "./templates/slide-module-cover";
import { slideSideTitleSurfaceDefinition } from "./templates/slide-side-title";
import { slideThreeColumnsSurfaceDefinition } from "./templates/slide-three-columns";
import { slideTriptychSurfaceDefinition } from "./templates/slide-triptych";
import { slideTwoColumnsSurfaceDefinition } from "./templates/slide-two-columns";
import { slideTwoStackedSurfaceDefinition } from "./templates/slide-two-stacked";
import type { SurfaceVariantDefinition } from "./surface-variant-definition";
import { createSurfaceVariantRegistry } from "./surface-variant-registry";

export const builtInSurfaceVariantDefinitions: readonly SurfaceVariantDefinition[] = Object.freeze([
  pageDefaultSurfaceDefinition,
  slideCoverSurfaceDefinition,
  slideContentSurfaceDefinition,
  slideTwoColumnsSurfaceDefinition,
  slideTwoStackedSurfaceDefinition,
  slideSideTitleSurfaceDefinition,
  slideThreeColumnsSurfaceDefinition,
  slideCentredStageSurfaceDefinition,
  slideEditorialSurfaceDefinition,
  slideImageContentSplitSurfaceDefinition,
  slideImageContentStackedSurfaceDefinition,
  slideFullBleedImageSurfaceDefinition,
  slideImageBackdropPanelSurfaceDefinition,
  slideDiptychSurfaceDefinition,
  slideTriptychSurfaceDefinition,
  slideImageCoverSurfaceDefinition,
  slideImageBandSurfaceDefinition,
  slideModuleCoverSurfaceDefinition,
]);

export const builtInSurfaceVariantRegistry = createSurfaceVariantRegistry(
  builtInSurfaceVariantDefinitions,
);
