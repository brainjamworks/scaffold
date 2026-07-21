import { Extension } from "@tiptap/core";
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";

import { cloneJsonWithNewStableIds } from "@/document/model/identity/clone-with-new-ids";

function cloneSliceStableIds(slice: Slice): Slice {
  const nodes: ProseMirrorNode[] = [];

  slice.content.forEach((node) => {
    if (node.isText) {
      nodes.push(node);
      return;
    }

    nodes.push(node.type.schema.nodeFromJSON(cloneJsonWithNewStableIds(node.toJSON())));
  });

  return new Slice(Fragment.fromArray(nodes), slice.openStart, slice.openEnd);
}

export const StableIdPasteNormalization = Extension.create({
  name: "scaffoldStableIdPasteNormalization",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          transformPasted: cloneSliceStableIds,
        },
      }),
    ];
  },
});
