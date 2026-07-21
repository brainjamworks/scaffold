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
    if (definitionsByNodeType.has(definition.nodeType)) {
      throw new Error(`Duplicate block node type "${definition.nodeType}".`);
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
