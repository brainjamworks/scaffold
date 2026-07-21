import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import type { BlockDefinition } from "@/editor/blocks/block-definition";

export function getBlockDefinitionByNodeType(nodeType: string): BlockDefinition | undefined {
  return builtInBlockRegistry.getByNodeType(nodeType);
}
