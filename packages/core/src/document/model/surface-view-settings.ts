import { z } from "zod";
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  CourseModeSchema,
  OverflowModeSchema,
  SurfaceSizeSchema,
  type CourseMode,
  type OverflowMode,
  type SurfaceSize,
} from "@/schemas/course-document";

export interface SurfaceViewSettings {
  mode: CourseMode;
  overflowMode: OverflowMode;
  surfaceSize: SurfaceSize;
}

/**
 * Only the view fields the Stage consumes. Unrelated document configuration
 * (theme, orchestration, ProseMirror working null sentinels) must never blank
 * the canvas, so this stays deliberately narrower than the portable attrs
 * contract. Unknown attrs are stripped, never rejected.
 */
const SurfaceViewSettingsSchema = z
  .object({
    mode: CourseModeSchema,
    surfaceSize: SurfaceSizeSchema.default("fluid"),
    overflowMode: OverflowModeSchema.default("grow"),
  })
  .refine(
    (attrs) =>
      attrs.mode === "slideshow" ? attrs.surfaceSize === "16x9" : attrs.surfaceSize === "fluid",
    {
      message: "surfaceSize must match the course mode",
      path: ["surfaceSize"],
    },
  );

export function getSurfaceViewSettings(
  documentJSON: JSONContent | null | undefined,
): SurfaceViewSettings {
  const courseDocument = documentJSON?.content?.[0];
  const attrs = SurfaceViewSettingsSchema.safeParse(
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

  const attrs = SurfaceViewSettingsSchema.safeParse(courseDocument.attrs ?? {});
  return attrs.success
    ? {
        mode: attrs.data.mode,
        overflowMode: attrs.data.overflowMode,
        surfaceSize: attrs.data.surfaceSize,
      }
    : null;
}
