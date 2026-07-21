import { Extension } from "@tiptap/core";
import { NodeViewContent, type NodeViewProps } from "@tiptap/react";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";

import { parseTextWrapImageData, useResolvedTextWrapImageSource } from "./TextWrapImageModel";
import { TextWrapImageMediaSurface } from "./TextWrapImageSurface";
import { createTextWrapImageNode } from "./node";
import { TextWrapImageBodyNode } from "./slots";
import { textWrapImageDefinition } from "./text-wrap-image-definition";

import "./TextWrapImage.css";

function TextWrapImageRuntimeView(props: NodeViewProps) {
  const mediaPort = useMediaPort();
  const data = parseTextWrapImageData(props.node.attrs["data"]);
  const { errorMessage, resolvedUrl } = useResolvedTextWrapImageSource(data, mediaPort);

  return (
    <div
      className="sc-text-wrap-image__shell"
      data-position={data.position}
      data-size={data.size}
      data-shape={data.shape}
    >
      <TextWrapImageMediaSurface data={data} errorMessage={errorMessage} fileUrl={resolvedUrl} />
      <NodeViewContent className="sc-text-wrap-image__content" />
    </div>
  );
}

const TextWrapImageRuntimeRootNode = createTextWrapImageNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-text-wrap-image",
      definition: textWrapImageDefinition,
      view: { component: TextWrapImageRuntimeView },
    }),
});

export const TextWrapImageRuntimeExtension = Extension.create({
  name: "text_wrap_image_runtime_bundle",

  addExtensions() {
    return [TextWrapImageBodyNode, TextWrapImageRuntimeRootNode];
  },
});
