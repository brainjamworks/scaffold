import type {
  RuntimeSurfaceState,
  RuntimeSurfaceStateMap,
} from "../../renderer/runtime-surface-visibility";

export interface SlideshowNavigationState {
  activeSurfaceId: string;
  currentIndex: number;
  currentNumber: number;
  count: number;
  previousSurfaceId: string | null;
  nextSurfaceId: string | null;
  canGoPrevious: boolean;
  canGoNext: boolean;
}

export type SlideshowSurfaceState = RuntimeSurfaceState;
export type SlideshowSurfaceStateMap = RuntimeSurfaceStateMap;

export function getSlideshowNavigationState(
  surfaceIds: readonly [string, ...string[]],
  activeSurfaceId?: string,
): SlideshowNavigationState {
  const activeIndex = activeSurfaceId ? surfaceIds.indexOf(activeSurfaceId) : -1;
  const currentIndex = activeIndex >= 0 ? activeIndex : 0;
  const normalizedActiveSurfaceId = surfaceIds[currentIndex] ?? surfaceIds[0];
  const previousSurfaceId = currentIndex > 0 ? (surfaceIds[currentIndex - 1] ?? null) : null;
  const nextSurfaceId =
    currentIndex < surfaceIds.length - 1 ? (surfaceIds[currentIndex + 1] ?? null) : null;

  return {
    activeSurfaceId: normalizedActiveSurfaceId,
    currentIndex,
    currentNumber: currentIndex + 1,
    count: surfaceIds.length,
    previousSurfaceId,
    nextSurfaceId,
    canGoPrevious: previousSurfaceId !== null,
    canGoNext: nextSurfaceId !== null,
  };
}

export function getSlideshowSurfaceStates(
  surfaceIds: readonly [string, ...string[]],
  activeSurfaceId?: string,
): SlideshowSurfaceStateMap {
  const navigation = getSlideshowNavigationState(surfaceIds, activeSurfaceId);
  const surfaceStates: Record<string, SlideshowSurfaceState> = {};

  for (const surfaceId of surfaceIds) {
    if (surfaceId === navigation.activeSurfaceId) {
      surfaceStates[surfaceId] = "current";
    } else if (surfaceId === navigation.previousSurfaceId) {
      surfaceStates[surfaceId] = "previous";
    } else if (surfaceId === navigation.nextSurfaceId) {
      surfaceStates[surfaceId] = "next";
    } else {
      surfaceStates[surfaceId] = "hidden";
    }
  }

  return surfaceStates;
}
