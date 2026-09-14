import type { JSONContent } from "@tiptap/core";

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import {
  SCAFFOLD_DOCUMENT_FORMAT_VERSION,
  CourseDocumentAttrsSchema,
  CourseSectionTitleSchema,
  type CourseDocumentAttrs,
  type CourseMode,
  type OverflowMode,
  type SurfaceSize,
} from "@/schemas/course-document";
import { getCourseDocumentDefaultsForMode } from "@/document/model/course-document-defaults";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

interface CreateScaffoldDocumentContentOptions {
  requiresScaffoldPlus?: boolean;
  surfaceSize?: SurfaceSize;
  overflowMode?: OverflowMode;
  surfaceId?: string;
}

export type CreateScaffoldDocumentContentInput = CreateScaffoldDocumentContentOptions &
  (
    | { mode: "slideshow"; initialCourseSectionTitle: string }
    | {
        mode: Exclude<CourseMode, "slideshow">;
        initialCourseSectionTitle?: never;
      }
  );

export type CreateScaffoldArtifactInput = CreateScaffoldDocumentContentInput & {
  id: string;
  title: string;
};

export function createScaffoldDocumentContent(
  input: CreateScaffoldDocumentContentInput,
): JSONContent {
  const defaults = getCourseDocumentDefaultsForMode(input.mode);
  const courseDocumentId = createEmbeddedNodeId();
  const attrs = CourseDocumentAttrsSchema.parse({
    schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
    requiresScaffoldPlus: input.requiresScaffoldPlus ?? false,
    mode: defaults.mode,
    surfaceSize: input.surfaceSize ?? defaults.surfaceSize,
    overflowMode: input.overflowMode ?? defaults.overflowMode,
    theme: defaults.theme,
  });
  const surfaceId =
    input.surfaceId === undefined
      ? createEmbeddedNodeId()
      : EmbeddedNodeIdSchema.parse(input.surfaceId);

  const surface = builtInSurfaceVariantRegistry.createDefault({
    mode: input.mode,
    surfaceId,
  });
  assignCreatedNodeIds(surface);
  const documentContent =
    input.mode === "slideshow"
      ? [
          {
            type: "courseSection",
            attrs: {
              id: createEmbeddedNodeId(),
              title: CourseSectionTitleSchema.parse(input.initialCourseSectionTitle),
            },
          },
          surface,
        ]
      : [surface];

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: courseDocumentId, ...attrs },
        content: documentContent,
      },
    ],
  };
}

function assignCreatedNodeIds(root: JSONContent): void {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type !== "doc" && node.type !== "text") {
      node.attrs = { ...node.attrs, id: node.attrs?.["id"] ?? createEmbeddedNodeId() };
    }
    for (const child of node.content ?? []) stack.push(child);
  }
}

export function readCourseDocumentAttrs(content: unknown): CourseDocumentAttrs | null {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return null;
  }

  const doc = content as JSONContent;
  if (doc.type !== "doc") return null;

  const courseDocument = doc.content?.[0];
  if (courseDocument?.type !== "courseDocument") return null;

  const parsed = CourseDocumentAttrsSchema.safeParse(courseDocument.attrs ?? {});
  return parsed.success ? parsed.data : null;
}

export function readCourseDocumentMode(content: unknown): CourseMode | null {
  return readCourseDocumentAttrs(content)?.mode ?? null;
}

export function createScaffoldArtifact({
  id,
  title,
  mode,
  requiresScaffoldPlus,
  surfaceSize,
  overflowMode,
  surfaceId,
  initialCourseSectionTitle,
}: CreateScaffoldArtifactInput) {
  return {
    id,
    title,
    mode,
    content: createScaffoldDocumentContent({
      ...(mode === "slideshow" ? { mode, initialCourseSectionTitle } : { mode }),
      ...(requiresScaffoldPlus === undefined ? {} : { requiresScaffoldPlus }),
      ...(surfaceSize ? { surfaceSize } : {}),
      ...(overflowMode ? { overflowMode } : {}),
      ...(surfaceId !== undefined ? { surfaceId } : {}),
    }),
  };
}

export {
  ScaffoldArtifactSchema,
  CourseDocumentAttrsSchema,
  CourseSectionTitleSchema,
  ScaffoldDocumentContentSchema,
  CourseModeSchema,
  OverflowModeSchema,
  SurfaceAttrsSchema,
  SurfaceBackgroundSchema,
  SurfaceSizeSchema,
  type CourseDocumentAttrs,
  type ScaffoldArtifact,
  type ScaffoldDocumentContent,
  type CourseMode,
  type OverflowMode,
  type SurfaceAttrs,
  type SurfaceBackground,
  type SurfaceSize,
} from "@/schemas/course-document";
