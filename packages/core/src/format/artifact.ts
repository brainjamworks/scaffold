import type { JSONContent } from "@tiptap/core";
import { nanoid } from "nanoid";

import {
  SCAFFOLD_DOCUMENT_FORMAT_VERSION,
  CourseDocumentAttrsSchema,
  ScaffoldArtifactSchema,
  type CourseDocumentAttrs,
  type ScaffoldArtifact,
  type CourseMode,
  type OverflowMode,
  type SurfaceSize,
} from "@/schemas/course-document";
import { getCourseDocumentDefaultsForMode } from "@/document/model/course-document-defaults";
import { migrateCourseDocumentJSON } from "@/document/model/validation/migrations";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

const ID_TOKEN_SIZE = 12;

export interface CreateScaffoldDocumentContentInput {
  mode: CourseMode;
  surfaceSize?: SurfaceSize;
  overflowMode?: OverflowMode;
  surfaceId?: string;
}

export interface CreateScaffoldArtifactInput extends CreateScaffoldDocumentContentInput {
  id: string;
  title: string;
}

export type PreparedScaffoldArtifactValue = Omit<ScaffoldArtifact, "content"> & {
  content: JSONContent;
};

export type ScaffoldUninitializedAuthoringBootstrap = Omit<ScaffoldArtifact, "content"> & {
  content: null;
};

export type PreparedScaffoldArtifact =
  | {
      status: "ready";
      artifact: PreparedScaffoldArtifactValue;
      source: "stored";
    }
  | {
      status: "uninitialized";
      bootstrap: ScaffoldUninitializedAuthoringBootstrap;
    }
  | {
      status: "error";
      message: string;
    };

export function createScaffoldDocumentContent(
  input: CreateScaffoldDocumentContentInput,
): JSONContent {
  const defaults = getCourseDocumentDefaultsForMode(input.mode);
  const attrs = CourseDocumentAttrsSchema.parse({
    schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
    mode: defaults.mode,
    surfaceSize: input.surfaceSize ?? defaults.surfaceSize,
    overflowMode: input.overflowMode ?? defaults.overflowMode,
  });
  const surfaceId = input.surfaceId ?? nanoid(ID_TOKEN_SIZE);

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs,
        content: [
          builtInSurfaceVariantRegistry.createDefault({
            mode: input.mode,
            surfaceId,
          }),
        ],
      },
    ],
  };
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
  surfaceSize,
  overflowMode,
  surfaceId,
}: CreateScaffoldArtifactInput): PreparedScaffoldArtifactValue {
  return {
    id,
    title,
    mode,
    content: createScaffoldDocumentContent({
      mode,
      ...(surfaceSize ? { surfaceSize } : {}),
      ...(overflowMode ? { overflowMode } : {}),
      ...(surfaceId ? { surfaceId } : {}),
    }),
  };
}

export function prepareScaffoldArtifactForAuthoring(value: unknown): PreparedScaffoldArtifact {
  const parsedArtifact = ScaffoldArtifactSchema.safeParse(value);
  if (!parsedArtifact.success) {
    return {
      status: "error",
      message: parsedArtifact.error.message,
    };
  }

  const artifact = parsedArtifact.data;
  if (artifact.content === null) {
    return {
      status: "uninitialized",
      bootstrap: { ...artifact, content: null },
    };
  }

  const migration = migrateCourseDocumentJSON(artifact.content);
  if (!migration.ok) {
    return {
      status: "error",
      message: migration.message,
    };
  }

  const attrs = readCourseDocumentAttrs(migration.document);
  if (!attrs) {
    return {
      status: "error",
      message: "Scaffold artifact content is missing courseDocument attrs.",
    };
  }

  if (attrs.mode !== artifact.mode) {
    return {
      status: "error",
      message: `Scaffold artifact mode "${artifact.mode}" does not match content mode "${attrs.mode}".`,
    };
  }

  return {
    status: "ready",
    artifact: {
      ...artifact,
      content: migration.document,
    },
    source: "stored",
  };
}

export {
  ScaffoldArtifactSchema,
  CourseDocumentAttrsSchema,
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
