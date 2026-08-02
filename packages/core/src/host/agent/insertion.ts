import type { JSONContent } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";

import {
  createCatalogNodeChecked as createCatalogNodeWithCatalogChecked,
  type CreateCatalogNodeCheckedResult,
} from "@/editor/insertion/checked-insertion";
import type { InsertCatalog } from "@/editor/insertion/insert-catalog";
import {
  canInsertCatalogItem,
  getInsertableCatalogItems,
} from "@/editor/suggestions/insert/insert-availability";

export { canInsertCatalogItem, getInsertableCatalogItems };
export type { CreateCatalogNodeCheckedResult };

export function createCatalogNodeChecked({
  catalog,
  schema,
  actionId,
  contentOverride,
}: {
  catalog: InsertCatalog;
  schema: Schema;
  actionId: string;
  contentOverride?: JSONContent;
}): CreateCatalogNodeCheckedResult {
  return createCatalogNodeWithCatalogChecked({
    catalog,
    schema,
    actionId,
    ...(contentOverride ? { contentOverride } : {}),
  });
}
