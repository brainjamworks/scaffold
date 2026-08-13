import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export type CourseSectionId = EmbeddedNodeId;
export type SurfaceId = EmbeddedNodeId;

export type SurfaceDestination =
  | { readonly beforeSurfaceId: SurfaceId }
  | { readonly afterSurfaceId: SurfaceId }
  | {
      readonly intoCourseSectionId: CourseSectionId;
      readonly edge: "start" | "end";
    };

export type CourseStructureCommand =
  | {
      readonly type: "course-section.create";
      readonly placement: "end";
    }
  | {
      readonly type: "course-section.rename";
      readonly courseSectionId: CourseSectionId;
      readonly title: string;
    }
  | {
      readonly type: "course-section.delete";
      readonly courseSectionId: CourseSectionId;
      readonly expectedSurfaceIds: readonly SurfaceId[];
    }
  | {
      readonly type: "course-section.duplicate";
      readonly courseSectionId: CourseSectionId;
    }
  | {
      readonly type: "surface.insert";
      readonly surface: ProseMirrorNode;
      readonly destination: SurfaceDestination;
    }
  | { readonly type: "surface.duplicate"; readonly surfaceId: SurfaceId }
  | { readonly type: "surface.delete"; readonly surfaceId: SurfaceId }
  | {
      readonly type: "surface.move";
      readonly surfaceId: SurfaceId;
      readonly destination: SurfaceDestination;
    };

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    courseStructure: {
      applyCourseStructureCommand: (command: CourseStructureCommand) => ReturnType;
    };
  }
}
