import { createLayoutNode, createSectionNode } from "../model/layout-nodes";
import { builtInLayoutRegistry } from "../model/built-in-layout-definitions";

import { builtInLayoutRuntimeViewRegistry } from "./built-in-layout-views";
import { createLayoutRuntimeNodeView, createSectionRuntimeNodeView } from "./layout-node-views";

export const LayoutRuntimeNode = createLayoutNode({
  addNodeView: () =>
    createLayoutRuntimeNodeView(builtInLayoutRegistry, builtInLayoutRuntimeViewRegistry),
});

export const SectionRuntimeNode = createSectionNode({
  addNodeView: () =>
    createSectionRuntimeNodeView(builtInLayoutRegistry, builtInLayoutRuntimeViewRegistry),
});
