import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

import { validateBoundedContainerStructure } from "../model/bounded-container-structure-policy";

export function createBoundedContainerStructurePolicy(blockDefinitions: BlockDefinitionLookup) {
  return Extension.create({
    name: "boundedContainerStructurePolicy",

    addProseMirrorPlugins() {
      return [
        new Plugin({
          filterTransaction(transaction) {
            if (!transaction.docChanged) return true;
            return validateBoundedContainerStructure(transaction.doc, blockDefinitions).ok;
          },
        }),
      ];
    },
  });
}

export const BoundedContainerStructurePolicy =
  createBoundedContainerStructurePolicy(builtInBlockRegistry);
