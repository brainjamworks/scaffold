import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { CourseMode, OverflowMode, SurfaceSize } from "@/schemas/course-document";
import { CourseDocumentAttrsSchema } from "@/schemas/course-document";

export interface SurfaceViewSettings {
  mode: CourseMode;
  overflowMode: OverflowMode;
  surfaceSize: SurfaceSize;
}

export function getSurfaceViewSettings(
  documentJSON: JSONContent | null | undefined,
): SurfaceViewSettings {
  const courseDocument = documentJSON?.content?.[0];
  const attrs = CourseDocumentAttrsSchema.safeParse(
    courseDocument?.type === "courseDocument" ? (courseDocument.attrs ?? {}) : {},
  );

  if (!attrs.success) {
    throw new Error("Scaffold document is missing valid surface view settings.");
  }

  return {
    mode: attrs.data.mode,
    overflowMode: attrs.data.overflowMode,
    surfaceSize: attrs.data.surfaceSize,
  };
}

export function readSurfaceViewSettings(
  documentJSON: JSONContent | null | undefined,
): SurfaceViewSettings | null {
  try {
    return getSurfaceViewSettings(documentJSON);
  } catch {
    return null;
  }
}

export function readSurfaceViewSettingsFromProseMirrorDoc(
  doc: ProseMirrorNode | null | undefined,
): SurfaceViewSettings | null {
  const courseDocument = doc?.firstChild;
  if (courseDocument?.type.name !== "courseDocument") {
    return null;
  }

  const attrs = CourseDocumentAttrsSchema.safeParse(courseDocument.attrs ?? {});
  return attrs.success
    ? {
        mode: attrs.data.mode,
        overflowMode: attrs.data.overflowMode,
        surfaceSize: attrs.data.surfaceSize,
      }
    : null;
}
