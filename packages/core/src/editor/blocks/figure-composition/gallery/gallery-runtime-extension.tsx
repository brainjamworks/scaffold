import { Extension } from "@tiptap/core";
import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { useEffect, useMemo, useState } from "react";

import { Lightbox } from "@/ui/components/Lightbox/Lightbox";
import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";

import {
  parseGalleryData,
  readGalleryItems,
  useGalleryLightboxItems,
  useResolvedGalleryItems,
} from "./GalleryModel";
import {
  GalleryCarousel,
  GalleryEmptyState,
  GalleryGrid,
  GallerySharedCaption,
} from "./GallerySurface";
import { galleryDefinition } from "./gallery-definition";
import { createGalleryNode } from "./node";
import { GalleryItemNode } from "./slots";

import "./Gallery.css";

function GalleryRuntimeView(props: NodeViewProps) {
  const data = parseGalleryData(props.node.attrs["data"]);
  const rawItems = useMemo(() => readGalleryItems(props.node), [props.node]);
  const mediaPort = useMediaPort();
  const resolved = useResolvedGalleryItems(rawItems, mediaPort);

  const [activeId, setActiveId] = useState<string | null>(rawItems[0]?.id ?? null);
  useEffect(() => {
    if (!rawItems.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveId(null);
      return;
    }
    if (!rawItems.some((item) => item.id === activeId)) {
      setActiveId(rawItems[0]?.id ?? null);
    }
  }, [rawItems, activeId]);

  const activeIndex = Math.max(
    0,
    resolved.findIndex((item) => item.key === activeId),
  );
  const activeItem = resolved[activeIndex] ?? null;

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const lightboxItems = useGalleryLightboxItems(resolved);
  const lightboxInitialIndex = Math.max(
    0,
    lightboxItems.findIndex((item) => item.key === activeId),
  );

  return (
    <>
      <div className="sc-gallery__shell">
        <div className="sc-gallery__composition">
          {resolved.length === 0 ? (
            <GalleryEmptyState hint="No images added." />
          ) : data.layout === "grid" ? (
            <GalleryGrid
              items={resolved}
              onTileClick={(id) => {
                setActiveId(id);
                setLightboxOpen(true);
              }}
            />
          ) : (
            <GalleryCarousel
              items={resolved}
              activeIndex={activeIndex}
              activeItem={activeItem}
              onSelect={setActiveId}
              onOpenLightbox={() => setLightboxOpen(true)}
            />
          )}
        </div>
        <GallerySharedCaption caption={data.caption} />
      </div>

      <div className="sc-gallery__items-host" aria-hidden>
        <NodeViewContent />
      </div>

      <Lightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        items={lightboxItems}
        initialIndex={lightboxInitialIndex}
        ariaLabel="Gallery viewer"
      />
    </>
  );
}

const GalleryRuntimeRootNode = createGalleryNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-gallery",
      definition: galleryDefinition,
      view: { component: GalleryRuntimeView },
    }),
});

export const GalleryRuntimeExtension = Extension.create({
  name: "gallery_runtime_bundle",

  addExtensions() {
    return [GalleryItemNode, GalleryRuntimeRootNode];
  },
});
