import type {
  BlockDefinition,
  BlockInsertVariantDefinition,
} from "@/editor/blocks/block-definition";

import type { InsertAction } from "./insert-action";

export function createBlockInsertAction(definition: BlockDefinition): InsertAction | null {
  if (!definition.insert) return null;

  const insert = definition.insert;

  return {
    id: insert.id,
    nodeType: definition.nodeType,
    title: insert.title,
    description: insert.description,
    icon: insert.icon,
    category: insert.category,
    ...(insert.keywords ? { keywords: insert.keywords } : {}),
    ...(definition.boundedPlacement ? { boundedPlacement: definition.boundedPlacement } : {}),
    content: insert.content,
  };
}

export function createBlockInsertActions(
  definitions: readonly BlockDefinition[],
): readonly InsertAction[] {
  const actions: InsertAction[] = [];
  for (const definition of definitions) {
    const action = createBlockInsertAction(definition);
    if (!action) continue;

    actions.push(action);
    for (const variant of definition.insert?.variants ?? []) {
      actions.push(createBlockInsertVariantAction(definition, action, variant));
    }
  }
  return Object.freeze(actions);
}

function createBlockInsertVariantAction(
  definition: BlockDefinition,
  primary: InsertAction,
  variant: BlockInsertVariantDefinition,
): InsertAction {
  return {
    id: variant.id,
    nodeType: definition.nodeType,
    variantOf: primary.id,
    title: variant.title,
    description: variant.description,
    icon: primary.icon,
    category: primary.category,
    ...(variant.keywords ? { keywords: variant.keywords } : {}),
    ...(definition.boundedPlacement ? { boundedPlacement: definition.boundedPlacement } : {}),
    content: variant.content,
  };
}
