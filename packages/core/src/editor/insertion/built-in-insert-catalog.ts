import { builtInLayoutDefinitions } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { createLayoutInsertAction } from "@/editor/arrangements/layout/model/layout-definition";
import { builtInBlockDefinitions } from "@/editor/blocks/built-in-block-definitions";

import { createBlockInsertActions } from "./block-insert-action";
import { coreStructuralInsertActions } from "./core-structural-insert-actions";
import { createInsertCatalog } from "./insert-catalog";

export const builtInInsertCatalog = createInsertCatalog([
  ...createBlockInsertActions(builtInBlockDefinitions),
  ...builtInLayoutDefinitions.map(createLayoutInsertAction),
  ...coreStructuralInsertActions,
]);
