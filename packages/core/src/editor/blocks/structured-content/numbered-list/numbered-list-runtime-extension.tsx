import { Extension } from "@tiptap/core";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { NumberedListView } from "./NumberedList";
import { numberedListBlockDefinition } from "./numbered-list-definition";
import { createNumberedListNode } from "./node";
import { NumberedListItemNode, NumberedListTitleNode } from "./slots";

const NumberedListRuntimeRootNode = createNumberedListNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-numbered-list",
      definition: numberedListBlockDefinition,
      view: { component: NumberedListView },
    }),
});

export const NumberedListRuntimeExtension = Extension.create({
  name: "numbered_list_runtime_bundle",

  addExtensions() {
    return [NumberedListTitleNode, NumberedListItemNode, NumberedListRuntimeRootNode];
  },
});
