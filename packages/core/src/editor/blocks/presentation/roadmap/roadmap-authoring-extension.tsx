import { Extension } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { createRoadmapNode } from "./node";
import { roadmapBlockDefinition } from "./roadmap-definition";
import { RoadmapAuthoringView } from "./RoadmapAuthoringView";
import { RoadmapMilestoneAuthoringView } from "./RoadmapMilestoneAuthoringView";
import { createRoadmapMilestoneNode } from "./slots";

const RoadmapMilestoneAuthoringNode = createRoadmapMilestoneNode({
  addNodeView: () => ReactNodeViewRenderer(RoadmapMilestoneAuthoringView),
});

const RoadmapAuthoringNode = createRoadmapNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      definition: roadmapBlockDefinition,
      view: { component: RoadmapAuthoringView },
    }),
});

export const RoadmapAuthoringExtension = Extension.create({
  name: "roadmap_authoring_bundle",

  addExtensions() {
    return [RoadmapMilestoneAuthoringNode, RoadmapAuthoringNode];
  },
});
