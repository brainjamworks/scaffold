import { isEmbeddedId } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";

import { getBlockAttrSchema } from "@/editor/blocks/block-definition";
import type { BlockRegistry } from "@/editor/blocks/block-registry";
import { projectAssessmentTargetContract } from "@/editor/blocks/assessment/shared/publication/assessment-target";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import {
  matchFixedSurfaceChildren,
  snapshotSurfaceStructureChildrenFromJSON,
} from "@/editor/surfaces/model/policies/surface-fixed-structure";
import type { SurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import { assertParsedMountedNodeIdentity } from "@/document/model/establishment/mounted-node-identity";
import { readUnavailableContentCompatibilityRoot } from "@/document/model/establishment/unavailable-content-compatibility-root";
import {
  layerContextDiagnosticPath,
  layerNodePathToJsonPath,
  validateLayerContext,
  type LayerContextDiagnostic,
} from "@/document/model/layers/layer-validation";

import type {
  StructuralFragmentContent,
  StructuralFragmentJsonObject,
  StructuralFragmentRootKind,
  StructuralFragmentV1Envelope,
} from "./structural-fragment-codec";

export interface StructuralFragmentCapabilityRegistries {
  readonly blocks: BlockRegistry;
  readonly layouts: LayoutRegistry;
  readonly surfaces: SurfaceVariantRegistry;
}

export type StructuralFragmentValidationRefusalReason =
  | "malformed_node"
  | "root_kind_mismatch"
  | "unavailable_block"
  | "unavailable_layout"
  | "unavailable_surface"
  | "invalid_block_attrs"
  | "invalid_assessment_contract"
  | "invalid_layout_attrs"
  | "invalid_surface_settings"
  | "invalid_surface_structure"
  | "schema_mismatch"
  | "missing_embedded_node_id"
  | "invalid_embedded_node_id"
  | "duplicate_embedded_node_id"
  | "layer_context_invalid";

export interface ValidatedStructuralFragment {
  readonly rootKind: StructuralFragmentRootKind;
  /** The decoded, semantically unchanged source tree. Frozen after successful validation. */
  readonly source: StructuralFragmentContent;
  /** The same source parsed and checked by the exact destination schema. */
  readonly node: ProseMirrorNode;
}

export type StructuralFragmentValidationResult =
  | { readonly status: "ok"; readonly value: ValidatedStructuralFragment }
  | {
      readonly status: "refused";
      readonly reason: Exclude<StructuralFragmentValidationRefusalReason, "layer_context_invalid">;
      readonly path: readonly (string | number)[];
    }
  | {
      readonly status: "refused";
      readonly reason: "layer_context_invalid";
      readonly path: readonly (string | number)[];
      readonly diagnostic: LayerContextDiagnostic;
    };

export function validateStructuralFragment(input: {
  readonly fragment: StructuralFragmentV1Envelope;
  readonly schema: Schema;
  readonly capabilities: StructuralFragmentCapabilityRegistries;
}): StructuralFragmentValidationResult {
  const { capabilities, fragment, schema } = input;
  const root = asStructuralNode(fragment.content);
  if (!root) return refused("malformed_node", []);

  const unavailableRoot = compatibilityReason(root.type);
  if (unavailableRoot) return refused(unavailableRoot, []);

  const rootFailure = validateRootAgreement(fragment.rootKind, root, schema, capabilities);
  if (rootFailure) return rootFailure;

  const stack: PendingNode[] = [{ node: root, path: [] }];
  const currentIds = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;

    const failure = validateMountedNode(current.node, current.path, schema, capabilities);
    if (failure) return failure;

    const identityFailure = validateCurrentNodeIdentity(current.node, current.path, currentIds);
    if (identityFailure) return identityFailure;

    const content = current.node["content"];
    if (content === undefined) continue;
    if (!Array.isArray(content)) return refused("malformed_node", [...current.path, "content"]);

    for (let index = content.length - 1; index >= 0; index -= 1) {
      const child = asStructuralNode(content[index]);
      const path = [...current.path, "content", index];
      if (!child) return refused("malformed_node", path);
      stack.push({ node: child, path });
    }
  }

  let node: ProseMirrorNode;
  try {
    node = schema.nodeFromJSON(fragment.content as JSONContent);
    node.check();
  } catch {
    return refused("schema_mismatch", []);
  }

  const identityIssue = assertParsedMountedNodeIdentity(node)[0];
  if (identityIssue) {
    switch (identityIssue.code) {
      case "missing_embedded_node_id":
      case "invalid_embedded_node_id":
      case "duplicate_embedded_node_id":
        return refused(identityIssue.code, identityIssue.path);
      default:
        return refused("schema_mismatch", identityIssue.path);
    }
  }

  const layerDiagnostic = validateLayerContext({
    document: node,
    blockDefinitions: capabilities.blocks,
    layoutDefinitions: capabilities.layouts,
  })[0];
  if (layerDiagnostic) return refusedLayerContext(layerDiagnostic);

  freezeJsonTree(fragment.content);
  return {
    status: "ok",
    value: Object.freeze({
      rootKind: fragment.rootKind,
      source: fragment.content,
      node,
    }),
  };
}

function validateCurrentNodeIdentity(
  node: StructuralFragmentContent,
  path: readonly (string | number)[],
  currentIds: Set<string>,
): StructuralFragmentValidationResult | null {
  if (node.type === "doc" || node.type === "text") return null;

  const attrs = readAttrs(node);
  const id = attrs?.["id"];
  const idPath = [...path, "attrs", "id"];
  if (id === null || id === undefined) {
    return refused("missing_embedded_node_id", idPath);
  }
  if (!isEmbeddedId(id)) return refused("invalid_embedded_node_id", idPath);
  if (currentIds.has(id)) return refused("duplicate_embedded_node_id", idPath);
  currentIds.add(id);
  return null;
}

interface PendingNode {
  readonly node: StructuralFragmentContent;
  readonly path: readonly (string | number)[];
}

function validateRootAgreement(
  rootKind: StructuralFragmentRootKind,
  root: StructuralFragmentContent,
  schema: Schema,
  capabilities: StructuralFragmentCapabilityRegistries,
): StructuralFragmentValidationResult | null {
  if (rootKind === "layout") {
    return root.type === "layout" ? null : refused("root_kind_mismatch", []);
  }
  if (rootKind === "surface") {
    return root.type === "surface" ? null : refused("root_kind_mismatch", []);
  }

  if (root.type === "layout" || root.type === "surface") {
    return refused("root_kind_mismatch", []);
  }
  if (capabilities.blocks.getByNodeType(root.type)) return null;
  return schema.nodes[root.type]
    ? refused("root_kind_mismatch", [])
    : refused("unavailable_block", []);
}

function validateMountedNode(
  node: StructuralFragmentContent,
  path: readonly (string | number)[],
  schema: Schema,
  capabilities: StructuralFragmentCapabilityRegistries,
): StructuralFragmentValidationResult | null {
  const compatibilityFailure = compatibilityReason(node.type);
  if (compatibilityFailure) return refused(compatibilityFailure, path);

  const attrs = readAttrs(node);
  if (attrs === null) return refused("malformed_node", [...path, "attrs"]);

  const block = capabilities.blocks.getByNodeType(node.type);
  if (block) {
    if (!schema.nodes[node.type]) return refused("schema_mismatch", path);
    for (const attr of ["data", "settings", "options"] as const) {
      const attrSchema = getBlockAttrSchema(block, attr);
      if (attrSchema && !attrSchema.safeParse(attrs?.[attr]).success) {
        return refused("invalid_block_attrs", [...path, "attrs", attr]);
      }
    }
    const blockId = attrs?.["id"];
    if (block.capabilities?.assessment && isEmbeddedId(blockId)) {
      try {
        projectAssessmentTargetContract({
          blockId,
          definition: block,
          node: node as JSONContent,
        });
      } catch {
        return refused("invalid_assessment_contract", path);
      }
    }
    return null;
  }

  if (node.type === "layout") {
    if (!schema.nodes.layout) return refused("schema_mismatch", path);
    const variant = attrs?.["variant"];
    if (typeof variant !== "string" || variant.length === 0) {
      return refused("invalid_layout_attrs", [...path, "attrs", "variant"]);
    }
    const definition = capabilities.layouts.getById(variant);
    if (!definition) return refused("unavailable_layout", path);

    const configuration = definition.configuration;
    if (configuration && !configuration.schema.safeParse(attrs?.[configuration.attr]).success) {
      return refused("invalid_layout_attrs", [...path, "attrs", configuration.attr]);
    }

    const sectionConfiguration = definition.section?.configuration;
    const content = node["content"];
    if (sectionConfiguration && Array.isArray(content)) {
      for (let index = 0; index < content.length; index += 1) {
        const section = asStructuralNode(content[index]);
        if (!section || section.type !== "section") continue;
        const sectionAttrs = readAttrs(section);
        if (
          sectionAttrs === null ||
          !sectionConfiguration.schema.safeParse(sectionAttrs?.[sectionConfiguration.attr]).success
        ) {
          return refused("invalid_layout_attrs", [
            ...path,
            "content",
            index,
            "attrs",
            sectionConfiguration.attr,
          ]);
        }
      }
    }
    return null;
  }

  if (node.type === "surface") {
    if (!schema.nodes.surface) return refused("schema_mismatch", path);
    const variant = attrs?.["variant"];
    if (typeof variant !== "string" || variant.length === 0) {
      return refused("invalid_surface_settings", [...path, "attrs", "variant"]);
    }
    const definition = capabilities.surfaces.get(variant);
    if (!definition) return refused("unavailable_surface", path);
    if (!definition.settingsSchema.safeParse(attrs?.["settings"] ?? {}).success) {
      return refused("invalid_surface_settings", [...path, "attrs", "settings"]);
    }

    const fixedChildren = definition.structurePolicy?.fixedChildren;
    if (
      fixedChildren &&
      !matchFixedSurfaceChildren(
        snapshotSurfaceStructureChildrenFromJSON(node as JSONContent),
        fixedChildren,
      ).exact
    ) {
      return refused("invalid_surface_structure", [...path, "content"]);
    }
    return null;
  }

  return schema.nodes[node.type] ? null : refused("schema_mismatch", path);
}

function compatibilityReason(
  type: string,
): "unavailable_block" | "unavailable_layout" | "unavailable_surface" | null {
  const root = readUnavailableContentCompatibilityRoot(type, {});
  switch (root?.kind) {
    case "block":
      return "unavailable_block";
    case "layout":
      return "unavailable_layout";
    case "surface":
      return "unavailable_surface";
    case undefined:
      return null;
  }
}

function asStructuralNode(value: unknown): StructuralFragmentContent | null {
  return isJsonObject(value) && typeof value["type"] === "string" && value["type"].length > 0
    ? (value as StructuralFragmentContent)
    : null;
}

function readAttrs(
  node: StructuralFragmentContent,
): StructuralFragmentJsonObject | undefined | null {
  const attrs = node["attrs"];
  if (attrs === undefined) return undefined;
  return isJsonObject(attrs) ? attrs : null;
}

function isJsonObject(value: unknown): value is StructuralFragmentJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refused(
  reason: Exclude<StructuralFragmentValidationRefusalReason, "layer_context_invalid">,
  path: readonly (string | number)[],
): StructuralFragmentValidationResult {
  return { status: "refused", reason, path };
}

function refusedLayerContext(
  diagnostic: LayerContextDiagnostic,
): StructuralFragmentValidationResult {
  return {
    status: "refused",
    reason: "layer_context_invalid",
    path: layerNodePathToJsonPath(layerContextDiagnosticPath(diagnostic)),
    diagnostic,
  };
}

function freezeJsonTree(root: StructuralFragmentContent): void {
  const stack: object[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (!value) continue;
    for (const child of Object.values(value)) {
      if (child !== null && typeof child === "object") stack.push(child);
    }
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
}
