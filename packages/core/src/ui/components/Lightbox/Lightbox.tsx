import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
  XIcon as Close,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { zIndex } from "@/ui/overlays/z-index";

import { OverlayBoundary } from "../OverlayBoundary/OverlayBoundary";
import { useOverlayBoundary } from "@/ui/overlays/portal-host-context";

import "./Lightbox.css";

/**
 * Full-screen media viewer. Built on Radix Dialog (focus trap, ESC,
 * backdrop, a11y for free) and a stable item-array API so the same
 * primitive serves single-image zoom on ImageBlock, multi-item
 * navigation on Gallery, and any future block that wants to escalate
 * a media item to full-screen.
 *
 * Items are keyed (not index-only) so reordering the underlying
 * collection while the lightbox is open doesn't jump to the wrong
 * media — the current item ID survives the index shift.
 */

export interface LightboxItem {
  /** Stable id used to track the active item across re-renders. */
  key: string;
  /** Source URL for the image. */
  src: string;
  /** Accessible alt text. */
  alt?: string;
  /** Optional caption shown below the media. */
  caption?: ReactNode;
  /**
   * Optional custom renderer. When supplied, the lightbox renders this
   * instead of an `<img>`. Use for video / embed items later without
   * changing the lightbox surface.
   */
  render?: (item: LightboxItem) => ReactNode;
}

export interface LightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly LightboxItem[];
  /** Index of the item to show when the lightbox opens. */
  initialIndex?: number;
  /** Optional label for screen readers (overrides per-item alt). */
  ariaLabel?: string;
  /** Element to restore focus to when a controlled lightbox closes. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

function LightboxPortal(props: DialogPrimitive.DialogPortalProps) {
  const resolution = useOverlayBoundary();

  if (resolution.status === "pending") return null;
  if (resolution.status === "unscoped") return <DialogPrimitive.Portal {...props} />;

  return <DialogPrimitive.Portal {...props} container={resolution.environment.host} />;
}

export function Lightbox({
  open,
  onOpenChange,
  items,
  initialIndex = 0,
  ariaLabel = "Image viewer",
  returnFocusRef,
}: LightboxProps) {
  const safeInitial = Math.max(0, Math.min(initialIndex, items.length - 1));
  const [activeKey, setActiveKey] = useState<string | null>(items[safeInitial]?.key ?? null);
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.key === activeKey),
  );

  // When the lightbox opens, jump to the requested initial item.
  useEffect(() => {
    if (open) setActiveKey(items[safeInitial]?.key ?? null);
  }, [items, open, safeInitial]);

  // Keep the active key valid if the collection shrinks.
  useEffect(() => {
    if (!items.length) {
      setActiveKey(null);
      return;
    }
    if (!items.some((item) => item.key === activeKey)) {
      setActiveKey(items[Math.min(activeIndex, items.length - 1)]?.key ?? null);
    }
  }, [activeIndex, activeKey, items]);

  const activeItem = items[activeIndex];
  const multiple = items.length > 1;
  const captionId = useId();
  const descriptionId = useId();
  const statusId = useId();
  const fallbackReturnFocusRef = useRef<HTMLElement | null>(null);
  const [childOverlayContainer, setChildOverlayContainer] = useState<HTMLDivElement | null>(null);
  const positionLabel = activeItem
    ? `Image ${activeIndex + 1} of ${items.length}`
    : "No image selected";
  const describedBy = [descriptionId, activeItem?.caption ? captionId : null]
    .filter(Boolean)
    .join(" ");

  const goPrev = useCallback(() => {
    if (!multiple) return;
    const nextIndex = (activeIndex - 1 + items.length) % items.length;
    setActiveKey(items[nextIndex]?.key ?? null);
  }, [activeIndex, items, multiple]);

  const goNext = useCallback(() => {
    if (!multiple) return;
    const nextIndex = (activeIndex + 1) % items.length;
    setActiveKey(items[nextIndex]?.key ?? null);
  }, [activeIndex, items, multiple]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (event.defaultPrevented) return;
      event.preventDefault();
      onOpenChange(false);
      return;
    }
    if (!multiple) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goPrev();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveKey(items[0]?.key ?? null);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveKey(items[items.length - 1]?.key ?? null);
    }
  };

  const body = useMemo(() => {
    if (!activeItem) return null;
    if (activeItem.render) return activeItem.render(activeItem);
    return (
      <img
        src={activeItem.src}
        alt={activeItem.alt ?? ""}
        className="sc-lightbox-media"
        draggable={false}
      />
    );
  }, [activeItem]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <LightboxPortal>
        <DialogPrimitive.Overlay
          className="sc-lightbox-overlay"
          style={{ zIndex: zIndex.modalBackdrop }}
        />
        <DialogPrimitive.Content
          ref={setChildOverlayContainer}
          className="sc-lightbox-content"
          style={{ zIndex: zIndex.modalContent }}
          aria-label={ariaLabel}
          aria-describedby={describedBy || undefined}
          onKeyDown={handleKeyDown}
          onOpenAutoFocus={(event) => {
            const content = event.currentTarget as HTMLElement | null;
            const ownerWindow = content?.ownerDocument.defaultView;
            const activeElement = content?.ownerDocument.activeElement;
            if (
              ownerWindow &&
              activeElement instanceof ownerWindow.HTMLElement &&
              content &&
              !content.contains(activeElement)
            ) {
              fallbackReturnFocusRef.current = activeElement;
            }
            event.preventDefault();
            content?.focus();
          }}
          onCloseAutoFocus={(event) => {
            const content = event.currentTarget as HTMLElement | null;
            const ownerDocument = content?.ownerDocument;
            const ownerWindow = ownerDocument?.defaultView;
            const returnTarget = returnFocusRef?.current ?? fallbackReturnFocusRef.current;
            if (
              !ownerDocument ||
              !ownerWindow ||
              !(returnTarget instanceof ownerWindow.HTMLElement) ||
              !ownerDocument.contains(returnTarget)
            ) {
              return;
            }
            event.preventDefault();
            returnTarget.focus();
          }}
          tabIndex={-1}
        >
          <DialogPrimitive.Title className="sc-sr-only">{ariaLabel}</DialogPrimitive.Title>
          <DialogPrimitive.Description id={descriptionId} className="sc-sr-only">
            {positionLabel}
          </DialogPrimitive.Description>

          <OverlayBoundary container={childOverlayContainer} kind="contained">
            <figure
              className="sc-lightbox-figure"
              aria-describedby={activeItem?.caption ? captionId : undefined}
            >
              {body}
              {activeItem?.caption ? (
                <figcaption id={captionId} className="sc-lightbox-caption">
                  {activeItem.caption}
                </figcaption>
              ) : null}
            </figure>
          </OverlayBoundary>

          {multiple ? (
            <>
              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous image"
                className="sc-lightbox-button sc-lightbox-button--prev"
              >
                <CaretLeft size={24} weight="bold" aria-hidden />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Next image"
                className="sc-lightbox-button sc-lightbox-button--next"
              >
                <CaretRight size={24} weight="bold" aria-hidden />
              </button>
              <div
                id={statusId}
                role="status"
                aria-live="polite"
                aria-label={positionLabel}
                className="sc-lightbox-status"
              >
                <span className="sc-lightbox-status-current">{activeIndex + 1}</span>
                <span className="sc-lightbox-status-separator">&nbsp;/&nbsp;</span>
                <span className="sc-lightbox-status-total">{items.length}</span>
              </div>
            </>
          ) : null}

          <DialogPrimitive.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="sc-lightbox-button sc-lightbox-button--close"
            >
              <Close size={18} weight="bold" aria-hidden />
            </button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </LightboxPortal>
    </DialogPrimitive.Root>
  );
}
