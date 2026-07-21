import { Extension } from "@tiptap/core";
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { NumberedListTitleNodeView, NumberedListView } from "./NumberedList";
import { numberedListBlockDefinition } from "./numbered-list-definition";
import {
  renderNumberedListAddControl,
  renderNumberedListIconControl,
} from "./numbered-list-authoring-controls";
import { createNumberedListNode } from "./node";
import { createNumberedListTitleNode, NumberedListItemNode } from "./slots";

function NumberedListAuthoringView(props: NodeViewProps) {
  return <NumberedListView {...props} renderAddControl={renderNumberedListAddControl} />;
}

function NumberedListTitleAuthoringView(props: NodeViewProps) {
  return <NumberedListTitleNodeView {...props} renderIconControl={renderNumberedListIconControl} />;
}

const NumberedListAuthoringTitleNode = createNumberedListTitleNode(() =>
  ReactNodeViewRenderer(NumberedListTitleAuthoringView),
);

const NumberedListAuthoringRootNode = createNumberedListNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-numbered-list",
      definition: numberedListBlockDefinition,
      view: { component: NumberedListAuthoringView },
    }),
});

export const NumberedListAuthoringExtension = Extension.create({
  name: "numbered_list_authoring_bundle",

  addExtensions() {
    return [NumberedListAuthoringTitleNode, NumberedListItemNode, NumberedListAuthoringRootNode];
  },
});
