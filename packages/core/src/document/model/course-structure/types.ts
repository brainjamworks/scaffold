import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

export type CourseSectionId = EmbeddedNodeId;
export type SurfaceId = EmbeddedNodeId;
export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export interface CourseSurface {
  readonly id: SurfaceId;
  readonly variantId: string;
  readonly index: number;
  readonly courseSectionId: CourseSectionId | null;
}

export interface CourseSection {
  readonly id: CourseSectionId;
  readonly title: string;
  readonly index: number;
  readonly surfaceIds: NonEmptyReadonlyArray<SurfaceId>;
  readonly firstSurfaceId: SurfaceId;
}

interface CourseStructureBase {
  readonly surfaces: NonEmptyReadonlyArray<CourseSurface>;
  readonly surfaceIds: NonEmptyReadonlyArray<SurfaceId>;
  readonly surfaceById: ReadonlyMap<SurfaceId, CourseSurface>;
}

export interface PageCourseStructure extends CourseStructureBase {
  readonly mode: "page";
  readonly sectioning: "none";
  readonly surfaces: readonly [CourseSurface];
  readonly surfaceIds: readonly [SurfaceId];
  readonly courseSections: readonly [];
  readonly courseSectionById: ReadonlyMap<CourseSectionId, never>;
}

export interface UnsectionedSlideshowCourseStructure extends CourseStructureBase {
  readonly mode: "slideshow";
  readonly sectioning: "none";
  readonly courseSections: readonly [];
  readonly courseSectionById: ReadonlyMap<CourseSectionId, never>;
}

export interface SectionedSlideshowCourseStructure extends CourseStructureBase {
  readonly mode: "slideshow";
  readonly sectioning: "course-sections";
  readonly courseSections: NonEmptyReadonlyArray<CourseSection>;
  readonly courseSectionById: ReadonlyMap<CourseSectionId, CourseSection>;
}

export type CourseStructure =
  | PageCourseStructure
  | UnsectionedSlideshowCourseStructure
  | SectionedSlideshowCourseStructure;

export type CourseStructureIssueCode =
  | "invalid_top_node"
  | "missing_course_document"
  | "multiple_course_documents"
  | "invalid_course_document_attrs"
  | "invalid_course_document_child"
  | "invalid_surface_attrs"
  | "duplicate_surface_id"
  | "unknown_surface_variant"
  | "surface_variant_mode_mismatch"
  | "invalid_surface_settings"
  | "duplicate_header_footer"
  | "invalid_header_footer_slots"
  | "fixed_surface_child_count_mismatch"
  | "fixed_surface_child_type_mismatch"
  | "fixed_surface_child_attribute_mismatch"
  | "invalid_surface_cardinality"
  | "unsupported_surface_mode"
  | "incomplete_quiz"
  | "invalid_course_section_attrs"
  | "duplicate_course_section_id"
  | "course_section_not_allowed_in_mode"
  | "incomplete_course_section_partition"
  | "empty_course_section";

export interface CourseStructureIssue {
  readonly code: CourseStructureIssueCode;
  readonly message: string;
  readonly path: readonly (string | number)[];
}

export type CourseStructureValidationResult =
  | { readonly ok: true; readonly value: CourseStructure }
  | { readonly ok: false; readonly issues: readonly CourseStructureIssue[] };

export type SurfaceDestination =
  | { readonly beforeSurfaceId: SurfaceId }
  | { readonly afterSurfaceId: SurfaceId };

export type CourseStructureCommand =
  | {
      readonly type: "course-section.start";
      readonly atSurfaceId: SurfaceId;
      readonly title: string;
      readonly leadingTitle?: string;
    }
  | {
      readonly type: "course-section.rename";
      readonly courseSectionId: CourseSectionId;
      readonly title: string;
    }
  | {
      readonly type: "course-section.remove";
      readonly courseSectionId: CourseSectionId;
    }
  | {
      readonly type: "course-section.move";
      readonly courseSectionId: CourseSectionId;
      readonly beforeCourseSectionId: CourseSectionId | null;
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

export type CourseStructureTransactionIssueCode =
  | "invalid_source_document"
  | "unsupported_mode"
  | "target_not_found"
  | "invalid_destination"
  | "invalid_title"
  | "leading_section_title_required"
  | "section_already_starts_at_surface"
  | "cannot_delete_last_surface"
  | "no_change"
  | "schema_rejected_transaction"
  | "invalid_result";

export interface CourseStructureTransactionIssue {
  readonly code: CourseStructureTransactionIssueCode;
  readonly message: string;
  readonly targetId?: EmbeddedNodeId;
}

export type CourseStructureTransactionResult =
  | {
      readonly ok: true;
      readonly transaction: Transaction;
      readonly next: CourseStructure;
    }
  | { readonly ok: false; readonly issue: CourseStructureTransactionIssue };

export interface CourseStructureModule {
  validate(content: JSONContent): CourseStructureValidationResult;
  buildTransaction(
    state: EditorState,
    command: CourseStructureCommand,
  ): CourseStructureTransactionResult;
}

export type CourseStructureValidator = Pick<CourseStructureModule, "validate">;
