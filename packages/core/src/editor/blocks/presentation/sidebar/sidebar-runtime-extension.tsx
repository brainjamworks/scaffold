import { Extension } from "@tiptap/core";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { SidebarView } from "./Sidebar";
import { sidebarBlockDefinition } from "./sidebar-definition";
import { createSidebarNode } from "./node";
import { SidebarBodyNode, SidebarLabelNode, SidebarTitleNode } from "./slots";

const SidebarRuntimeRootNode = createSidebarNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-sidebar",
      definition: sidebarBlockDefinition,
      view: { component: SidebarView },
    }),
});

export const SidebarRuntimeExtension = Extension.create({
  name: "sidebar_runtime_bundle",

  addExtensions() {
    return [SidebarLabelNode, SidebarTitleNode, SidebarBodyNode, SidebarRuntimeRootNode];
  },
});
