import { Extension } from "@tiptap/core";
import type { Fragment, Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

interface StructuralDefinitionLookup {
  getById(id: string): object | undefined;
}

interface StructuralVariantLookup {
  get(id: string): object | undefined;
}

export function createStructuralClipboardPolicy({
  blockDefinitions,
  layoutDefinitions,
  surfaceVariants,
}: {
  blockDefinitions: BlockDefinitionLookup;
  layoutDefinitions: StructuralDefinitionLookup;
  surfaceVariants: StructuralVariantLookup;
}) {
  const isOwnedStructuralRoot = (node: ProseMirrorNode): boolean => {
    if (blockDefinitions.getByNodeType(node.type.name)) return true;

    const variant = node.attrs["variant"];
    if (typeof variant !== "string") return false;
    if (node.type.name === "layout") return layoutDefinitions.getById(variant) !== undefined;
    if (node.type.name === "surface") return surfaceVariants.get(variant) !== undefined;
    return false;
  };

  return Extension.create({
    name: "scaffoldStructuralClipboardPolicy",

    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            handleDOMEvents: {
              cut: (view, event) => {
                if (
                  !containsCompleteStructuralRoot(
                    view.state.selection.content(),
                    isOwnedStructuralRoot,
                  )
                ) {
                  return false;
                }

                event.preventDefault();
                return true;
              },
            },
            handlePaste: (_view, _event, slice) =>
              containsCompleteStructuralRoot(slice, isOwnedStructuralRoot),
          },
        }),
      ];
    },
  });
}

function containsCompleteStructuralRoot(
  slice: Slice,
  isOwnedStructuralRoot: (node: ProseMirrorNode) => boolean,
): boolean {
  return fragmentContainsCompleteStructuralRoot(
    slice.content,
    slice.openStart,
    slice.openEnd,
    isOwnedStructuralRoot,
  );
}

function fragmentContainsCompleteStructuralRoot(
  fragment: Fragment,
  openStart: number,
  openEnd: number,
  isOwnedStructuralRoot: (node: ProseMirrorNode) => boolean,
): boolean {
  let found = false;
  const lastIndex = fragment.childCount - 1;

  fragment.forEach((node, _offset, index) => {
    if (found) return;

    const nodeOpenStart = index === 0 ? openStart : 0;
    const nodeOpenEnd = index === lastIndex ? openEnd : 0;
    if (nodeOpenStart === 0 && nodeOpenEnd === 0 && isOwnedStructuralRoot(node)) {
      found = true;
      return;
    }

    if (node.childCount === 0) return;
    found = fragmentContainsCompleteStructuralRoot(
      node.content,
      Math.max(0, nodeOpenStart - 1),
      Math.max(0, nodeOpenEnd - 1),
      isOwnedStructuralRoot,
    );
  });

  return found;
}
