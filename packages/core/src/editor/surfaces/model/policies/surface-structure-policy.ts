import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  isValidSurfaceHeaderFooterNode,
  SURFACE_HEADER_FOOTER_NODE_TYPES,
} from "@/editor/surfaces/model/nodes/header-footer-slots";

import type {
  FixedSurfaceChild,
  RegisteredSurfaceVariantDefinition,
} from "../surface-variant-definition";
import {
  matchFixedSurfaceChildren,
  snapshotSurfaceStructureChildrenFromProseMirror,
  type FixedSurfaceChildrenMismatch,
} from "./surface-fixed-structure";
import type { SurfaceVariantLookup } from "../surface-variant-registry";

export type SurfaceStructureViolationCode =
  | "duplicate_header_footer"
  | "invalid_header_footer_slots"
  | "fixed_surface_child_count_mismatch"
  | "fixed_surface_child_type_mismatch"
  | "fixed_surface_child_attribute_mismatch";

export interface SurfaceStructureViolation {
  code: SurfaceStructureViolationCode;
  nodeType: string;
  message?: string;
  childIndex?: number;
  expectedCount?: number;
  actualCount?: number;
  expectedType?: string;
  actualType?: string;
  attribute?: string;
  expectedValue?: unknown;
  actualValue?: unknown;
  surfaceId?: string;
  surfaceVariant?: string;
}

export type FixedSurfaceStructureViolationCode = Extract<
  SurfaceStructureViolationCode,
  | "fixed_surface_child_count_mismatch"
  | "fixed_surface_child_type_mismatch"
  | "fixed_surface_child_attribute_mismatch"
>;

export interface FixedSurfaceStructureViolation extends Omit<
  SurfaceStructureViolation,
  "code" | "message"
> {
  code: FixedSurfaceStructureViolationCode;
  message: string;
}

export interface SurfaceStructureValidationResult {
  ok: boolean;
  violations: SurfaceStructureViolation[];
}

export function validateCourseSurfaceStructure(
  surface: ProseMirrorNode,
  surfaceVariants: SurfaceVariantLookup,
): SurfaceStructureValidationResult {
  if (surface.type.name !== "surface") {
    return { ok: true, violations: [] };
  }

  const variant = getSurfaceVariant(surface);
  const definition = variant ? surfaceVariants.get(variant) : undefined;
  const violations = [
    ...validateHeaderFooterInvariants(surface),
    ...validateSurfaceDefinitionPolicy(surface, definition),
  ];

  return { ok: violations.length === 0, violations };
}

export function validateCourseSurfacesStructure(
  doc: ProseMirrorNode,
  surfaceVariants: SurfaceVariantLookup,
): SurfaceStructureValidationResult {
  const violations: SurfaceStructureViolation[] = [];

  doc.descendants((node) => {
    if (node.type.name !== "surface") return true;
    violations.push(...validateCourseSurfaceStructure(node, surfaceVariants).violations);
    return false;
  });

  return { ok: violations.length === 0, violations };
}

function validateHeaderFooterInvariants(surface: ProseMirrorNode): SurfaceStructureViolation[] {
  const violations: SurfaceStructureViolation[] = [];
  const surfaceContext = surfaceViolationContext(surface);

  for (const nodeType of SURFACE_HEADER_FOOTER_NODE_TYPES) {
    const children = directChildrenOfType(surface, nodeType);
    if (children.length > 1) {
      violations.push({
        ...surfaceContext,
        code: "duplicate_header_footer",
        nodeType,
      });
    }

    for (const child of children) {
      if (!isValidSurfaceHeaderFooterNode(child)) {
        violations.push({
          ...surfaceContext,
          code: "invalid_header_footer_slots",
          nodeType,
        });
      }
    }
  }

  return violations;
}

function validateSurfaceDefinitionPolicy(
  surface: ProseMirrorNode,
  definition: RegisteredSurfaceVariantDefinition | undefined,
): SurfaceStructureViolation[] {
  const policy = definition?.structurePolicy;
  if (policy?.fixedChildren === undefined) return [];

  const surfaceContext = surfaceViolationContext(surface);
  const match = matchFixedSurfaceChildren(
    snapshotSurfaceStructureChildrenFromProseMirror(surface),
    policy.fixedChildren,
  );
  if (match.exact) return [];

  return [
    {
      ...createFixedSurfaceStructureViolation(match.mismatch, policy.fixedChildren),
      ...surfaceContext,
    },
  ];
}

export function createFixedSurfaceStructureViolation(
  mismatch: FixedSurfaceChildrenMismatch,
  expectedChildren: readonly FixedSurfaceChild[],
): FixedSurfaceStructureViolation {
  if (mismatch.kind === "count") {
    return {
      code: "fixed_surface_child_count_mismatch",
      nodeType: "surface",
      expectedCount: mismatch.expectedCount,
      actualCount: mismatch.actualCount,
      message: `fixed surface signature requires ${mismatch.expectedCount} children; received ${mismatch.actualCount}`,
    };
  }

  if (mismatch.kind === "type") {
    return {
      code: "fixed_surface_child_type_mismatch",
      nodeType: mismatch.actualType,
      childIndex: mismatch.index,
      expectedType: mismatch.expectedType,
      actualType: mismatch.actualType,
      message: `fixed surface child ${mismatch.index} must be ${formatValue(mismatch.expectedType)}; received ${formatValue(mismatch.actualType)}`,
    };
  }

  return {
    code: "fixed_surface_child_attribute_mismatch",
    nodeType: expectedChildren[mismatch.index]?.type ?? "surface",
    childIndex: mismatch.index,
    attribute: mismatch.attribute,
    expectedValue: mismatch.expectedValue,
    actualValue: mismatch.actualValue,
    message: `fixed surface child ${mismatch.index} ${formatValue(expectedChildren[mismatch.index]?.type ?? "surface")} must have attribute ${formatValue(mismatch.attribute)} equal to ${formatValue(mismatch.expectedValue)}; received ${formatValue(mismatch.actualValue)}`,
  };
}

function formatValue(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

function directChildrenOfType(parent: ProseMirrorNode, nodeType: string): ProseMirrorNode[] {
  const children: ProseMirrorNode[] = [];
  parent.forEach((child) => {
    if (child.type.name === nodeType) children.push(child);
  });
  return children;
}

function surfaceViolationContext(
  surface: ProseMirrorNode,
): Pick<SurfaceStructureViolation, "surfaceId" | "surfaceVariant"> {
  const surfaceId = surface.attrs["id"];
  const surfaceVariant = getSurfaceVariant(surface);
  return {
    ...(typeof surfaceId === "string" ? { surfaceId } : {}),
    ...(surfaceVariant ? { surfaceVariant } : {}),
  };
}

function getSurfaceVariant(surface: ProseMirrorNode): string | null {
  const variant = surface.attrs["variant"];
  return typeof variant === "string" && variant.length > 0 ? variant : null;
}
