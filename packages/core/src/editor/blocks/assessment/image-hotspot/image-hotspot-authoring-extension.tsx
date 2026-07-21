import { Extension } from "@tiptap/core";

import { AssessmentProblemContent } from "@/editor/blocks/assessment/shared/chrome/AssessmentProblemContent";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { imageHotspotBlockDefinition } from "./image-hotspot-definition";
import { createImageHotspotCanvasAuthoringNode } from "./image-hotspot-canvas";
import { createImageHotspotNode } from "./node";

function ImageHotspotAuthoringView() {
  return <AssessmentProblemContent editable blockClass="sc-image-hotspot" />;
}

const ImageHotspotAuthoringNode = createImageHotspotNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-assessment-node-view",
      definition: imageHotspotBlockDefinition,
      view: { component: ImageHotspotAuthoringView },
    }),
});

export function createImageHotspotAuthoringExtension(blockDefinitions: BlockDefinitionLookup) {
  const imageHotspotCanvasNode = createImageHotspotCanvasAuthoringNode(blockDefinitions);

  return Extension.create({
    name: "image_hotspot_authoring_bundle",

    addExtensions() {
      return [imageHotspotCanvasNode, ImageHotspotAuthoringNode];
    },
  });
}
