import { createLayoutNode, createSectionNode } from "../model/layout-nodes";
import { builtInLayoutRegistry } from "../model/built-in-layout-definitions";
import type { LayoutRegistry } from "../model/layout-registry";

import { builtInLayoutRuntimeViewRegistry } from "./built-in-layout-views";
import { createLayoutRuntimeNodeView, createSectionRuntimeNodeView } from "./layout-node-views";
import type { LayoutRuntimeViewRegistry } from "./layout-view-registry";

export function createLayoutRuntimeNodes({
  registry,
  runtimeViews,
}: {
  registry: LayoutRegistry;
  runtimeViews: LayoutRuntimeViewRegistry;
}) {
  return {
    layoutNode: createLayoutNode({
      addNodeView: () => createLayoutRuntimeNodeView(registry, runtimeViews),
    }),
    sectionNode: createSectionNode({
      addNodeView: () => createSectionRuntimeNodeView(registry, runtimeViews),
    }),
  };
}

const builtInLayoutRuntimeNodes = createLayoutRuntimeNodes({
  registry: builtInLayoutRegistry,
  runtimeViews: builtInLayoutRuntimeViewRegistry,
});

export const LayoutRuntimeNode = builtInLayoutRuntimeNodes.layoutNode;
export const SectionRuntimeNode = builtInLayoutRuntimeNodes.sectionNode;
