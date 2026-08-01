import type { ResolvedScaffoldCapabilities } from "@/composition/model/resolved-scaffold-capabilities";
import { createLayoutInsertAction } from "@/editor/arrangements/layout/model/layout-definition";
import { createBlockInsertActions } from "@/editor/insertion/block-insert-action";
import { coreStructuralInsertActions } from "@/editor/insertion/core-structural-insert-actions";
import { createInsertCatalog, type InsertCatalog } from "@/editor/insertion/insert-catalog";
import {
  createSurfaceCreationCatalog,
  type SurfaceCreationCatalog,
} from "@/editor/surfaces/authoring/surface-creation-catalog";

export interface ScaffoldAuthoringCatalogues {
  readonly inDocument: InsertCatalog;
  readonly surfaceCreation: SurfaceCreationCatalog;
}

export function createScaffoldAuthoringCatalogues(
  capabilities: ResolvedScaffoldCapabilities,
): ScaffoldAuthoringCatalogues {
  return Object.freeze({
    inDocument: createInsertCatalog([
      ...createBlockInsertActions(capabilities.blocks.registry.definitions),
      ...capabilities.layouts.registry.definitions.map(createLayoutInsertAction),
      ...coreStructuralInsertActions,
    ]),
    surfaceCreation: createSurfaceCreationCatalog(capabilities.surfaces.registry),
  });
}
