import { Extension } from "@tiptap/core";
import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Lightbox } from "@/ui/components/Lightbox/Lightbox";
import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import {
  resolveOwningRuntimeSurfaceId,
  useRuntimePresentedSurfaceId,
} from "@/runtime/renderer/runtime-surface-presentation";
import {
  buildVisualItemExperiencedStatementDraft,
  useXapiSession,
  type XapiSession,
} from "@/runtime/xapi";

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
  const xapiSession = useXapiSession();
  const presentedSurfaceId = useRuntimePresentedSurfaceId();
  const owningSurfaceId = resolveOwningRuntimeSurfaceId(props.editor.state.doc, props.getPos);
  const isPresented =
    presentedSurfaceId === undefined ||
    (presentedSurfaceId !== null && owningSurfaceId === presentedSurfaceId);
  const resolved = useResolvedGalleryItems(rawItems, mediaPort);
  const galleryId = props.node.attrs["id"];
  const recordedItemsRef = useRef<{
    session: XapiSession;
    galleryId: string;
    itemIds: Set<string>;
  } | null>(null);
  const recordDisplayedItem = useCallback(
    (itemId: string) => {
      if (
        !isPresented ||
        !xapiSession ||
        typeof galleryId !== "string" ||
        !galleryId.trim()
      ) {
        return;
      }
      const position = resolved.findIndex((item) => item.key === itemId) + 1;
      if (position <= 0) return;

      let recorded = recordedItemsRef.current;
      if (recorded?.session !== xapiSession || recorded.galleryId !== galleryId) {
        recorded = { session: xapiSession, galleryId, itemIds: new Set() };
        recordedItemsRef.current = recorded;
      }
      if (recorded.itemIds.has(itemId)) return;

      try {
        xapiSession.record(
          buildVisualItemExperiencedStatementDraft({
            rootActivityId: xapiSession.rootActivityId,
            compositionId: galleryId,
            itemId,
            itemKind: "gallery-image",
            position,
            count: resolved.length,
          }),
        );
        recorded.itemIds.add(itemId);
      } catch {
        // Gallery recording is observational and cannot prevent image presentation.
      }
    },
    [galleryId, isPresented, resolved, xapiSession],
  );

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
              onActiveItemLoad={recordDisplayedItem}
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
        onActiveItemLoad={recordDisplayedItem}
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
