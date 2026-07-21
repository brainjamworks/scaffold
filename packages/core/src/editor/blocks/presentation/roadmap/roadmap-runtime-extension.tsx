import { Extension } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { createRoadmapNode } from "./node";
import { roadmapBlockDefinition } from "./roadmap-definition";
import { RoadmapMilestoneRuntimeView } from "./RoadmapMilestoneRuntimeView";
import { RoadmapRuntimeView } from "./RoadmapRuntimeView";
import { createRoadmapMilestoneNode } from "./slots";

const RoadmapMilestoneRuntimeNode = createRoadmapMilestoneNode({
  addNodeView: () => ReactNodeViewRenderer(RoadmapMilestoneRuntimeView),
});

const RoadmapRuntimeNode = createRoadmapNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      definition: roadmapBlockDefinition,
      view: { component: RoadmapRuntimeView },
    }),
});

export const RoadmapRuntimeExtension = Extension.create({
  name: "roadmap_runtime_bundle",

  addExtensions() {
    return [RoadmapMilestoneRuntimeNode, RoadmapRuntimeNode];
  },
});
