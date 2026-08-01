import { gridInsertAction } from "@/editor/arrangements/grid/model/grid-insert-action";

import type { InsertAction } from "./insert-action";

export const coreStructuralInsertActions: readonly InsertAction[] = Object.freeze([
  gridInsertAction,
]);
