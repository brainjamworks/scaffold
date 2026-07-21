import { Extension } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { KeyValueListView } from "./KeyValueList";
import { renderKeyValueListAddControl } from "./key-value-list-authoring-controls";
import { keyValueListBlockDefinition } from "./key-value-list-definition";
import { createKeyValueListNode } from "./node";
import { KeyValueRowKeyNode, KeyValueRowNode, KeyValueRowValueNode } from "./slots";

function KeyValueListAuthoringView(props: NodeViewProps) {
  return <KeyValueListView {...props} renderAddControl={renderKeyValueListAddControl} />;
}

const KeyValueListAuthoringRootNode = createKeyValueListNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      definition: keyValueListBlockDefinition,
      view: { component: KeyValueListAuthoringView },
    }),
});

export const KeyValueListAuthoringExtension = Extension.create({
  name: "key_value_list_authoring_bundle",

  addExtensions() {
    return [
      KeyValueRowKeyNode,
      KeyValueRowValueNode,
      KeyValueRowNode,
      KeyValueListAuthoringRootNode,
    ];
  },
});
