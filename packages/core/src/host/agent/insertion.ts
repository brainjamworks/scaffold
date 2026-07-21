import type { JSONContent } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";

import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import {
  createCatalogNodeChecked as createCatalogNodeWithCatalogChecked,
  type CreateCatalogNodeCheckedResult,
} from "@/editor/insertion/checked-insertion";
import {
  canInsertCatalogItem,
  getInsertableCatalogItems,
} from "@/editor/suggestions/insert/insert-availability";

export { canInsertCatalogItem, getInsertableCatalogItems };
export type { CreateCatalogNodeCheckedResult };

export function createCatalogNodeChecked({
  schema,
  catalogId,
  contentOverride,
}: {
  schema: Schema;
  catalogId: string;
  contentOverride?: JSONContent;
}): CreateCatalogNodeCheckedResult {
  return createCatalogNodeWithCatalogChecked({
    catalog: builtInInsertCatalog,
    schema,
    catalogId,
    ...(contentOverride ? { contentOverride } : {}),
  });
}
