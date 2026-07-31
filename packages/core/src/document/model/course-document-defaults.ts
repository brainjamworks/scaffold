import type { CourseDocumentAttrs, CourseMode } from "@/schemas/course-document";
import { createScaffoldDefaultTheme } from "@/theme/model";

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
      theme: createScaffoldDefaultTheme(),
    };
  }

  return {
    mode,
    surfaceSize: "fluid",
    overflowMode: "grow",
    theme: createScaffoldDefaultTheme(),
  };
}
