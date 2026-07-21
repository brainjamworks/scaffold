import { NodeViewContent, useEditorState, type NodeViewProps } from "@tiptap/react";
import { PlusIcon as Plus, TrashIcon as Trash } from "@phosphor-icons/react";
import type { Transaction } from "@tiptap/pm/state";
import { useEffect, useRef, useState } from "react";
import { GalleryItemDataSchema, type GalleryItemData } from "@scaffold/contracts";

import { Lightbox } from "@/ui/components/Lightbox/Lightbox";
import type { CheckedMutationResult } from "@/document/model/commands/checked-transactions";
import { BlockAddGhost } from "@/editor/suggestions/insert/BlockAddGhost";
import { createStableId } from "@/document/model/identity/stable-ids";
import {
  nodeViewUiKey,
  usePickerOpen,
} from "@/editor/media/authoring/picker/file-picker-open-state";
import {
  insertDirectChildSettingsItemChecked,
  removeDirectChildSettingsItemChecked,
} from "@/document/model/commands/content-collections";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { setNodeSelectionInTransaction } from "@/editor/selection/selection-transactions";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import "./Gallery.css";
import {
  FilePickerModal,
  type FilePickerResult,
} from "@/editor/media/authoring/picker/LazyFilePickerModal";
import { GALLERY_NODE, emptyGalleryItemData } from "./content";
import { galleryItemsCollection } from "./gallery-definition";
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

export function GalleryAuthoringView(props: NodeViewProps) {
  const data = parseGalleryData(props.node.attrs["data"]);

  const rawItems = useEditorState({
    editor: props.editor,
    selector: () => readGalleryItems(props.node),
  });

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
  const lightboxReturnFocusRef = useRef<HTMLElement | null>(null);
  const lightboxItems = useGalleryLightboxItems(resolved);
  const lightboxInitialIndex = Math.max(
    0,
    lightboxItems.findIndex((item) => item.key === activeId),
  );

  const pickerKey = nodeViewUiKey({
    owner: "gallery",
    surface: "file-picker",
    id: props.node.attrs["id"],
  });
  const [pickerOpen, setPickerOpen] = usePickerOpen(pickerKey);

  const insertItem = (item: GalleryItemData) => {
    dispatchCollectionMutation(
      props,
      insertDirectChildSettingsItemChecked({
        tr: props.editor.state.tr,
        ...galleryCollectionTarget(props),
        childId: createStableId(),
        value: item,
      }),
    );
  };

  const removeItem = (id: string) => {
    dispatchCollectionMutation(
      props,
      removeDirectChildSettingsItemChecked({
        tr: props.editor.state.tr,
        ...galleryCollectionTarget(props),
        childId: id,
      }),
    );
  };

  const handlePickerResolved = (result: FilePickerResult) => {
    setPickerOpen(false);
    const item = pickerResultToItem(result);
    if (!item) return;
    insertItem(item);
  };

  const selectBlock = () => {
    const pos = readNodePos(props);
    if (!isValidEditorDocPos(props.editor, pos)) return;
    props.editor.commands.setNodeSelection(pos);
    props.editor.view.focus();
  };

  return (
    <>
      <div className="sc-gallery__shell">
        <div className="sc-gallery__composition">
          {resolved.length === 0 ? (
            <GalleryEmptyState
              hint="Add images to build a carousel or grid."
              action={
                <BlockAddGhost
                  label="Add image"
                  presentation="pill"
                  onClick={() => {
                    selectBlock();
                    setPickerOpen(true);
                  }}
                  className="sc-gallery__empty-cta"
                />
              }
            />
          ) : data.layout === "grid" ? (
            <GalleryGrid
              items={resolved}
              onTileClick={(id, trigger) => {
                lightboxReturnFocusRef.current = trigger;
                setActiveId(id);
                setLightboxOpen(true);
              }}
              onBeforeTileClick={selectBlock}
              renderTileAction={(item, index) => (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeItem(item.key);
                  }}
                  className="sc-gallery__tile-delete"
                  aria-label={`Remove image ${index + 1}`}
                >
                  <Trash size={13} aria-hidden />
                </button>
              )}
              renderAddTile={
                <BlockAddGhost
                  label="Add image"
                  presentation="pill"
                  iconOnly
                  onClick={(event) => {
                    event.stopPropagation();
                    selectBlock();
                    setPickerOpen(true);
                  }}
                  className="sc-gallery__grid-add-action"
                />
              }
            />
          ) : (
            <GalleryCarousel
              items={resolved}
              activeIndex={activeIndex}
              activeItem={activeItem}
              onSelect={setActiveId}
              onOpenLightbox={(trigger) => {
                lightboxReturnFocusRef.current = trigger;
                setLightboxOpen(true);
              }}
              onBeforeSelect={selectBlock}
              onBeforeOpenLightbox={selectBlock}
              renderThumbAction={(item, index) => (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeItem(item.key);
                  }}
                  className="sc-gallery__thumb-delete"
                  aria-label={`Remove image ${index + 1}`}
                >
                  <Trash size={11} aria-hidden />
                </button>
              )}
              renderAddThumb={
                <BlockAddGhost
                  label="Add image"
                  presentation="item"
                  onClick={(event) => {
                    event.stopPropagation();
                    selectBlock();
                    setPickerOpen(true);
                  }}
                  className="sc-gallery__thumb-item sc-gallery__thumb-item--ghost"
                >
                  <span aria-hidden className="sc-gallery__thumb sc-gallery__thumb--ghost">
                    <Plus size={16} weight="bold" />
                  </span>
                </BlockAddGhost>
              }
            />
          )}
        </div>
        <GallerySharedCaption caption={data.caption} />
      </div>

      <div className="sc-gallery__items-host" aria-hidden>
        <NodeViewContent />
      </div>

      <FilePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onResolved={handlePickerResolved}
        kind="media"
        defaultMediaType="image"
        title="Add image"
      />

      <Lightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        items={lightboxItems}
        initialIndex={lightboxInitialIndex}
        ariaLabel="Gallery viewer"
        returnFocusRef={lightboxReturnFocusRef}
      />
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────── */

function readNodePos(props: NodeViewProps): number | undefined {
  try {
    return props.getPos();
  } catch {
    return undefined;
  }
}

function galleryCollectionTarget(props: NodeViewProps) {
  return {
    ownerId: String(props.node.attrs["id"]),
    ownerNodeType: GALLERY_NODE,
    childNodeType: galleryItemsCollection.childNodeType,
    attr: galleryItemsCollection.attr,
    schema: galleryItemsCollection.schema,
  };
}

function dispatchCollectionMutation(
  props: NodeViewProps,
  result: CheckedMutationResult<Transaction>,
) {
  if (!result.ok) return false;
  const pos = readNodePos(props);
  if (!isValidEditorDocPos(props.editor, pos)) return false;
  if (!setNodeSelectionInTransaction(result.tr, pos)) return false;
  props.editor.view.dispatch(result.tr);
  return true;
}

function pickerResultToItem(result: FilePickerResult): GalleryItemData | null {
  if (result.source === "upload" && result.upload) {
    return emptyGalleryItemData({
      image: {
        mode: "managed",
        mediaId: result.upload.id,
        alt: result.alt ?? "",
      },
    });
  }
  if (result.source === "url" && result.url) {
    const parsed = GalleryItemDataSchema.safeParse({
      image: {
        mode: "external",
        src: result.url,
        alt: result.alt ?? "",
      },
    });
    return parsed.success ? parsed.data : null;
  }
  if (result.source === "browse" && result.browse) {
    return emptyGalleryItemData({
      image: {
        mode: "managed",
        mediaId: result.browse.id,
        alt: result.alt ?? "",
      },
    });
  }
  return null;
}
