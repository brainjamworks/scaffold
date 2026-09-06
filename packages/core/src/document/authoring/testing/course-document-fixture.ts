import { SCAFFOLD_DOCUMENT_FORMAT_VERSION, type CourseMode } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

/**
 * Shared Course Document fixture builder for `src/document/authoring` tests.
 *
 * Two rules are easy to get wrong by hand, and both silently produced
 * unrunnable suites before RIZ-337:
 *
 * 1. `CourseDocumentAttrsSchema` requires `requiresScaffoldPlus` (564e01df) and
 *    pins `surfaceSize` to the mode — "16x9" for slideshow, "fluid" otherwise.
 * 2. `CourseDocumentNode.content` is `surface | (courseSection surface*)+`, so a
 *    slideshow with anything other than exactly one Surface needs a leading
 *    `courseSection` boundary.
 */
export interface FixtureCourseDocumentInput {
  readonly mode: CourseMode;
  readonly surfaces: readonly JSONContent[];
  /** Extra or overriding `courseDocument` attrs (e.g. `overflowMode`, `presentation`). */
  readonly attrs?: Record<string, unknown>;
  readonly courseSectionId?: string;
  readonly courseSectionTitle?: string;
}

export function fixtureCourseDocumentAttrs(
  mode: CourseMode,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: createEmbeddedNodeId(),
    schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
    requiresScaffoldPlus: false,
    mode,
    surfaceSize: mode === "slideshow" ? "16x9" : "fluid",
    overflowMode: mode === "slideshow" ? "clip" : "grow",
    theme: createDefaultPersistedCourseTheme(),
    ...overrides,
  };
}

export function fixtureCourseDocument({
  mode,
  surfaces,
  attrs = {},
  courseSectionId,
  courseSectionTitle = "Slides",
}: FixtureCourseDocumentInput): JSONContent {
  // A caller that already supplies its own Course Section boundaries keeps them
  // verbatim; only an unsectioned slideshow gets the boundary its content
  // expression requires.
  const alreadySectioned = surfaces.some((node) => node.type === "courseSection");
  const content =
    mode === "slideshow" && !alreadySectioned
      ? [
          {
            type: "courseSection",
            attrs: { id: courseSectionId ?? createEmbeddedNodeId(), title: courseSectionTitle },
          },
          ...surfaces,
        ]
      : [...surfaces];

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: fixtureCourseDocumentAttrs(mode, attrs),
        content,
      },
    ],
  };
}
