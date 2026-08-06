import { CourseSectionAttrsSchema } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";
import { CourseDocumentAttrsSchema } from "@/schemas/course-document";

import {
  createCourseStructureSnapshot,
  type PendingCourseSection,
} from "./structure-snapshot";
import type {
  CourseStructureIssue,
  CourseStructureValidationResult,
  CourseSurface,
} from "./types";
import {
  courseDocumentChildPath,
  createCourseStructureIssue as issue,
  firstJsonDifferencePath,
  getJsonContent,
  invalidCourseStructureResult,
} from "./validation-json";
import { validateCourseSurface } from "./validation-surface";

interface LocatedNode {
  readonly child: JSONContent;
  readonly index: number;
}

export function validateCourseStructure(
  content: JSONContent,
  surfaceVariants: SurfaceVariantLookup,
): CourseStructureValidationResult {
  if (content.type !== "doc") {
    return invalidCourseStructureResult([
      issue("invalid_top_node", "course document JSON must start with doc", ["type"]),
    ]);
  }

  const issues: CourseStructureIssue[] = [];
  const topChildren = getJsonContent(content);
  const courseDocuments = locateNodes(topChildren, "courseDocument");
  if (courseDocuments.length === 0) {
    return invalidCourseStructureResult([
      issue("missing_course_document", "doc must contain one courseDocument", ["content"]),
    ]);
  }
  if (courseDocuments.length > 1) {
    issues.push(
      issue("multiple_course_documents", "doc must contain exactly one courseDocument", [
        "content",
      ]),
    );
  }
  for (const [index, child] of topChildren.entries()) {
    if (child.type !== "courseDocument") {
      issues.push(
        issue("invalid_course_document_child", "doc can only contain courseDocument", [
          "content",
          index,
        ]),
      );
    }
  }

  const { child: courseDocument, index: courseDocumentIndex } = courseDocuments[0]!;
  const attrsResult = CourseDocumentAttrsSchema.safeParse(courseDocument.attrs);
  collectCourseDocumentAttrIssues(attrsResult, courseDocument.attrs, courseDocumentIndex, issues);
  const mode = attrsResult.success ? attrsResult.data.mode : undefined;
  const directChildren = getJsonContent(courseDocument);
  const surfaces = locateNodes(directChildren, "surface");
  const boundaries = locateNodes(directChildren, "courseSection");

  for (const [index, child] of directChildren.entries()) {
    if (child.type !== "surface" && child.type !== "courseSection") {
      issues.push(
        issue(
          "invalid_course_document_child",
          "courseDocument can only contain Course Sections and Surfaces",
          courseDocumentChildPath(courseDocumentIndex, index),
        ),
      );
    }
  }
  collectPartitionIssues(
    mode,
    surfaces,
    boundaries,
    directChildren,
    courseDocumentIndex,
    issues,
  );

  const seenIds = new Set<string>();
  const pendingSections = validateCourseSections(
    boundaries,
    courseDocumentIndex,
    seenIds,
    issues,
  );
  const sectionByChildIndex = new Map(
    pendingSections.map((section) => [section.childIndex, section]),
  );
  const validatedSurfaces: CourseSurface[] = [];
  let currentSection: PendingCourseSection | null = null;
  for (const [childIndex, child] of directChildren.entries()) {
    if (child.type === "courseSection") {
      currentSection = sectionByChildIndex.get(childIndex) ?? null;
      continue;
    }
    if (child.type !== "surface") continue;
    const validated = validateCourseSurface({
      surface: child,
      childIndex,
      courseDocumentIndex,
      mode,
      surfaceVariants,
      seenIds,
      courseSectionId:
        mode === "slideshow" && boundaries.length > 0 ? currentSection?.id ?? null : null,
      surfaceIndex: validatedSurfaces.length,
      issues,
    });
    if (!validated) continue;
    validatedSurfaces.push(validated);
    currentSection?.surfaceIds.push(validated.id);
  }

  if (issues.length > 0 || mode === undefined || mode === "branching") {
    return invalidCourseStructureResult(issues);
  }
  return createCourseStructureSnapshot(mode, validatedSurfaces, pendingSections);
}

function collectCourseDocumentAttrIssues(
  parsed: ReturnType<typeof CourseDocumentAttrsSchema.safeParse>,
  persisted: unknown,
  courseDocumentIndex: number,
  issues: CourseStructureIssue[],
) {
  if (!parsed.success) {
    for (const schemaIssue of parsed.error.issues) {
      issues.push(
        issue(
          "invalid_course_document_attrs",
          "courseDocument attrs must match CourseDocumentAttrsSchema",
          ["content", courseDocumentIndex, "attrs", ...schemaIssue.path],
        ),
      );
    }
    return;
  }
  const difference = firstJsonDifferencePath(parsed.data, persisted);
  if (difference) {
    issues.push(
      issue(
        "invalid_course_document_attrs",
        "courseDocument attrs must match CourseDocumentAttrsSchema exactly",
        ["content", courseDocumentIndex, "attrs", ...difference],
      ),
    );
  }
}

function collectPartitionIssues(
  mode: "page" | "slideshow" | "branching" | undefined,
  surfaces: LocatedNode[],
  boundaries: LocatedNode[],
  directChildren: JSONContent[],
  courseDocumentIndex: number,
  issues: CourseStructureIssue[],
) {
  if (mode === "branching") {
    issues.push(
      issue("unsupported_surface_mode", "branching surface mode is not supported", [
        "content",
        courseDocumentIndex,
        "attrs",
        "mode",
      ]),
    );
  } else if (
    mode !== undefined &&
    ((mode === "page" && surfaces.length !== 1) || (mode === "slideshow" && surfaces.length < 1))
  ) {
    issues.push(
      issue(
        "invalid_surface_cardinality",
        mode === "page"
          ? "page mode requires exactly one surface"
          : "slideshow mode requires at least one surface",
        ["content", courseDocumentIndex, "content"],
      ),
    );
  }

  if (mode === "page") {
    for (const boundary of boundaries) {
      issues.push(
        issue(
          "course_section_not_allowed_in_mode",
          "Course Sections are not allowed in page mode",
          courseDocumentChildPath(courseDocumentIndex, boundary.index),
        ),
      );
    }
    return;
  }
  if (mode !== "slideshow" || boundaries.length === 0) return;

  const firstSurface = surfaces[0];
  if (firstSurface && directChildren[0]?.type !== "courseSection") {
    issues.push(
      issue(
        "incomplete_course_section_partition",
        "a sectioned Slideshow must begin with a Course Section",
        courseDocumentChildPath(courseDocumentIndex, firstSurface.index),
      ),
    );
  }
  for (const boundary of boundaries) {
    if (directChildren[boundary.index + 1]?.type !== "surface") {
      issues.push(
        issue(
          "empty_course_section",
          "a Course Section must own at least one following Surface",
          courseDocumentChildPath(courseDocumentIndex, boundary.index),
        ),
      );
    }
  }
}

function validateCourseSections(
  boundaries: LocatedNode[],
  courseDocumentIndex: number,
  seenIds: Set<string>,
  issues: CourseStructureIssue[],
): PendingCourseSection[] {
  const pending: PendingCourseSection[] = [];
  for (const { child, index } of boundaries) {
    const path = courseDocumentChildPath(courseDocumentIndex, index);
    const parsed = CourseSectionAttrsSchema.safeParse(child.attrs);
    if (!parsed.success) {
      for (const schemaIssue of parsed.error.issues) {
        issues.push(
          issue(
            "invalid_course_section_attrs",
            "Course Section attrs must match CourseSectionAttrsSchema",
            [...path, "attrs", ...schemaIssue.path],
          ),
        );
      }
      continue;
    }
    const difference = firstJsonDifferencePath(parsed.data, child.attrs);
    if (difference) {
      issues.push(
        issue(
          "invalid_course_section_attrs",
          "Course Section attrs must match CourseSectionAttrsSchema exactly",
          [...path, "attrs", ...difference],
        ),
      );
    }
    if (seenIds.has(parsed.data.id)) {
      issues.push(
        issue(
          "duplicate_course_section_id",
          `Course Section id "${parsed.data.id}" must be unique`,
          [...path, "attrs", "id"],
        ),
      );
    } else {
      seenIds.add(parsed.data.id);
    }
    pending.push({
      id: parsed.data.id,
      title: parsed.data.title,
      childIndex: index,
      surfaceIds: [],
    });
  }
  return pending;
}

function locateNodes(children: JSONContent[], type: string): LocatedNode[] {
  return children
    .map((child, index) => ({ child, index }))
    .filter(({ child }) => child.type === type);
}
