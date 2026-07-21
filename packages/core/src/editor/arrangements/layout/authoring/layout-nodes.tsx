import { createLayoutAuthoringNodeView, createSectionAuthoringNodeView } from "./layout-node-views";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInLayoutRegistry } from "../model/built-in-layout-definitions";
import { createLayoutNode, createSectionNode } from "../model/layout-nodes";

import { builtInLayoutAuthoringViewRegistry } from "./built-in-layout-views";

export const LayoutAuthoringNode = createLayoutNode({
  addNodeView: () =>
    createLayoutAuthoringNodeView(
      builtInLayoutRegistry,
      builtInLayoutAuthoringViewRegistry,
      builtInBlockRegistry,
    ),
});

export const SectionAuthoringNode = createSectionNode({
  addNodeView: () =>
    createSectionAuthoringNodeView(
      builtInLayoutRegistry,
      builtInLayoutAuthoringViewRegistry,
      builtInBlockRegistry,
    ),
});
