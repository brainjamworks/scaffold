export type PresentationPlaybackPositionSide = "before-actions" | "after-actions";

export interface PresentationPlaybackPosition {
  readonly timeMs: number;
  readonly side: PresentationPlaybackPositionSide;
}

const SIDE_ORDER: Readonly<Record<PresentationPlaybackPositionSide, number>> = Object.freeze({
  "before-actions": 0,
  "after-actions": 1,
});

export function createPresentationPlaybackPosition(
  timeMs: number,
  side: PresentationPlaybackPositionSide,
): PresentationPlaybackPosition {
  const position = { timeMs, side };
  assertPresentationPlaybackPosition(position);
  return Object.freeze(position);
}

function assertPresentationPlaybackPosition(position: PresentationPlaybackPosition): void {
  if (!Number.isSafeInteger(position.timeMs) || position.timeMs < 0) {
    throw new Error("Presentation playback position time must be a non-negative safe integer.");
  }
  if (position.side !== "before-actions" && position.side !== "after-actions") {
    throw new Error(`Presentation playback position side "${String(position.side)}" is invalid.`);
  }
}

export function comparePresentationPlaybackPositions(
  left: PresentationPlaybackPosition,
  right: PresentationPlaybackPosition,
): number {
  assertPresentationPlaybackPosition(left);
  assertPresentationPlaybackPosition(right);
  return left.timeMs - right.timeMs || SIDE_ORDER[left.side] - SIDE_ORDER[right.side];
}

export function presentationActionStartPosition(timeMs: number): PresentationPlaybackPosition {
  return createPresentationPlaybackPosition(timeMs, "after-actions");
}
