import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

import { validateBoundedContainerStructure } from "../model/bounded-container-structure-policy";

export function createBoundedContainerStructurePolicy(
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
) {
  return Extension.create({
    name: "boundedContainerStructurePolicy",

    addProseMirrorPlugins() {
      return [
        new Plugin({
          filterTransaction(transaction) {
            if (!transaction.docChanged) return true;
            return validateBoundedContainerStructure(
              transaction.doc,
              blockDefinitions,
              layoutDefinitions,
            ).ok;
          },
        }),
      ];
    },
  });
}

export const BoundedContainerStructurePolicy = createBoundedContainerStructurePolicy(
  builtInBlockRegistry,
  builtInLayoutRegistry,
);
