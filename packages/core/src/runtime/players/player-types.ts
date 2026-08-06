import type { CourseMode } from "@/schemas/course-document";
import type { SurfaceId } from "@/document/model/course-structure";

export type RuntimePlayer = "page" | "slideshow";

export type SlideshowPlayerSizing = "contained" | "embedded";

export type RuntimePlayerUnavailableReason =
  | "missing-initial-content"
  | "invalid-course-document"
  | "invalid-mode"
  | "missing-surface-id"
  | "duplicate-surface-id"
  | "invalid-surface-variant"
  | "invalid-surface-cardinality"
  | "unsupported-mode";

export type RuntimePlayerSelection =
  | {
      status: "available";
      player: "page";
      mode: Extract<CourseMode, "page">;
      surfaceIds: [SurfaceId];
    }
  | {
      status: "available";
      player: "slideshow";
      mode: Extract<CourseMode, "slideshow">;
      surfaceIds: [SurfaceId, ...SurfaceId[]];
    };
