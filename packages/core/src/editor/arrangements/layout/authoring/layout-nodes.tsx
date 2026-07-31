import { createLayoutAuthoringNodeView, createSectionAuthoringNodeView } from "./layout-node-views";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInLayoutRegistry } from "../model/built-in-layout-definitions";
import { createLayoutNode, createSectionNode } from "../model/layout-nodes";
import type { LayoutRegistry } from "../model/layout-registry";

import { builtInLayoutAuthoringViewRegistry } from "./built-in-layout-views";
import type { LayoutAuthoringViewRegistry } from "./layout-view-registry";

export function createLayoutAuthoringNodes({
  registry,
  authoringViews,
  blockDefinitions,
}: {
  registry: LayoutRegistry;
  authoringViews: LayoutAuthoringViewRegistry;
  blockDefinitions: BlockDefinitionLookup;
}) {
  return {
    layoutNode: createLayoutNode({
      addNodeView: () => createLayoutAuthoringNodeView(registry, authoringViews, blockDefinitions),
    }),
    sectionNode: createSectionNode({
      addNodeView: () => createSectionAuthoringNodeView(registry, authoringViews, blockDefinitions),
    }),
  };
}

const builtInLayoutAuthoringNodes = createLayoutAuthoringNodes({
  registry: builtInLayoutRegistry,
  authoringViews: builtInLayoutAuthoringViewRegistry,
  blockDefinitions: builtInBlockRegistry,
});

export const LayoutAuthoringNode = builtInLayoutAuthoringNodes.layoutNode;
export const SectionAuthoringNode = builtInLayoutAuthoringNodes.sectionNode;
