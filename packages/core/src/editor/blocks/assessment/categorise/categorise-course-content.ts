import type { DOMSerializer, Node as PMNode } from "@tiptap/pm/model";

import {
  categoriesFromContent,
  itemsFromContent,
  type CategoriseCategoryProjection,
  type CategoriseItemProjection,
} from "./categorise-fields-shared";

export type { CategoriseCategoryProjection, CategoriseItemProjection };

export interface CategoriseCourseContent {
  readonly categories: readonly CategoriseCategoryProjection[];
  readonly items: readonly CategoriseItemProjection[];
}

export function categoriseCourseContentFromProseMirror(
  content: PMNode,
  serializer: DOMSerializer,
): CategoriseCourseContent {
  return {
    categories: categoriesFromContent(content, serializer),
    items: itemsFromContent(content, serializer),
  };
}
