import { Extension } from "@tiptap/core";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { createResourceLinkNode } from "./node";
import { ResourceLinkRuntimeView } from "./ResourceLinkRuntimeView";
import { resourceLinkBlockDefinition } from "./resource-link-definition";
import { ResourceLinkDescriptionNode, ResourceLinkTitleNode } from "./slots";

const ResourceLinkRuntimeNode = createResourceLinkNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-resource-link-node",
      definition: resourceLinkBlockDefinition,
      view: { component: ResourceLinkRuntimeView },
    }),
});

export const ResourceLinkRuntimeExtension = Extension.create({
  name: "resource_link_runtime_bundle",

  addExtensions() {
    return [ResourceLinkTitleNode, ResourceLinkDescriptionNode, ResourceLinkRuntimeNode];
  },
});
