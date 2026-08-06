import type { JSONContent } from "@tiptap/core";

import {
  matchFixedSurfaceChildren,
  snapshotSurfaceStructureChildrenFromJSON,
  type FixedSurfaceChildrenMismatch,
} from "@/editor/surfaces/model/policies/surface-fixed-structure";
import type { RegisteredSurfaceVariantDefinition } from "@/editor/surfaces/model/surface-variant-definition";
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";
import { SurfaceAttrsSchema } from "@/schemas/course-document";

import type {
  CourseSectionId,
  CourseStructureIssue,
  CourseStructureIssueCode,
  CourseSurface,
} from "./types";
import {
  courseDocumentChildPath,
  createCourseStructureIssue as issue,
  firstJsonDifferencePath,
  formatJsonValue,
  getJsonContent,
  isJsonRecord,
} from "./validation-json";

export function validateCourseSurface({
  surface,
  childIndex,
  courseDocumentIndex,
  mode,
  surfaceVariants,
  seenIds,
  courseSectionId,
  surfaceIndex,
  issues,
}: {
  surface: JSONContent;
  childIndex: number;
  courseDocumentIndex: number;
  mode: "page" | "slideshow" | "branching" | undefined;
  surfaceVariants: SurfaceVariantLookup;
  seenIds: Set<string>;
  courseSectionId: CourseSectionId | null;
  surfaceIndex: number;
  issues: CourseStructureIssue[];
}): CourseSurface | null {
  const surfacePath = courseDocumentChildPath(courseDocumentIndex, childIndex);
  const attrs = surface.attrs;
  if (!isJsonRecord(attrs)) {
    issues.push(issue("invalid_surface_attrs", "surface attrs must be an object", [...surfacePath, "attrs"]));
    return null;
  }

  const { settings: _settings, ...attrsWithoutSettings } = attrs;
  const parsed = SurfaceAttrsSchema.omit({ settings: true }).safeParse(attrsWithoutSettings);
  if (!parsed.success) {
    for (const schemaIssue of parsed.error.issues) {
      issues.push(
        issue("invalid_surface_attrs", "surface attrs must match SurfaceAttrsSchema", [
          ...surfacePath,
          "attrs",
          ...schemaIssue.path,
        ]),
      );
    }
    return null;
  }
  const difference = firstJsonDifferencePath(parsed.data, attrsWithoutSettings);
  if (difference) {
    issues.push(
      issue("invalid_surface_attrs", "surface attrs must match SurfaceAttrsSchema exactly", [
        ...surfacePath,
        "attrs",
        ...difference,
      ]),
    );
  }

  const { id, variant: variantId } = parsed.data;
  if (seenIds.has(id)) {
    issues.push(
      issue("duplicate_surface_id", `surface instance id "${id}" must be unique`, [
        ...surfacePath,
        "attrs",
        "id",
      ]),
    );
  } else {
    seenIds.add(id);
  }

  const definition = surfaceVariants.get(variantId);
  if (!definition) {
    issues.push(
      issue("unknown_surface_variant", `surface variant "${variantId}" is not registered`, [
        ...surfacePath,
        "attrs",
        "variant",
      ]),
    );
    return null;
  }
  if (mode !== undefined && !definition.modes.includes(mode)) {
    issues.push(
      issue(
        "surface_variant_mode_mismatch",
        `surface variant "${variantId}" does not support course mode "${mode}"`,
        [...surfacePath, "attrs", "variant"],
      ),
    );
  }

  validateSettings(attrs["settings"] ?? {}, definition, surfacePath, issues);
  collectHeaderFooterIssues(surface, surfacePath, issues);
  const fixedIssue = fixedStructureIssue(surface, definition, surfacePath);
  if (fixedIssue) issues.push(fixedIssue);

  return Object.freeze({ id, variantId, index: surfaceIndex, courseSectionId });
}

function validateSettings(
  persisted: unknown,
  definition: RegisteredSurfaceVariantDefinition,
  surfacePath: readonly (string | number)[],
  issues: CourseStructureIssue[],
) {
  const parsed = definition.settingsSchema.safeParse(persisted);
  if (!parsed.success) {
    for (const schemaIssue of parsed.error.issues) {
      issues.push(
        issue(
          "invalid_surface_settings",
          `surface variant "${definition.id}" settings must match the current schema exactly`,
          [...surfacePath, "attrs", "settings", ...schemaIssue.path],
        ),
      );
    }
    return;
  }
  const difference = firstJsonDifferencePath(parsed.data, persisted);
  if (difference) {
    issues.push(
      issue(
        "invalid_surface_settings",
        `surface variant "${definition.id}" settings must match the current schema exactly`,
        [...surfacePath, "attrs", "settings", ...difference],
      ),
    );
  }
}

function collectHeaderFooterIssues(
  surface: JSONContent,
  surfacePath: readonly (string | number)[],
  issues: CourseStructureIssue[],
) {
  for (const nodeType of ["surface_header", "surface_footer"] as const) {
    const boundaries = getJsonContent(surface)
      .map((child, index) => ({ child, index }))
      .filter(({ child }) => child.type === nodeType);
    for (const duplicate of boundaries.slice(1)) {
      issues.push(
        issue("duplicate_header_footer", `surface can contain at most one ${nodeType}`, [
          ...surfacePath,
          "content",
          duplicate.index,
        ]),
      );
    }
    for (const { child, index } of boundaries) {
      if (!hasValidSlots(child)) {
        issues.push(
          issue(
            "invalid_header_footer_slots",
            `${nodeType} must contain ordered left, center, and right slots`,
            [...surfacePath, "content", index],
          ),
        );
      }
    }
  }
}

function hasValidSlots(boundary: JSONContent): boolean {
  const positions = ["left", "center", "right"] as const;
  const slots = getJsonContent(boundary);
  return (
    slots.length === positions.length &&
    slots.every(
      (slot, index) =>
        slot.type === "surface_header_footer_slot" && slot.attrs?.["position"] === positions[index],
    )
  );
}

function fixedStructureIssue(
  surface: JSONContent,
  definition: RegisteredSurfaceVariantDefinition,
  surfacePath: readonly (string | number)[],
): CourseStructureIssue | null {
  const expected = definition.structurePolicy?.fixedChildren;
  if (expected === undefined) return null;
  const match = matchFixedSurfaceChildren(snapshotSurfaceStructureChildrenFromJSON(surface), expected);
  if (match.exact) return null;
  return issue(
    fixedMismatchCode(match.mismatch),
    fixedMismatchMessage(match.mismatch, expected),
    fixedMismatchPath(surface, surfacePath, match.mismatch),
  );
}

function fixedMismatchCode(
  mismatch: FixedSurfaceChildrenMismatch,
): Extract<CourseStructureIssueCode, `fixed_surface_${string}`> {
  if (mismatch.kind === "count") return "fixed_surface_child_count_mismatch";
  if (mismatch.kind === "type") return "fixed_surface_child_type_mismatch";
  return "fixed_surface_child_attribute_mismatch";
}

function fixedMismatchMessage(
  mismatch: FixedSurfaceChildrenMismatch,
  expected: readonly { type: string }[],
): string {
  if (mismatch.kind === "count") {
    return `fixed surface signature requires ${mismatch.expectedCount} children; received ${mismatch.actualCount}`;
  }
  if (mismatch.kind === "type") {
    return `fixed surface child ${mismatch.index} must be ${formatJsonValue(mismatch.expectedType)}; received ${formatJsonValue(mismatch.actualType)}`;
  }
  return `fixed surface child ${mismatch.index} ${formatJsonValue(expected[mismatch.index]?.type ?? "surface")} must have attribute ${formatJsonValue(mismatch.attribute)} equal to ${formatJsonValue(mismatch.expectedValue)}; received ${formatJsonValue(mismatch.actualValue)}`;
}

function fixedMismatchPath(
  surface: JSONContent,
  surfacePath: readonly (string | number)[],
  mismatch: FixedSurfaceChildrenMismatch,
): readonly (string | number)[] {
  const content = getJsonContent(surface);
  const boundaryOffset = content[0]?.type === "surface_header" ? 1 : 0;
  const childPath = [...surfacePath, "content", boundaryOffset + mismatch.index];
  if (mismatch.kind === "count") return childPath;
  if (mismatch.kind === "type") return [...childPath, "type"];
  return [...childPath, "attrs", mismatch.attribute];
}
