import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import { AUTHORING_FRAME_ATTR } from "@/editor/interactions/dom/authoring-frame";

import { MIN_GRID_COLUMN_WIDTH, resizeAdjacentColumnWidths } from "../model/grid-model";

export interface GridColumnControlsProps {
  columnWidths: readonly number[];
  editable: boolean;
  onCommitResize: (leftColumnIndex: number, delta: number) => boolean;
}

const KEYBOARD_COLUMN_RESIZE_STEP = 0.1;

export function GridColumnControls({
  columnWidths,
  editable,
  onCommitResize,
}: GridColumnControlsProps) {
  if (!editable || columnWidths.length < 2) return null;

  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  if (!Number.isFinite(totalWidth) || totalWidth <= 0) return null;

  const handles = columnWidths.slice(0, -1).map((_, leftColumnIndex) => ({ leftColumnIndex }));

  return (
    <div data-grid-column-controls="" contentEditable={false}>
      {handles.map(({ leftColumnIndex }) => (
        <button
          key={leftColumnIndex}
          type="button"
          role="separator"
          contentEditable={false}
          data-grid-column-resize-handle=""
          aria-orientation="horizontal"
          aria-label={`Resize columns ${leftColumnIndex + 1} and ${leftColumnIndex + 2}`}
          {...resizeSeparatorValueAttributes(columnWidths, leftColumnIndex)}
          style={
            {
              "--sc-grid-column-position": gridColumnHandlePosition(columnWidths, leftColumnIndex),
            } as CSSProperties
          }
          onKeyDown={(event) => handleColumnResizeKeyDown(event, leftColumnIndex, onCommitResize)}
          onPointerDown={(event) =>
            startColumnResize(event, columnWidths, leftColumnIndex, onCommitResize)
          }
        />
      ))}
    </div>
  );
}

function handleColumnResizeKeyDown(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  leftColumnIndex: number,
  onCommitResize: (leftColumnIndex: number, delta: number) => boolean,
): void {
  const delta = keyboardResizeDelta(event.key);
  if (delta === null) return;

  event.preventDefault();
  event.stopPropagation();
  onCommitResize(leftColumnIndex, delta);
}

function keyboardResizeDelta(key: string): number | null {
  if (key === "ArrowLeft") return -KEYBOARD_COLUMN_RESIZE_STEP;
  if (key === "ArrowRight") return KEYBOARD_COLUMN_RESIZE_STEP;
  return null;
}

function resizeSeparatorValueAttributes(columnWidths: readonly number[], leftColumnIndex: number) {
  const left = columnWidths[leftColumnIndex];
  const right = columnWidths[leftColumnIndex + 1];
  if (!isPositiveFiniteNumber(left) || !isPositiveFiniteNumber(right)) {
    return {
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": 50,
    };
  }

  const pairWidth = left + right;
  if (!isPositiveFiniteNumber(pairWidth)) {
    return {
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": 50,
    };
  }

  const minWidth = Math.min(MIN_GRID_COLUMN_WIDTH, pairWidth / 2);
  const min = Math.round((minWidth / pairWidth) * 100);
  const max = Math.round(((pairWidth - minWidth) / pairWidth) * 100);
  const now = Math.min(max, Math.max(min, Math.round((left / pairWidth) * 100)));

  return {
    "aria-valuemin": min,
    "aria-valuemax": max,
    "aria-valuenow": now,
  };
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function startColumnResize(
  event: ReactPointerEvent<HTMLButtonElement>,
  columnWidths: readonly number[],
  leftColumnIndex: number,
  onCommitResize: (leftColumnIndex: number, delta: number) => boolean,
) {
  event.preventDefault();
  event.stopPropagation();

  const resizeHandle = event.currentTarget;
  const pointerId = event.pointerId;
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  const gridElement = resizeHandle.closest<HTMLElement>(`[${AUTHORING_FRAME_ATTR}="grid"]`);
  const controlsElement = resizeHandle.closest<HTMLElement>("[data-grid-column-controls]");
  const gridWidthPx = gridElement?.getBoundingClientRect().width || 100;
  const computedColumnGap = gridElement
    ? Number.parseFloat(window.getComputedStyle(gridElement).columnGap)
    : 0;
  const totalGapPx =
    Number.isFinite(computedColumnGap) && computedColumnGap > 0
      ? computedColumnGap * (columnWidths.length - 1)
      : 0;
  const distributableWidthPx = Math.max(1, gridWidthPx - totalGapPx);
  const startingTemplate = gridElement?.style.gridTemplateColumns ?? "";
  const handleElements = controlsElement
    ? Array.from(
        controlsElement.querySelectorAll<HTMLButtonElement>("[data-grid-column-resize-handle]"),
      )
    : [];
  const startClientX = event.clientX;
  let latestClientX = startClientX;
  let latestDelta = 0;
  let animationFrame: number | null = null;

  try {
    resizeHandle.setPointerCapture(pointerId);
  } catch {
    // Happy DOM and older browsers may not expose pointer capture on buttons.
  }

  const applyPreview = () => {
    animationFrame = null;
    const rawDelta = ((latestClientX - startClientX) / distributableWidthPx) * totalWidth;
    const nextWidths = resizeAdjacentColumnWidths(columnWidths, leftColumnIndex, rawDelta);
    if (!nextWidths) return;

    latestDelta = nextWidths[leftColumnIndex]! - columnWidths[leftColumnIndex]!;
    if (gridElement) {
      gridElement.style.gridTemplateColumns = gridTemplateColumns(nextWidths);
    }
    syncResizeHandlePositions(handleElements, nextWidths);
  };

  const schedulePreview = () => {
    if (animationFrame !== null) return;

    if (typeof window.requestAnimationFrame === "function") {
      animationFrame = window.requestAnimationFrame(applyPreview);
      return;
    }

    animationFrame = window.setTimeout(applyPreview, 0);
  };

  const flushPreview = () => {
    if (animationFrame !== null) {
      if (typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(animationFrame);
      } else {
        window.clearTimeout(animationFrame);
      }
      animationFrame = null;
    }
    applyPreview();
  };

  const restorePreview = () => {
    if (gridElement) {
      gridElement.style.gridTemplateColumns = startingTemplate;
    }
    syncResizeHandlePositions(handleElements, columnWidths);
  };

  const releasePointerCapture = () => {
    if (typeof resizeHandle.releasePointerCapture !== "function") return;

    try {
      resizeHandle.releasePointerCapture(pointerId);
    } catch {
      // Browsers release capture implicitly on some terminal pointer events.
    }
  };

  const cleanup = ({ releaseCapture = true } = {}) => {
    if (animationFrame !== null) {
      if (typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(animationFrame);
      } else {
        window.clearTimeout(animationFrame);
      }
      animationFrame = null;
    }
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", commitResize);
    window.removeEventListener("pointercancel", cancelResize);
    resizeHandle.removeEventListener("lostpointercapture", handleLostPointerCapture);
    if (releaseCapture) {
      releasePointerCapture();
    }
  };

  const handlePointerMove = (moveEvent: PointerEvent) => {
    latestClientX = moveEvent.clientX;
    schedulePreview();
  };

  const commitResize = (commitEvent: PointerEvent) => {
    latestClientX = commitEvent.clientX || latestClientX;
    flushPreview();
    cleanup();

    if (latestDelta === 0) {
      restorePreview();
      return;
    }

    if (!onCommitResize(leftColumnIndex, latestDelta)) {
      restorePreview();
    }
  };

  const cancelResize = () => {
    cleanup();
    restorePreview();
  };

  const handleLostPointerCapture = () => {
    cleanup({ releaseCapture: false });
    restorePreview();
  };

  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", commitResize);
  window.addEventListener("pointercancel", cancelResize);
  resizeHandle.addEventListener("lostpointercapture", handleLostPointerCapture);
}

function gridTemplateColumns(widths: readonly number[]): string {
  return widths.map((width) => `minmax(0, ${width}fr)`).join(" ");
}

function syncResizeHandlePositions(
  handles: readonly HTMLButtonElement[],
  columnWidths: readonly number[],
): void {
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  if (!Number.isFinite(totalWidth) || totalWidth <= 0) return;

  for (const [index, handle] of handles.entries()) {
    if (index >= columnWidths.length - 1) break;
    handle.style.setProperty(
      "--sc-grid-column-position",
      gridColumnHandlePosition(columnWidths, index),
    );
  }
}

function gridColumnHandlePosition(
  columnWidths: readonly number[],
  leftColumnIndex: number,
): string {
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  const consumedWidth = columnWidths
    .slice(0, leftColumnIndex + 1)
    .reduce((sum, width) => sum + width, 0);
  const fraction = consumedWidth / totalWidth;
  const percentage = fraction * 100;
  const gapCoefficient = leftColumnIndex + 0.5 - fraction * (columnWidths.length - 1);
  const operator = gapCoefficient < 0 ? "-" : "+";

  return `calc(${percentage}% ${operator} ${Math.abs(gapCoefficient)} * var(--sc-grid-gap))`;
}
