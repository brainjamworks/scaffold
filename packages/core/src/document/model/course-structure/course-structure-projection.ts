import {
  CourseSectionAttrsSchema,
  EmbeddedNodeIdSchema,
  type CourseSectionAttrs,
} from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import type { CourseSectionId, SurfaceId } from "./types";

export interface ProjectedCourseSurface {
  readonly id: SurfaceId;
  readonly index: number;
  readonly courseSectionId: CourseSectionId | null;
  readonly courseSectionSurfaceIndex: number | null;
}

export interface ProjectedCourseSection {
  readonly id: CourseSectionId;
  readonly title: string;
  readonly index: number;
  readonly surfaceIds: readonly SurfaceId[];
  readonly firstSurfaceId: SurfaceId | null;
}

interface ProjectedCourseStructureBase {
  readonly surfaceIds: readonly SurfaceId[];
  readonly surfaces: readonly ProjectedCourseSurface[];
  readonly surfaceById: Readonly<Record<string, ProjectedCourseSurface>>;
  readonly courseSections: readonly ProjectedCourseSection[];
  readonly courseSectionById: Readonly<Record<string, ProjectedCourseSection>>;
}

export interface ProjectedPageCourseStructure extends ProjectedCourseStructureBase {
  readonly kind: "page";
  readonly mode: "page";
  readonly surfaceIds: readonly [SurfaceId];
  readonly surfaces: readonly [ProjectedCourseSurface];
  readonly courseSections: readonly [];
}

export interface ProjectedSlideshowCourseStructure extends ProjectedCourseStructureBase {
  readonly kind: "slideshow";
  readonly mode: "slideshow";
  readonly courseSections: readonly [ProjectedCourseSection, ...ProjectedCourseSection[]];
}

export type ProjectedCourseStructure =
  | ProjectedPageCourseStructure
  | ProjectedSlideshowCourseStructure;

export function projectCourseStructure(content: JSONContent): ProjectedCourseStructure | null {
  if (content.type !== "doc" || content.content?.length !== 1) return null;
  const courseDocument = content.content[0];
  if (courseDocument?.type !== "courseDocument") return null;
  const mode = courseDocument.attrs?.["mode"];
  if (mode !== "page" && mode !== "slideshow") return null;

  const children = courseDocument.content ?? [];
  if (mode === "page") return projectPage(children);
  return projectSlideshow(children);
}

function projectPage(children: readonly JSONContent[]): ProjectedPageCourseStructure | null {
  if (children.length !== 1) return null;
  const surfaceId = parseSurfaceId(children[0]);
  if (!surfaceId) return null;
  const surface = freezeSurface(surfaceId, 0, null, null);
  return Object.freeze({
    kind: "page",
    mode: "page",
    surfaceIds: Object.freeze([surfaceId]) as readonly [SurfaceId],
    surfaces: Object.freeze([surface]) as readonly [ProjectedCourseSurface],
    surfaceById: freezeLookup([surface]),
    courseSections: Object.freeze([]) as readonly [],
    courseSectionById: freezeLookup([]),
  });
}

function projectSlideshow(
  children: readonly JSONContent[],
): ProjectedSlideshowCourseStructure | null {
  if (children[0]?.type !== "courseSection") return null;
  const surfaces: ProjectedCourseSurface[] = [];
  const courseSections: ProjectedCourseSection[] = [];
  const ids = new Set<string>();
  let activeSection: CourseSectionAttrs | null = null;
  let memberSurfaceIds: SurfaceId[] = [];

  const finishActiveSection = () => {
    if (!activeSection) return false;
    courseSections.push(
      Object.freeze({
        id: activeSection.id,
        title: activeSection.title,
        index: courseSections.length,
        surfaceIds: Object.freeze(memberSurfaceIds),
        firstSurfaceId: memberSurfaceIds[0] ?? null,
      }),
    );
    memberSurfaceIds = [];
    return true;
  };

  for (const child of children) {
    if (child.type === "courseSection") {
      if (activeSection && !finishActiveSection()) return null;
      if (child.content && child.content.length > 0) return null;
      const parsed = CourseSectionAttrsSchema.safeParse({
        id: child.attrs?.["id"],
        title: child.attrs?.["title"],
      });
      if (!parsed.success || ids.has(parsed.data.id)) return null;
      ids.add(parsed.data.id);
      activeSection = parsed.data;
      continue;
    }

    const surfaceId = parseSurfaceId(child);
    if (!activeSection || !surfaceId || ids.has(surfaceId)) return null;
    ids.add(surfaceId);
    memberSurfaceIds.push(surfaceId);
    surfaces.push(
      freezeSurface(surfaceId, surfaces.length, activeSection.id, memberSurfaceIds.length - 1),
    );
  }

  if (!finishActiveSection() || courseSections.length === 0) return null;
  return Object.freeze({
    kind: "slideshow",
    mode: "slideshow",
    surfaceIds: Object.freeze(surfaces.map(({ id }) => id)),
    surfaces: Object.freeze(surfaces),
    surfaceById: freezeLookup(surfaces),
    courseSections: Object.freeze(courseSections) as readonly [
      ProjectedCourseSection,
      ...ProjectedCourseSection[],
    ],
    courseSectionById: freezeLookup(courseSections),
  });
}

function parseSurfaceId(node: JSONContent | undefined): SurfaceId | null {
  if (node?.type !== "surface") return null;
  const parsed = EmbeddedNodeIdSchema.safeParse(node.attrs?.["id"]);
  return parsed.success ? parsed.data : null;
}

function freezeSurface(
  id: SurfaceId,
  index: number,
  courseSectionId: CourseSectionId | null,
  courseSectionSurfaceIndex: number | null,
): ProjectedCourseSurface {
  return Object.freeze({ id, index, courseSectionId, courseSectionSurfaceIndex });
}

function freezeLookup<T extends { readonly id: string }>(items: readonly T[]) {
  return Object.freeze(Object.fromEntries(items.map((item) => [item.id, item]))) as Readonly<
    Record<string, T>
  >;
}
