import { gridInsertAction } from "@/editor/arrangements/grid/model/grid-insert-action";
import { builtInLayoutDefinitions } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { createLayoutInsertAction } from "@/editor/arrangements/layout/model/layout-definition";
import { chartInsertActions } from "@/editor/blocks/media/chart/chart-definition";

import type { InsertAction } from "./insert-action";

export const builtInNonBlockInsertActions: readonly InsertAction[] = Object.freeze([
  ...chartInsertActions,
  gridInsertAction,
  ...builtInLayoutDefinitions.map(createLayoutInsertAction),
]);
