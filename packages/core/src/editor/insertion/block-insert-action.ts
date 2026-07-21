import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { BlockDefinition } from "@/editor/blocks/block-definition";

import type { InsertAction } from "./insert-action";

export function createBlockInsertAction(definition: BlockDefinition): InsertAction | null {
  if (!definition.insert) return null;

  const insertId = definition.insert.id;
  const { validateNode, ...insert } = definition.insert;
  const composedValidateNode = composeInsertValidators(
    validateNode,
    definition.configuration ? createConfigurationNodeValidator(definition, insertId) : undefined,
  );

  return {
    ...insert,
    id: definition.insert.id,
    nodeType: definition.nodeType,
    ...(composedValidateNode ? { validateNode: composedValidateNode } : {}),
  };
}

export function createBlockInsertActions(
  definitions: readonly BlockDefinition[],
): readonly InsertAction[] {
  const actions: InsertAction[] = [];
  for (const definition of definitions) {
    const action = createBlockInsertAction(definition);
    if (action) actions.push(action);
  }
  return Object.freeze(actions);
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
