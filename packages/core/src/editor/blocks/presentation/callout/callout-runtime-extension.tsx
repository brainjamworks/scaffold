import { Extension } from "@tiptap/core";
import { type NodeViewProps } from "@tiptap/react";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { CalloutView } from "./Callout";
import { calloutBlockDefinition } from "./callout-definition";
import { createCalloutNode } from "./node";
import { CalloutPromptNode, CalloutTitleNode } from "./slots";

function CalloutRuntimeView(props: NodeViewProps) {
  return <CalloutView editable={false} props={props} />;
}

const CalloutRuntimeNode = createCalloutNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-callout-node",
      definition: calloutBlockDefinition,
      view: { component: CalloutRuntimeView },
    }),
});

export const CalloutRuntimeExtension = Extension.create({
  name: "callout_runtime_bundle",

  addExtensions() {
    return [CalloutTitleNode, CalloutPromptNode, CalloutRuntimeNode];
  },
});
