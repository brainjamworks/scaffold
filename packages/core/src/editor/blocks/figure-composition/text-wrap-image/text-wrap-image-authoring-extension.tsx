import { Extension } from "@tiptap/core";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { TextWrapImageAuthoringView } from "./TextWrapImage";
import { textWrapImageDefinition } from "./text-wrap-image-definition";
import { createTextWrapImageNode } from "./node";
import { TextWrapImageBodyNode } from "./slots";

import "./TextWrapImage.css";

const TextWrapImageAuthoringRootNode = createTextWrapImageNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-text-wrap-image",
      definition: textWrapImageDefinition,
      view: { component: TextWrapImageAuthoringView },
    }),
});

export const TextWrapImageAuthoringExtension = Extension.create({
  name: "text_wrap_image_authoring_bundle",

  addExtensions() {
    return [TextWrapImageBodyNode, TextWrapImageAuthoringRootNode];
  },
});
