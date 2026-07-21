import { useEffect, useRef, type RefObject } from "react";

import { resolveGalleryGridLayout, type GalleryGridLayout } from "./gallery-grid-layout";

const BOUNDED_PLACEMENT_SELECTOR = '[data-bounded-placement="fill"]';
const GALLERY_GRID_FALLBACK_GAP_PX = 12;

export function useGalleryGridLayout(itemCount: number): RefObject<HTMLDivElement | null> {
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !grid.closest(BOUNDED_PLACEMENT_SELECTOR)) return undefined;

    let current: GalleryGridLayout = { columns: 0, rows: 0 };
    const applyMeasurement = ({ width, height }: Pick<DOMRectReadOnly, "width" | "height">) => {
      if (width <= 0 || height <= 0) return;
      const next = resolveGalleryGridLayout({
        width,
        height,
        itemCount,
        gap: readGridGap(grid),
      });
      if (next.columns === 0 || next.rows === 0) return;
      if (next.columns === current.columns && next.rows === current.rows) return;

      current = next;
      grid.dataset["galleryGridBounded"] = "";
      grid.dataset["galleryGridLayout"] = `${next.columns}x${next.rows}`;
      grid.style.setProperty("--sc-gallery-grid-columns", String(next.columns));
      grid.style.setProperty("--sc-gallery-grid-rows", String(next.rows));
    };

    applyMeasurement(grid.getBoundingClientRect());
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            const entry = entries.find(({ target }) => target === grid) ?? entries[0];
            if (entry) applyMeasurement(entry.contentRect);
          });
    observer?.observe(grid);

    return () => {
      observer?.disconnect();
      delete grid.dataset["galleryGridBounded"];
      delete grid.dataset["galleryGridLayout"];
      grid.style.removeProperty("--sc-gallery-grid-columns");
      grid.style.removeProperty("--sc-gallery-grid-rows");
    };
  }, [itemCount]);

  return gridRef;
}

function readGridGap(grid: HTMLElement): number {
  const gap = Number.parseFloat(getComputedStyle(grid).columnGap);
  return Number.isFinite(gap) ? gap : GALLERY_GRID_FALLBACK_GAP_PX;
}
