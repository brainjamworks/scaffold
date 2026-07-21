export interface GalleryGridLayoutInput {
  width: number;
  height: number;
  itemCount: number;
  gap: number;
}

export interface GalleryGridLayout {
  columns: number;
  rows: number;
}

const SCORE_EPSILON = 0.001;

export function resolveGalleryGridLayout({
  width,
  height,
  itemCount,
  gap,
}: GalleryGridLayoutInput): GalleryGridLayout {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { columns: 0, rows: 0 };
  }

  const count = Math.max(0, Math.floor(itemCount));
  if (count === 0) return { columns: 0, rows: 0 };

  const safeGap = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  let best = { columns: 0, rows: 0, score: 0 };

  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const cellWidth = (width - safeGap * (columns - 1)) / columns;
    const cellHeight = (height - safeGap * (rows - 1)) / rows;
    const score = Math.min(cellWidth, cellHeight);
    if (score <= 0) continue;

    if (
      score > best.score + SCORE_EPSILON ||
      (Math.abs(score - best.score) <= SCORE_EPSILON && columns > best.columns)
    ) {
      best = { columns, rows, score };
    }
  }

  return { columns: best.columns, rows: best.rows };
}
