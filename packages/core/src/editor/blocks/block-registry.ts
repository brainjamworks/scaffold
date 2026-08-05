import { isBlockNodeType } from "@/lib/code-defined-identifiers";

import type { BlockDefinition } from "./block-definition";

export interface BlockDefinitionLookup {
  readonly getByNodeType: (nodeType: string) => BlockDefinition | undefined;
}

export interface BlockRegistry extends BlockDefinitionLookup {
  readonly definitions: readonly BlockDefinition[];
  readonly stableIdNodeTypes: readonly string[];
  readonly assessmentNodeTypes: readonly string[];
  readonly resizableNodeTypes: readonly string[];
}

export function createBlockRegistry(input: readonly BlockDefinition[]): BlockRegistry {
  const definitions: readonly BlockDefinition[] = Object.freeze([...input]);
  const definitionsByNodeType = new Map<string, BlockDefinition>();

  for (const definition of definitions) {
    if (!isBlockNodeType(definition.nodeType)) {
      throw new Error(`Block node type "${definition.nodeType}" must be a stable snake_case name.`);
    }
    if (definitionsByNodeType.has(definition.nodeType)) {
      throw new Error(`Duplicate block node type "${definition.nodeType}".`);
    }
    if (definition.identity?.stableChildNodeTypes?.includes(definition.nodeType)) {
      throw new Error(
        `Block "${definition.nodeType}" must not declare its root node type as a stable child.`,
      );
    }
    definitionsByNodeType.set(definition.nodeType, definition);
  }

  const stableIdNodeTypes = new Set<string>();
  for (const definition of definitions) {
    stableIdNodeTypes.add(definition.nodeType);
    for (const childNodeType of definition.identity?.stableChildNodeTypes ?? []) {
      stableIdNodeTypes.add(childNodeType);
    }
  }

  return Object.freeze({
    definitions,
    getByNodeType: (nodeType: string) => definitionsByNodeType.get(nodeType),
    stableIdNodeTypes: Object.freeze([...stableIdNodeTypes]),
    assessmentNodeTypes: Object.freeze(
      definitions
        .filter((definition) => definition.capabilities?.assessment)
        .map((definition) => definition.nodeType),
    ),
    resizableNodeTypes: Object.freeze(
      definitions
        .filter((definition) => definition.frame?.resizable)
        .map((definition) => definition.nodeType),
    ),
  });
}
