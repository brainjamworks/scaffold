import { Extension } from "@tiptap/core";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { createResourceLinkNode } from "./node";
import { ResourceLinkAuthoringView } from "./ResourceLinkAuthoringView";
import { resourceLinkBlockDefinition } from "./resource-link-definition";
import { ResourceLinkDescriptionNode, ResourceLinkTitleNode } from "./slots";

const ResourceLinkAuthoringNode = createResourceLinkNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-resource-link-node",
      definition: resourceLinkBlockDefinition,
      view: { component: ResourceLinkAuthoringView },
    }),
});

export const ResourceLinkAuthoringExtension = Extension.create({
  name: "resource_link_authoring_bundle",

  addExtensions() {
    return [ResourceLinkTitleNode, ResourceLinkDescriptionNode, ResourceLinkAuthoringNode];
  },
});
