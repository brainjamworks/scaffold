import type { CourseMode } from "@/schemas/course-document";
import type {
  ProjectedPageCourseStructure,
  ProjectedSlideshowCourseStructure,
} from "@/document/model/course-structure";

export type RuntimePlayer = "page" | "slideshow";

export type SlideshowPlayerSizing = "contained" | "embedded";

export type RuntimePlayerSelection =
  | {
      player: "page";
      mode: Extract<CourseMode, "page">;
      structure: ProjectedPageCourseStructure;
    }
  | {
      player: "slideshow";
      mode: Extract<CourseMode, "slideshow">;
      structure: ProjectedSlideshowCourseStructure;
    };
