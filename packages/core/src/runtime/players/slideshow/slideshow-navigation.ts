import type {
  RuntimeSurfaceState,
  RuntimeSurfaceStateMap,
} from "../../renderer/runtime-surface-visibility";
import type {
  CourseSectionId,
  ProjectedSlideshowCourseStructure,
  SurfaceId,
} from "@/document/model/course-structure";

export interface CourseSectionNavigationItem {
  readonly id: CourseSectionId;
  readonly title: string;
  readonly index: number;
  readonly number: number;
  readonly count: number;
  readonly firstSurfaceId: SurfaceId;
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
  readonly activeSurfaceId: SurfaceId;
  readonly currentIndex: number;
  readonly currentNumber: number;
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

export function getSlideshowNavigationState(
  structure: ProjectedSlideshowCourseStructure,
  requestedSurfaceId?: SurfaceId,
): SlideshowNavigationState {
  const { surfaceIds } = structure;
  const activeIndex = requestedSurfaceId ? surfaceIds.indexOf(requestedSurfaceId) : -1;
  const currentIndex = activeIndex >= 0 ? activeIndex : 0;
  const activeSurfaceId = surfaceIds[currentIndex] ?? surfaceIds[0];
  const previousSurfaceId = currentIndex > 0 ? (surfaceIds[currentIndex - 1] ?? null) : null;
  const nextSurfaceId =
    currentIndex < surfaceIds.length - 1 ? (surfaceIds[currentIndex + 1] ?? null) : null;
  const currentSurface = structure.surfaceById[activeSurfaceId]!;
  const currentCourseSection =
    structure.kind === "sectioned-slideshow"
      ? (() => {
          const section = structure.courseSectionById[currentSurface.courseSectionId!]!;
          const surfaceIndex = currentSurface.courseSectionSurfaceIndex!;
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
    currentNumber: currentIndex + 1,
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
): SlideshowSurfaceStateMap {
  const surfaceStates: Record<string, SlideshowSurfaceState> = {};

  for (const surfaceId of structure.surfaceIds) {
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
