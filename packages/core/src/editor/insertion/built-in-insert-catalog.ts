import { builtInBlockDefinitions } from "@/editor/blocks/built-in-block-definitions";

import { createBlockInsertActions } from "./block-insert-action";
import { builtInNonBlockInsertActions } from "./built-in-non-block-inserts";
import { createInsertCatalog } from "./insert-catalog";

export const builtInInsertCatalog = createInsertCatalog([
  ...createBlockInsertActions(builtInBlockDefinitions),
  ...builtInNonBlockInsertActions,
]);
