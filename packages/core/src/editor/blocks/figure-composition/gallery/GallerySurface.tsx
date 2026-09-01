import { ImageIcon as ImagePlaceholder } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import {
  mediaLoadingMessage,
  mediaMissingMessage,
} from "@/editor/media/accessibility/media-accessibility";
import { renderRuntimeRichTextNode } from "@/editor/rich-text/runtime/render-rich-text";
import { presentationVisualTargetAttributes } from "@/runtime/presentation/visual/presentation-visual-target-attributes";
import {
  isScaffoldRichTextDocumentEmpty,
  type ScaffoldRichTextDocument,
} from "@/schemas/rich-text";
import type { GalleryResolvedItem } from "./GalleryModel";
import { useGalleryGridLayout } from "./use-gallery-grid-layout";

export function GalleryEmptyState({ hint, action }: { hint: string; action?: ReactNode }) {
  return (
    <div className="sc-course-gallery__empty">
      <span className="sc-course-gallery__empty-chip" aria-hidden>
        <ImagePlaceholder size={20} weight="regular" />
      </span>
      <div className="sc-course-gallery__empty-text">
        <p className="sc-course-gallery__empty-title">Image gallery</p>
        <p className="sc-course-gallery__empty-hint">{hint}</p>
      </div>
      {action ?? null}
    </div>
  );
}

export function GallerySharedCaption({ caption }: { caption: ScaffoldRichTextDocument }) {
  if (isScaffoldRichTextDocumentEmpty(caption)) return null;

  return (
    <div className="sc-course-gallery__shared-caption">{renderRuntimeRichTextNode(caption)}</div>
  );
}

export function GalleryCarousel({
  items,
  activeIndex,
  activeItem,
  onSelect,
  onOpenLightbox,
  onActiveItemLoad,
  onBeforeSelect,
  onBeforeOpenLightbox,
  renderThumbAction,
  renderAddThumb,
}: {
  items: readonly GalleryResolvedItem[];
  activeIndex: number;
  activeItem: GalleryResolvedItem | null;
  onSelect: (id: string) => void;
  onOpenLightbox: (trigger: HTMLButtonElement) => void;
  onActiveItemLoad?: (id: string) => void;
  onBeforeSelect?: () => void;
  onBeforeOpenLightbox?: () => void;
  renderThumbAction?: (item: GalleryResolvedItem, index: number) => ReactNode;
  renderAddThumb?: ReactNode;
}) {
  const showThumbs = items.length > 1 || Boolean(renderAddThumb);

  return (
    <div className="sc-course-gallery__carousel">
      <div
        className="sc-course-gallery__stage"
        {...presentationVisualTargetAttributes(activeItem?.key)}
      >
        {activeItem?.url ? (
          <button
            type="button"
            onClick={(event) => {
              onBeforeOpenLightbox?.();
              onOpenLightbox(event.currentTarget);
            }}
            className="sc-course-gallery__stage-button"
            aria-label={`Open ${activeItem.alt || "image"} fullscreen`}
          >
            <img
              src={activeItem.url}
              alt={activeItem.alt}
              className="sc-course-gallery__stage-image"
              draggable={false}
              onLoad={() => onActiveItemLoad?.(activeItem.key)}
            />
          </button>
        ) : (
          <GalleryMediaState
            item={activeItem}
            className="sc-course-gallery__stage-placeholder"
            iconSize={28}
          />
        )}
      </div>

      {showThumbs ? (
        <div className="sc-course-gallery__thumbs" role="group" aria-label="Gallery images">
          {items.map((item, index) => (
            <div
              key={item.key}
              className="sc-course-gallery__thumb-item"
              {...(item.key === activeItem?.key
                ? {}
                : presentationVisualTargetAttributes(item.key))}
            >
              <button
                type="button"
                aria-current={index === activeIndex ? "true" : undefined}
                aria-label={`Show image ${index + 1}`}
                onClick={() => {
                  onBeforeSelect?.();
                  onSelect(item.key);
                }}
                className={cn(
                  "sc-course-gallery__thumb",
                  index === activeIndex && "sc-course-gallery__thumb--active",
                )}
              >
                {item.url ? (
                  <img
                    src={item.url}
                    alt=""
                    className="sc-course-gallery__thumb-image"
                    draggable={false}
                  />
                ) : (
                  <ImagePlaceholder size={14} weight="regular" aria-hidden />
                )}
              </button>
              {renderThumbAction?.(item, index) ?? null}
            </div>
          ))}
          {renderAddThumb ?? null}
        </div>
      ) : null}
    </div>
  );
}

export function GalleryGrid({
  items,
  onTileClick,
  onBeforeTileClick,
  renderTileAction,
  renderAddTile,
}: {
  items: readonly GalleryResolvedItem[];
  onTileClick: (id: string, trigger: HTMLButtonElement) => void;
  onBeforeTileClick?: () => void;
  renderTileAction?: (item: GalleryResolvedItem, index: number) => ReactNode;
  renderAddTile?: ReactNode;
}) {
  const gridRef = useGalleryGridLayout(items.length);

  return (
    <div className="sc-course-gallery__grid-composition">
      <div ref={gridRef} className="sc-course-gallery__grid" role="list">
        {items.map((item, index) => {
          const reference = lowerAlphaReference(index);
          return (
            <figure
              key={item.key}
              className="sc-course-gallery__tile"
              role="listitem"
              {...presentationVisualTargetAttributes(item.key)}
            >
              {item.url ? (
                <button
                  type="button"
                  onClick={(event) => {
                    onBeforeTileClick?.();
                    onTileClick(item.key, event.currentTarget);
                  }}
                  className="sc-course-gallery__tile-button"
                  aria-label={`Open image (${reference}) fullscreen${item.alt ? `: ${item.alt}` : ""}`}
                >
                  <img
                    src={item.url}
                    alt={item.alt}
                    className="sc-course-gallery__tile-image"
                    draggable={false}
                  />
                  <span className="sc-course-gallery__reference" aria-hidden>
                    ({reference})
                  </span>
                </button>
              ) : (
                <GalleryMediaState
                  item={item}
                  className="sc-course-gallery__tile-state"
                  iconSize={20}
                />
              )}
              {renderTileAction?.(item, index) ?? null}
            </figure>
          );
        })}
      </div>
      {renderAddTile ? <div className="sc-app-gallery__grid-add">{renderAddTile}</div> : null}
    </div>
  );
}

function lowerAlphaReference(index: number): string {
  let value = "";
  let remaining = index;
  do {
    value = String.fromCharCode(97 + (remaining % 26)) + value;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return value;
}

function GalleryMediaState({
  className,
  iconSize,
  item,
}: {
  className: string;
  iconSize: number;
  item: GalleryResolvedItem | null;
}) {
  const message =
    item?.error ?? (item?.loading ? mediaLoadingMessage("image") : mediaMissingMessage("image"));
  const role = item?.error ? "alert" : "status";

  return (
    <div
      role={role}
      className={cn(
        className,
        "sc-course-gallery__media-state",
        item?.error && "sc-course-gallery__media-state--error",
      )}
    >
      <ImagePlaceholder size={iconSize} weight="regular" aria-hidden />
      <span className="sc-course-gallery__media-state-label">{message}</span>
    </div>
  );
}
