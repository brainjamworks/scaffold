import {
  PresentationConfigurationV1Schema,
  type SurfacePresentationNarrationV1,
} from "@scaffold/contracts";
import type { Editor } from "@tiptap/react";

export function resolveSurfacePresentation(
  editor: Editor,
  surfaceId: string | null | undefined,
  courseMode: string | null,
):
  | {
      readonly narration: SurfacePresentationNarrationV1 | null;
      readonly durationMs: number;
    }
  | undefined {
  if (courseMode !== "slideshow" || !surfaceId) return undefined;
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument) throw new Error("The Course Document is missing.");
  const value = courseDocument.attrs["presentation"];
  if (value === null || value === undefined) return { narration: null, durationMs: 0 };
  const configuration = PresentationConfigurationV1Schema.parse(value);
  const timeline = configuration.surfaces.find((candidate) => candidate.surfaceId === surfaceId);
  if (!timeline) {
    throw new Error(`Presentation configuration has no Timeline for Surface "${surfaceId}".`);
  }
  return { narration: timeline.narration ?? null, durationMs: timeline.durationMs };
}

export function readCourseMode(editor: Editor): string | null {
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument || courseDocument.type.name !== "courseDocument") {
    return null;
  }

  const mode = courseDocument.attrs["mode"];
  return typeof mode === "string" ? mode : null;
}
