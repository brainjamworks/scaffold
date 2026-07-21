import { Extension } from "@tiptap/core";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { GalleryAuthoringView } from "./Gallery";
import { galleryDefinition } from "./gallery-definition";
import { createGalleryNode } from "./node";
import { GalleryItemNode } from "./slots";

import "./Gallery.css";

const GalleryAuthoringRootNode = createGalleryNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-gallery",
      definition: galleryDefinition,
      view: { component: GalleryAuthoringView },
    }),
});

export const GalleryAuthoringExtension = Extension.create({
  name: "gallery_authoring_bundle",

  addExtensions() {
    return [GalleryItemNode, GalleryAuthoringRootNode];
  },
});
