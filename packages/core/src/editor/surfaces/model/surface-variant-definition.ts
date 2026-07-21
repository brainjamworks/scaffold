import type { JSONContent } from "@tiptap/core";
import type { ZodTypeAny } from "zod";

import {
  SurfaceSettingsSchema,
  type CourseMode,
  type VerticalContentPosition,
} from "@/schemas/course-document";

import {
  matchFixedSurfaceChildren,
  snapshotSurfaceStructureChildrenFromJSON,
} from "./policies/surface-fixed-structure";

export interface CreateSurfaceInput {
  surfaceId: string;
}

export type SurfaceCatalogueSection = "title" | "content" | "image";

export type SurfaceTemplatePreviewNode =
  | {
      kind: "slot";
      role: "title" | "content" | "image" | "panel" | "label";
      emphasis?: "quiet" | "normal" | "strong";
    }
  | {
      kind: "row" | "column";
      children: readonly SurfaceTemplatePreviewNode[];
      proportions?: readonly number[];
      gap?: "none" | "small" | "medium";
    }
  | {
      kind: "overlay";
      base: SurfaceTemplatePreviewNode;
      overlay: SurfaceTemplatePreviewNode;
      placement: "start" | "centre" | "end" | "full";
    };

export interface SurfaceCatalogueEntry {
  section: SurfaceCatalogueSection;
  order: number;
  preview: SurfaceTemplatePreviewNode;
}

export type SurfaceStructureAttributeValue = string | number | boolean;

export interface FixedSurfaceChild {
  type: string;
  attrs?: Readonly<Record<string, SurfaceStructureAttributeValue>>;
}

export interface SurfaceStructurePolicy {
  /** Exact ordered direct-child signature, excluding optional header/footer boundaries. */
  fixedChildren?: readonly FixedSurfaceChild[];
  /** Whether authoring may insert arbitrary blocks at the surface root. */
  allowRootInsertion?: boolean;
}

export interface SurfaceAlignmentDefinition {
  verticalContentPosition?: {
    behavior: "finite-direct-stack";
    default: VerticalContentPosition;
  };
}

export interface SurfaceVariantDefinition {
  id: string;
  modes: readonly CourseMode[];
  defaultForModes?: readonly CourseMode[];
  title: string;
  description: string;
  catalogue?: SurfaceCatalogueEntry;
  alignment?: SurfaceAlignmentDefinition;
  settingsSchema?: ZodTypeAny;
  structurePolicy?: SurfaceStructurePolicy;
  createSurface: (input: CreateSurfaceInput) => JSONContent;
}

export interface RegisteredSurfaceVariantDefinition extends SurfaceVariantDefinition {
  nodeType: "surface";
  settingsSchema: ZodTypeAny;
}

export interface RegisteredSurfaceVariantCatalogueDefinition extends RegisteredSurfaceVariantDefinition {
  catalogue: SurfaceCatalogueEntry;
}

export interface CreateDefaultSurfaceForModeInput extends CreateSurfaceInput {
  mode: CourseMode;
}

const surfaceCatalogueSectionOrder: Readonly<Record<SurfaceCatalogueSection, number>> = {
  title: 0,
  content: 1,
  image: 2,
};

export function compareSurfaceCatalogueDefinitions(
  left: RegisteredSurfaceVariantCatalogueDefinition,
  right: RegisteredSurfaceVariantCatalogueDefinition,
): number {
  const sectionDifference =
    surfaceCatalogueSectionOrder[left.catalogue.section] -
    surfaceCatalogueSectionOrder[right.catalogue.section];
  return sectionDifference || left.catalogue.order - right.catalogue.order;
}

export function normalizeSurfaceDefinition(
  definition: SurfaceVariantDefinition,
): RegisteredSurfaceVariantDefinition {
  validateSurfaceCatalogue(definition);

  for (const mode of definition.defaultForModes ?? []) {
    assertSurfaceSupportsDefaultMode(definition, mode);
  }

  validateSurfaceFixedChildren(definition);
  return createRegisteredSurfaceDefinition(definition);
}

function validateSurfaceCatalogue(definition: SurfaceVariantDefinition): string | undefined {
  const catalogue = definition.catalogue;
  if (catalogue === undefined) return undefined;

  if (!isRecord(catalogue) || !isSurfaceTemplatePreviewNode(catalogue["preview"])) {
    throw new Error(`Surface definition "${definition.id}" has an invalid catalogue preview.`);
  }
  if (!isSurfaceCatalogueEntry(catalogue)) {
    throw new Error(`Surface definition "${definition.id}" has invalid catalogue metadata.`);
  }

  return `${catalogue.section}:${catalogue.order}`;
}

function assertSurfaceSupportsDefaultMode(
  definition: SurfaceVariantDefinition,
  mode: CourseMode,
): void {
  if (!definition.modes.includes(mode)) {
    throw new Error(
      `Surface "${definition.id}" cannot be default for unsupported course mode "${mode}".`,
    );
  }
}

function validateSurfaceFixedChildren(definition: SurfaceVariantDefinition): void {
  const fixedChildren = definition.structurePolicy?.fixedChildren;
  if (fixedChildren === undefined) return;

  const surface = definition.createSurface({ surfaceId: "surface-definition-validation" });
  const match = matchFixedSurfaceChildren(
    snapshotSurfaceStructureChildrenFromJSON(surface),
    fixedChildren,
  );

  if (!match.exact) {
    throw new Error(
      `Surface definition "${definition.id}" createSurface result does not match its declared fixedChildren signature.`,
    );
  }
}

function createRegisteredSurfaceDefinition(
  definition: SurfaceVariantDefinition,
): RegisteredSurfaceVariantDefinition {
  return {
    ...definition,
    nodeType: "surface",
    settingsSchema: definition.settingsSchema ?? SurfaceSettingsSchema.strict(),
  };
}

function isSurfaceCatalogueEntry(value: unknown): value is SurfaceCatalogueEntry {
  if (!isRecord(value) || !hasOnlyKeys(value, ["section", "order", "preview"])) return false;

  return (
    isSurfaceCatalogueSection(value["section"]) &&
    typeof value["order"] === "number" &&
    Number.isInteger(value["order"]) &&
    value["order"] > 0 &&
    isSurfaceTemplatePreviewNode(value["preview"])
  );
}

function isSurfaceTemplatePreviewNode(value: unknown): value is SurfaceTemplatePreviewNode {
  if (!isRecord(value)) return false;

  if (value["kind"] === "slot") {
    const emphasis = value["emphasis"];
    return (
      hasOnlyKeys(value, ["kind", "role", "emphasis"]) &&
      isOneOf(value["role"], ["title", "content", "image", "panel", "label"]) &&
      (emphasis === undefined || isOneOf(emphasis, ["quiet", "normal", "strong"]))
    );
  }

  if (value["kind"] === "row" || value["kind"] === "column") {
    const children = value["children"];
    const proportions = value["proportions"];
    const gap = value["gap"];
    return (
      hasOnlyKeys(value, ["kind", "children", "proportions", "gap"]) &&
      Array.isArray(children) &&
      children.length > 0 &&
      children.every(isSurfaceTemplatePreviewNode) &&
      (proportions === undefined ||
        (Array.isArray(proportions) &&
          proportions.length === children.length &&
          proportions.every(
            (proportion: unknown) =>
              typeof proportion === "number" && Number.isFinite(proportion) && proportion > 0,
          ))) &&
      (gap === undefined || isOneOf(gap, ["none", "small", "medium"]))
    );
  }

  if (value["kind"] === "overlay") {
    return (
      hasOnlyKeys(value, ["kind", "base", "overlay", "placement"]) &&
      isSurfaceTemplatePreviewNode(value["base"]) &&
      isSurfaceTemplatePreviewNode(value["overlay"]) &&
      isOneOf(value["placement"], ["start", "centre", "end", "full"])
    );
  }

  return false;
}

function isSurfaceCatalogueSection(value: unknown): value is SurfaceCatalogueSection {
  return isOneOf(value, ["title", "content", "image"]);
}

function isOneOf<const Value extends string>(
  value: unknown,
  allowedValues: readonly Value[],
): value is Value {
  return typeof value === "string" && allowedValues.some((allowed) => allowed === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}
