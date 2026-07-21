import { Extension } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { SidebarView } from "./Sidebar";
import { renderSidebarAuthoringIconControl } from "./sidebar-authoring-controls";
import { sidebarBlockDefinition } from "./sidebar-definition";
import { createSidebarNode } from "./node";
import { SidebarBodyNode, SidebarLabelNode, SidebarTitleNode } from "./slots";

function SidebarAuthoringView(props: NodeViewProps) {
  return <SidebarView {...props} renderIconControl={renderSidebarAuthoringIconControl} />;
}

const SidebarAuthoringRootNode = createSidebarNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-sidebar",
      definition: sidebarBlockDefinition,
      view: { component: SidebarAuthoringView },
    }),
});

export const SidebarAuthoringExtension = Extension.create({
  name: "sidebar_authoring_bundle",

  addExtensions() {
    return [SidebarLabelNode, SidebarTitleNode, SidebarBodyNode, SidebarAuthoringRootNode];
  },
});
