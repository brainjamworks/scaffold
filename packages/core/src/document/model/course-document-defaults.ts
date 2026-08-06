import type { CourseDocumentAttrs, CourseMode } from "@/schemas/course-document";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

type CourseDocumentViewDefaults = Pick<
  CourseDocumentAttrs,
  "mode" | "surfaceSize" | "overflowMode" | "theme"
>;

export function getCourseDocumentDefaultsForMode(mode: CourseMode): CourseDocumentViewDefaults {
  if (mode === "slideshow") {
    return {
      mode,
      surfaceSize: "16x9",
      overflowMode: "clip",
      theme: createDefaultPersistedCourseTheme(),
    };
  }

  return {
    mode,
    surfaceSize: "fluid",
    overflowMode: "grow",
    theme: createDefaultPersistedCourseTheme(),
  };
}
