import { Extension } from "@tiptap/core";

import { AssessmentProblemContent } from "@/editor/blocks/assessment/shared/chrome/AssessmentProblemContent";
import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { imageHotspotBlockDefinition } from "./image-hotspot-definition";
import { ImageHotspotCanvasAuthoringNode } from "./image-hotspot-canvas";
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

export const ImageHotspotAuthoringExtension = Extension.create({
  name: "image_hotspot_authoring_bundle",

  addExtensions() {
    return [ImageHotspotCanvasAuthoringNode, ImageHotspotAuthoringNode];
  },
});
