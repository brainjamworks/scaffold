import { Extension } from "@tiptap/core";
import { type NodeViewProps } from "@tiptap/react";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { CalloutView } from "./Callout";
import { renderCalloutAuthoringIconControl } from "./callout-authoring-controls";
import { calloutBlockDefinition } from "./callout-definition";
import { createCalloutNode } from "./node";
import { CalloutPromptNode, CalloutTitleNode } from "./slots";

function CalloutAuthoringView(props: NodeViewProps) {
  return (
    <CalloutView editable props={props} renderIconControl={renderCalloutAuthoringIconControl} />
  );
}

const CalloutAuthoringNode = createCalloutNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-callout-node",
      definition: calloutBlockDefinition,
      view: { component: CalloutAuthoringView },
    }),
});

export const CalloutAuthoringExtension = Extension.create({
  name: "callout_authoring_bundle",

  addExtensions() {
    return [CalloutTitleNode, CalloutPromptNode, CalloutAuthoringNode];
  },
});
