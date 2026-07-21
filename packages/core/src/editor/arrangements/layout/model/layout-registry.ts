import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  defineLayout,
  getLayoutKindFromAttrs,
  type LayoutDefinition,
  type LayoutPlaceholderContext,
  type RegisteredLayoutDefinition,
} from "./layout-definition";

export interface LayoutRegistry {
  readonly definitions: readonly RegisteredLayoutDefinition[];
  getById(id: string): RegisteredLayoutDefinition | undefined;
  getForNode(node: ProseMirrorNode): RegisteredLayoutDefinition | undefined;
  resolvePlaceholder(
    layoutId: string,
    placeholderNodeType: string,
    context: LayoutPlaceholderContext,
  ): string | undefined;
}

export function createLayoutRegistry(definitions: readonly LayoutDefinition[]): LayoutRegistry {
  const normalizedDefinitions: RegisteredLayoutDefinition[] = [];
  const definitionsById = new Map<string, RegisteredLayoutDefinition>();

  for (const definition of definitions) {
    if (definition.id.trim().length === 0) {
      throw new Error(`Layout definition ID "${definition.id}" must not be blank.`);
    }
    if (definitionsById.has(definition.id)) {
      throw new Error(`Layout definition ID "${definition.id}" is duplicated.`);
    }

    const registered = defineLayout(definition);
    normalizedDefinitions.push(registered);
    definitionsById.set(registered.id, registered);
  }

  const registeredDefinitions = Object.freeze(normalizedDefinitions);
  Object.freeze(definitionsById);

  const registry: LayoutRegistry = {
    definitions: registeredDefinitions,
    getById: (id) => definitionsById.get(id),
    getForNode: (node) => {
      if (node.type.name !== "layout") return undefined;
      const layoutKind = getLayoutKindFromAttrs(node.attrs);
      return layoutKind ? definitionsById.get(layoutKind) : undefined;
    },
    resolvePlaceholder: (layoutId, placeholderNodeType, context) => {
      const definition = definitionsById.get(layoutId);
      if (!definition?.placeholders) return undefined;
      if (!(placeholderNodeType in definition.placeholders)) return undefined;
      const value = definition.placeholders[placeholderNodeType];
      return typeof value === "function" ? value(context) : value;
    },
  };

  return Object.freeze(registry);
}
