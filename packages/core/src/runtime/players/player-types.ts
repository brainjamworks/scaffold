import type { CourseMode } from "@/schemas/course-document";
import type { SurfaceId } from "@/document/model/course-structure";

export type RuntimePlayer = "page" | "slideshow";

export type SlideshowPlayerSizing = "contained" | "embedded";

export type RuntimePlayerSelection =
  | {
      player: "page";
      mode: Extract<CourseMode, "page">;
      surfaceIds: [SurfaceId];
    }
  | {
      player: "slideshow";
      mode: Extract<CourseMode, "slideshow">;
      surfaceIds: [SurfaceId, ...SurfaceId[]];
    };
