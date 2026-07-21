import type { JSONContent } from "@tiptap/core";

import type { RegisteredSurfaceVariantDefinition } from "@/editor/surfaces/model/surface-variant-definition";
import {
  matchFixedSurfaceChildren,
  snapshotSurfaceStructureChildrenFromJSON,
  type FixedSurfaceChildrenMismatch,
} from "@/editor/surfaces/model/policies/surface-fixed-structure";
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";
import { CourseDocumentAttrsSchema, SurfaceAttrsSchema } from "@/schemas/course-document";

export type SurfaceInstanceId = string;
export type SurfaceVariantId = string;

export type CourseDocumentIssueCode =
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
  | "incomplete_quiz";

export interface CourseDocumentIssue {
  readonly code: CourseDocumentIssueCode;
  readonly message: string;
  readonly path: readonly (string | number)[];
}

export interface ValidatedSurfaceRef {
  readonly instanceId: SurfaceInstanceId;
  readonly variantId: SurfaceVariantId;
  readonly definition: RegisteredSurfaceVariantDefinition;
}

export type ValidatedCourseSurfaceProjection =
  | {
      readonly mode: "page";
      readonly surfaces: readonly [ValidatedSurfaceRef];
    }
  | {
      readonly mode: "slideshow";
      readonly surfaces: readonly [ValidatedSurfaceRef, ...ValidatedSurfaceRef[]];
    };

export type CourseSurfaceValidationResult =
  | { readonly ok: true; readonly value: ValidatedCourseSurfaceProjection }
  | { readonly ok: false; readonly issues: readonly CourseDocumentIssue[] };

export function validateCourseSurfaceLifecycle({
  content,
  registry,
}: {
  content: JSONContent;
  registry: SurfaceVariantLookup;
}): CourseSurfaceValidationResult {
  const issues: CourseDocumentIssue[] = [];

  if (content.type !== "doc") {
    return invalidResult([
      createIssue("invalid_top_node", "course document JSON must start with doc", ["type"]),
    ]);
  }

  const topChildren = getContent(content);
  const courseDocuments = topChildren
    .map((child, index) => ({ child, index }))
    .filter(({ child }) => child.type === "courseDocument");

  if (courseDocuments.length === 0) {
    return invalidResult([
      createIssue("missing_course_document", "doc must contain one courseDocument", ["content"]),
    ]);
  }
  if (courseDocuments.length > 1) {
    issues.push(
      createIssue("multiple_course_documents", "doc must contain exactly one courseDocument", [
        "content",
      ]),
    );
  }
  for (const [index, child] of topChildren.entries()) {
    if (child.type !== "courseDocument") {
      issues.push(
        createIssue("invalid_course_document_child", "doc can only contain courseDocument", [
          "content",
          index,
        ]),
      );
    }
  }

  const { child: courseDocument, index: courseDocumentIndex } = courseDocuments[0]!;
  const attrsResult = CourseDocumentAttrsSchema.safeParse(courseDocument.attrs);
  if (!attrsResult.success) {
    for (const schemaIssue of attrsResult.error.issues) {
      issues.push(
        createIssue(
          "invalid_course_document_attrs",
          "courseDocument attrs must match CourseDocumentAttrsSchema",
          ["content", courseDocumentIndex, "attrs", ...schemaIssue.path],
        ),
      );
    }
  } else {
    const difference = firstDifferencePath(attrsResult.data, courseDocument.attrs);
    if (difference) {
      issues.push(
        createIssue(
          "invalid_course_document_attrs",
          "courseDocument attrs must match CourseDocumentAttrsSchema exactly",
          ["content", courseDocumentIndex, "attrs", ...difference],
        ),
      );
    }
  }

  const surfaceChildren = getContent(courseDocument);
  const surfaces = surfaceChildren
    .map((child, index) => ({ child, index }))
    .filter(({ child }) => child.type === "surface");
  for (const [index, child] of surfaceChildren.entries()) {
    if (child.type !== "surface") {
      issues.push(
        createIssue("invalid_course_document_child", "courseDocument can only contain surface", [
          "content",
          courseDocumentIndex,
          "content",
          index,
        ]),
      );
    }
  }

  const mode = attrsResult.success ? attrsResult.data.mode : undefined;
  if (mode === "branching") {
    issues.push(
      createIssue("unsupported_surface_mode", "branching surface mode is not supported", [
        "content",
        courseDocumentIndex,
        "attrs",
        "mode",
      ]),
    );
  } else if (
    mode !== undefined &&
    ((mode === "page" && surfaces.length !== 1) || (mode === "slideshow" && surfaces.length < 1))
  ) {
    issues.push(
      createIssue(
        "invalid_surface_cardinality",
        mode === "page"
          ? "page mode requires exactly one surface"
          : "slideshow mode requires at least one surface",
        ["content", courseDocumentIndex, "content"],
      ),
    );
  }

  const seenIds = new Set<string>();
  const validatedSurfaces: ValidatedSurfaceRef[] = [];
  for (const { child: surface, index } of surfaces) {
    const surfacePath = ["content", courseDocumentIndex, "content", index] as const;
    const attrs = surface.attrs;
    if (!isRecord(attrs)) {
      issues.push(
        createIssue("invalid_surface_attrs", "surface attrs must be an object", [
          ...surfacePath,
          "attrs",
        ]),
      );
      continue;
    }

    const { settings: _settings, ...attrsWithoutSettings } = attrs;
    const attrsResult = SurfaceAttrsSchema.omit({ settings: true }).safeParse(attrsWithoutSettings);
    if (!attrsResult.success) {
      for (const schemaIssue of attrsResult.error.issues) {
        issues.push(
          createIssue("invalid_surface_attrs", "surface attrs must match SurfaceAttrsSchema", [
            ...surfacePath,
            "attrs",
            ...schemaIssue.path,
          ]),
        );
      }
      continue;
    }

    const attrsDifference = firstDifferencePath(attrsResult.data, attrsWithoutSettings);
    if (attrsDifference) {
      issues.push(
        createIssue(
          "invalid_surface_attrs",
          "surface attrs must match SurfaceAttrsSchema exactly",
          [...surfacePath, "attrs", ...attrsDifference],
        ),
      );
    }

    const instanceId = attrsResult.data.id;
    const variantId = attrsResult.data.variant;
    if (seenIds.has(instanceId)) {
      issues.push(
        createIssue("duplicate_surface_id", `surface instance id "${instanceId}" must be unique`, [
          ...surfacePath,
          "attrs",
          "id",
        ]),
      );
    } else {
      seenIds.add(instanceId);
    }

    const definition = registry.get(variantId);
    if (!definition) {
      issues.push(
        createIssue("unknown_surface_variant", `surface variant "${variantId}" is not registered`, [
          ...surfacePath,
          "attrs",
          "variant",
        ]),
      );
      continue;
    }
    if (mode !== undefined && !definition.modes.includes(mode)) {
      issues.push(
        createIssue(
          "surface_variant_mode_mismatch",
          `surface variant "${variantId}" does not support course mode "${mode}"`,
          [...surfacePath, "attrs", "variant"],
        ),
      );
    }

    const persistedSettings = attrs["settings"] ?? {};
    const settingsResult = definition.settingsSchema.safeParse(persistedSettings);
    if (!settingsResult.success) {
      for (const schemaIssue of settingsResult.error.issues) {
        issues.push(
          createIssue(
            "invalid_surface_settings",
            `surface variant "${variantId}" settings must match the current schema exactly`,
            [...surfacePath, "attrs", "settings", ...schemaIssue.path],
          ),
        );
      }
    } else {
      const settingsDifference = firstDifferencePath(settingsResult.data, persistedSettings);
      if (settingsDifference) {
        issues.push(
          createIssue(
            "invalid_surface_settings",
            `surface variant "${variantId}" settings must match the current schema exactly`,
            [...surfacePath, "attrs", "settings", ...settingsDifference],
          ),
        );
      }
    }

    collectHeaderFooterIssues(surface, surfacePath, issues);
    const fixedIssue = fixedSurfaceStructureIssue(surface, definition, surfacePath);
    if (fixedIssue) issues.push(fixedIssue);

    validatedSurfaces.push(
      Object.freeze({
        instanceId,
        variantId,
        definition,
      }),
    );
  }

  if (issues.length > 0 || mode === undefined || mode === "branching") {
    return invalidResult(issues);
  }

  if (mode === "page") {
    const pageSurface = validatedSurfaces[0]!;
    const pageSurfaces: readonly [ValidatedSurfaceRef] = Object.freeze([pageSurface]);
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        mode,
        surfaces: pageSurfaces,
      }),
    });
  }
  const firstSurface = validatedSurfaces[0]!;
  const remainingSurfaces = validatedSurfaces.slice(1);
  const slideshowSurfaces: readonly [ValidatedSurfaceRef, ...ValidatedSurfaceRef[]] = Object.freeze(
    [firstSurface, ...remainingSurfaces],
  );
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      mode,
      surfaces: slideshowSurfaces,
    }),
  });
}

function collectHeaderFooterIssues(
  surface: JSONContent,
  surfacePath: readonly (string | number)[],
  issues: CourseDocumentIssue[],
): void {
  for (const nodeType of ["surface_header", "surface_footer"] as const) {
    const boundaries = getContent(surface)
      .map((child, index) => ({ child, index }))
      .filter(({ child }) => child.type === nodeType);
    for (const duplicate of boundaries.slice(1)) {
      issues.push(
        createIssue("duplicate_header_footer", `surface can contain at most one ${nodeType}`, [
          ...surfacePath,
          "content",
          duplicate.index,
        ]),
      );
    }
    for (const { child, index } of boundaries) {
      if (!hasValidHeaderFooterSlots(child)) {
        issues.push(
          createIssue(
            "invalid_header_footer_slots",
            `${nodeType} must contain ordered left, center, and right slots`,
            [...surfacePath, "content", index],
          ),
        );
      }
    }
  }
}

function hasValidHeaderFooterSlots(boundary: JSONContent): boolean {
  const positions = ["left", "center", "right"] as const;
  const slots = getContent(boundary);
  return (
    slots.length === positions.length &&
    slots.every(
      (slot, index) =>
        slot.type === "surface_header_footer_slot" && slot.attrs?.["position"] === positions[index],
    )
  );
}

function fixedSurfaceStructureIssue(
  surface: JSONContent,
  definition: RegisteredSurfaceVariantDefinition,
  surfacePath: readonly (string | number)[],
): CourseDocumentIssue | null {
  const fixedChildren = definition.structurePolicy?.fixedChildren;
  if (fixedChildren === undefined) return null;
  const match = matchFixedSurfaceChildren(
    snapshotSurfaceStructureChildrenFromJSON(surface),
    fixedChildren,
  );
  if (match.exact) return null;

  return createIssue(
    fixedMismatchCode(match.mismatch),
    fixedMismatchMessage(match.mismatch, fixedChildren),
    fixedMismatchPath(surface, surfacePath, match.mismatch),
  );
}

function fixedMismatchCode(
  mismatch: FixedSurfaceChildrenMismatch,
): Extract<CourseDocumentIssueCode, `fixed_surface_${string}`> {
  if (mismatch.kind === "count") return "fixed_surface_child_count_mismatch";
  if (mismatch.kind === "type") return "fixed_surface_child_type_mismatch";
  return "fixed_surface_child_attribute_mismatch";
}

function fixedMismatchMessage(
  mismatch: FixedSurfaceChildrenMismatch,
  expectedChildren: readonly { type: string }[],
): string {
  if (mismatch.kind === "count") {
    return `fixed surface signature requires ${mismatch.expectedCount} children; received ${mismatch.actualCount}`;
  }
  if (mismatch.kind === "type") {
    return `fixed surface child ${mismatch.index} must be ${formatValue(mismatch.expectedType)}; received ${formatValue(mismatch.actualType)}`;
  }
  return `fixed surface child ${mismatch.index} ${formatValue(expectedChildren[mismatch.index]?.type ?? "surface")} must have attribute ${formatValue(mismatch.attribute)} equal to ${formatValue(mismatch.expectedValue)}; received ${formatValue(mismatch.actualValue)}`;
}

function fixedMismatchPath(
  surface: JSONContent,
  surfacePath: readonly (string | number)[],
  mismatch: FixedSurfaceChildrenMismatch,
): readonly (string | number)[] {
  const content = getContent(surface);
  const boundaryOffset = content[0]?.type === "surface_header" ? 1 : 0;
  const childPath = [...surfacePath, "content", boundaryOffset + mismatch.index];
  if (mismatch.kind === "count") return childPath;
  if (mismatch.kind === "type") return [...childPath, "type"];
  return [...childPath, "attrs", mismatch.attribute];
}

function invalidResult(issues: readonly CourseDocumentIssue[]): CourseSurfaceValidationResult {
  return Object.freeze({ ok: false, issues: Object.freeze([...issues]) });
}

export function createCourseDocumentIssue(
  code: CourseDocumentIssueCode,
  message: string,
  path: readonly (string | number)[],
): CourseDocumentIssue {
  return createIssue(code, message, path);
}

function createIssue(
  code: CourseDocumentIssueCode,
  message: string,
  path: readonly (string | number)[],
): CourseDocumentIssue {
  return Object.freeze({ code, message, path: Object.freeze([...path]) });
}

function getContent(node: JSONContent | undefined): JSONContent[] {
  return Array.isArray(node?.content) ? node.content : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstDifferencePath(
  parsed: unknown,
  persisted: unknown,
): readonly (string | number)[] | null {
  if (Object.is(parsed, persisted)) return null;
  if (Array.isArray(parsed) || Array.isArray(persisted)) {
    if (!Array.isArray(parsed) || !Array.isArray(persisted)) return [];
    const length = Math.max(parsed.length, persisted.length);
    for (let index = 0; index < length; index += 1) {
      if (index >= parsed.length || index >= persisted.length) return [index];
      const nested = firstDifferencePath(parsed[index], persisted[index]);
      if (nested) return [index, ...nested];
    }
    return null;
  }
  if (!isRecord(parsed) || !isRecord(persisted)) return [];

  const keys = [...new Set([...Object.keys(parsed), ...Object.keys(persisted)])].sort();
  for (const key of keys) {
    if (
      !Object.prototype.hasOwnProperty.call(parsed, key) ||
      !Object.prototype.hasOwnProperty.call(persisted, key)
    ) {
      return [key];
    }
    const nested = firstDifferencePath(parsed[key], persisted[key]);
    if (nested) return [key, ...nested];
  }
  return null;
}

function formatValue(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}
