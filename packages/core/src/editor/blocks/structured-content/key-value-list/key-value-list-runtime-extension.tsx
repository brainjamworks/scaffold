import { Extension } from "@tiptap/core";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { KeyValueListView } from "./KeyValueList";
import { keyValueListBlockDefinition } from "./key-value-list-definition";
import { createKeyValueListNode } from "./node";
import { KeyValueRowKeyNode, KeyValueRowNode, KeyValueRowValueNode } from "./slots";

const KeyValueListRuntimeRootNode = createKeyValueListNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      definition: keyValueListBlockDefinition,
      view: { component: KeyValueListView },
    }),
});

export const KeyValueListRuntimeExtension = Extension.create({
  name: "key_value_list_runtime_bundle",

  addExtensions() {
    return [KeyValueRowKeyNode, KeyValueRowValueNode, KeyValueRowNode, KeyValueListRuntimeRootNode];
  },
});
