import type { SurfaceTransitionV1 } from "@scaffold/contracts";

import type {
  RuntimeSurfaceState,
  RuntimeSurfaceStateMap,
} from "../../renderer/runtime-surface-visibility";
import type {
  CourseSectionId,
  ProjectedSlideshowCourseStructure,
  SurfaceId,
} from "@/document/model/course-structure";
import type { PresentationMotionMode } from "@/presentation/model";

export interface CourseSectionNavigationItem {
  readonly id: CourseSectionId;
  readonly title: string;
  readonly index: number;
  readonly number: number;
  readonly count: number;
  readonly firstSurfaceId: SurfaceId | null;
  readonly current: boolean;
}

export interface CurrentCourseSectionNavigation {
  readonly id: CourseSectionId;
  readonly title: string;
  readonly index: number;
  readonly number: number;
  readonly count: number;
  readonly surfaceIndex: number;
  readonly surfaceNumber: number;
  readonly surfaceCount: number;
}

export interface SlideshowNavigationState {
  readonly activeSurfaceId: SurfaceId | null;
  readonly currentIndex: number | null;
  readonly currentNumber: number | null;
  readonly count: number;
  readonly previousSurfaceId: SurfaceId | null;
  readonly nextSurfaceId: SurfaceId | null;
  readonly canGoPrevious: boolean;
  readonly canGoNext: boolean;
  readonly currentCourseSection: CurrentCourseSectionNavigation | null;
  readonly courseSectionItems: readonly CourseSectionNavigationItem[];
}

export type SlideshowSurfaceState = RuntimeSurfaceState;
export type SlideshowSurfaceStateMap = RuntimeSurfaceStateMap;

export type SlideshowSurfaceTransitionDirection = "forward" | "backward";

/**
 * One accepted Surface change that animates. Cut (no authored transition, or reduced motion) never
 * produces this state: it settles the destination immediately through the same request boundary.
 */
export interface SlideshowSurfaceTransitionState {
  readonly sourceSurfaceId: SurfaceId;
  readonly destinationSurfaceId: SurfaceId;
  readonly direction: SlideshowSurfaceTransitionDirection;
  readonly transition: SurfaceTransitionV1;
}

export interface CreateSlideshowSurfaceTransitionStateInput {
  readonly structure: ProjectedSlideshowCourseStructure;
  readonly sourceSurfaceId: SurfaceId;
  readonly destinationSurfaceId: SurfaceId;
  readonly transition: SurfaceTransitionV1 | undefined;
  readonly motionMode: PresentationMotionMode;
}

export function createSlideshowSurfaceTransitionState({
  structure,
  sourceSurfaceId,
  destinationSurfaceId,
  transition,
  motionMode,
}: CreateSlideshowSurfaceTransitionStateInput): SlideshowSurfaceTransitionState | null {
  const sourceIndex = structure.surfaceIds.indexOf(sourceSurfaceId);
  const destinationIndex = structure.surfaceIds.indexOf(destinationSurfaceId);
  if (sourceIndex < 0 || destinationIndex < 0) {
    throw new Error(
      `Cannot transition between unknown Slideshow Surfaces "${sourceSurfaceId}" and "${destinationSurfaceId}".`,
    );
  }
  if (sourceIndex === destinationIndex) {
    throw new Error(`Cannot transition Slideshow Surface "${sourceSurfaceId}" to itself.`);
  }
  if (transition === undefined || motionMode === "reduced-motion") return null;
  return Object.freeze({
    sourceSurfaceId,
    destinationSurfaceId,
    direction: destinationIndex > sourceIndex ? "forward" : "backward",
    transition,
  });
}

export function getSlideshowNavigationState(
  structure: ProjectedSlideshowCourseStructure,
  requestedSurfaceId?: SurfaceId | null,
): SlideshowNavigationState {
  const { surfaceIds } = structure;
  const activeIndex = requestedSurfaceId ? surfaceIds.indexOf(requestedSurfaceId) : -1;
  const currentIndex = activeIndex >= 0 ? activeIndex : surfaceIds.length > 0 ? 0 : null;
  const activeSurfaceId = currentIndex === null ? null : (surfaceIds[currentIndex] ?? null);
  const previousSurfaceId =
    currentIndex !== null && currentIndex > 0 ? (surfaceIds[currentIndex - 1] ?? null) : null;
  const nextSurfaceId =
    currentIndex !== null && currentIndex < surfaceIds.length - 1
      ? (surfaceIds[currentIndex + 1] ?? null)
      : null;
  const currentSurface = activeSurfaceId ? structure.surfaceById[activeSurfaceId] : undefined;
  const currentCourseSection = currentSurface
    ? (() => {
        const section = structure.courseSectionById[currentSurface.courseSectionId];
        if (!section) {
          throw new Error(
            `Projected Slideshow Surface ${currentSurface.id} references missing Course Section ${currentSurface.courseSectionId}.`,
          );
        }
        const surfaceIndex = currentSurface.courseSectionSurfaceIndex;
        return {
          id: section.id,
          title: section.title,
          index: section.index,
          number: section.index + 1,
          count: structure.courseSections.length,
          surfaceIndex,
          surfaceNumber: surfaceIndex + 1,
          surfaceCount: section.surfaceIds.length,
        };
      })()
    : null;
  const courseSectionItems = structure.courseSections.map((section) => ({
    id: section.id,
    title: section.title,
    index: section.index,
    number: section.index + 1,
    count: structure.courseSections.length,
    firstSurfaceId: section.firstSurfaceId,
    current: section.id === currentCourseSection?.id,
  }));

  return {
    activeSurfaceId,
    currentIndex,
    currentNumber: currentIndex === null ? null : currentIndex + 1,
    count: surfaceIds.length,
    previousSurfaceId,
    nextSurfaceId,
    canGoPrevious: previousSurfaceId !== null,
    canGoNext: nextSurfaceId !== null,
    currentCourseSection,
    courseSectionItems,
  };
}

export function getSlideshowSurfaceStates(
  structure: ProjectedSlideshowCourseStructure,
  navigation: SlideshowNavigationState,
  transition: SlideshowSurfaceTransitionState | null = null,
): SlideshowSurfaceStateMap {
  const surfaceStates: Record<string, SlideshowSurfaceState> = {};

  if (transition && transition.destinationSurfaceId !== navigation.activeSurfaceId) {
    throw new Error(
      `Slideshow transition destination "${transition.destinationSurfaceId}" is not the active Surface "${navigation.activeSurfaceId}".`,
    );
  }

  for (const surfaceId of structure.surfaceIds) {
    if (transition) {
      surfaceStates[surfaceId] =
        surfaceId === transition.destinationSurfaceId
          ? "incoming"
          : surfaceId === transition.sourceSurfaceId
            ? "outgoing"
            : "hidden";
    } else if (surfaceId === navigation.activeSurfaceId) {
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
