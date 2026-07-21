import type { CourseDocumentAttrs, CourseMode } from "@/schemas/course-document";

type CourseDocumentViewDefaults = Pick<
  CourseDocumentAttrs,
  "mode" | "surfaceSize" | "overflowMode"
>;

export function getCourseDocumentDefaultsForMode(mode: CourseMode): CourseDocumentViewDefaults {
  if (mode === "slideshow") {
    return {
      mode,
      surfaceSize: "16x9",
      overflowMode: "clip",
    };
  }

  return {
    mode,
    surfaceSize: "fluid",
    overflowMode: "grow",
  };
}
