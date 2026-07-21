import { Extension } from "@tiptap/core";
import { type NodeViewProps } from "@tiptap/react";

import { AssessmentRuntimeProblemContent } from "@/editor/blocks/assessment/shared/runtime/AssessmentRuntimeProblemContent";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { imageHotspotBlockDefinition } from "./image-hotspot-definition";
import { createImageHotspotCanvasRuntimeNode } from "./image-hotspot-canvas-runtime";
import { createImageHotspotNode } from "./node";

function ImageHotspotRuntimeView(props: NodeViewProps) {
  return (
    <AssessmentRuntimeProblemContent
      blockClass="sc-image-hotspot"
      definition={imageHotspotBlockDefinition}
      props={props}
    />
  );
}

const ImageHotspotRuntimeNode = createImageHotspotNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-assessment-node-view",
      definition: imageHotspotBlockDefinition,
      view: { component: ImageHotspotRuntimeView },
    }),
});

export function createImageHotspotRuntimeExtension(blockDefinitions: BlockDefinitionLookup) {
  const imageHotspotCanvasRuntimeNode = createImageHotspotCanvasRuntimeNode(blockDefinitions);

  return Extension.create({
    name: "image_hotspot_runtime_bundle",

    addExtensions() {
      return [imageHotspotCanvasRuntimeNode, ImageHotspotRuntimeNode];
    },
  });
}
