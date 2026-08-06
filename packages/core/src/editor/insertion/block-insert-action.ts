import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type {
  BlockDefinition,
  BlockInsertVariantDefinition,
} from "@/editor/blocks/block-definition";

import type { InsertAction } from "./insert-action";

export function createBlockInsertAction(definition: BlockDefinition): InsertAction | null {
  if (!definition.insert) return null;

  const insert = definition.insert;
  const composedValidateNode = composeInsertValidators(
    insert.validateNode,
    definition.configuration ? createConfigurationNodeValidator(definition, insert.id) : undefined,
  );

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
    ...(composedValidateNode ? { validateNode: composedValidateNode } : {}),
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
  const composedValidateNode = composeInsertValidators(
    definition.insert?.validateNode,
    variant.validateNode,
    definition.configuration ? createConfigurationNodeValidator(definition, variant.id) : undefined,
  );

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
    ...(composedValidateNode ? { validateNode: composedValidateNode } : {}),
  };
}

function createConfigurationNodeValidator(
  definition: BlockDefinition,
  insertId: string,
): NonNullable<InsertAction["validateNode"]> {
  const configuration = definition.configuration;

  return (node: ProseMirrorNode) => {
    if (!configuration) return null;
    if (node.type.name !== definition.nodeType) {
      return {
        code: "invalid_catalog_content",
        message: `Insert action "${insertId}" produced "${node.type.name}", not "${definition.nodeType}".`,
      };
    }

    const parsed = configuration.schema.safeParse(node.attrs[configuration.attr]);
    if (parsed.success) return null;

    return {
      code: "invalid_catalog_content",
      field: configuration.attr,
      message: `Insert action "${insertId}" produced invalid "${configuration.attr}" attrs for "${definition.nodeType}".`,
    };
  };
}

function composeInsertValidators(
  ...validators: Array<InsertAction["validateNode"] | undefined>
): InsertAction["validateNode"] | undefined {
  const active = validators.filter(
    (validator): validator is NonNullable<InsertAction["validateNode"]> => Boolean(validator),
  );
  if (active.length === 0) return undefined;

  return (node) => {
    for (const validator of active) {
      const issue = validator(node);
      if (issue) return issue;
    }
    return null;
  };
}
