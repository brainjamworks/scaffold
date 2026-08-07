import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { ProjectedCourseStructure } from "../course-structure/course-structure-projection";
import type { SemanticDefinitionLookup, SemanticLayoutDefinition } from "./definition-lookup";
import type { SemanticPresentationDefinition } from "./definition";
import type { SemanticSnapshotBuilder, SemanticSnapshotItemInput } from "./snapshot-builder";

const NODE_TYPES = Object.freeze({
  courseSection: "courseSection",
  surface: "surface",
  layout: "layout",
  layoutSection: "section",
  region: "region",
  grid: "grid",
  cell: "cell",
});

export interface ProjectCoreStructuralItemsInput {
  readonly doc: ProseMirrorNode;
  readonly courseStructure: ProjectedCourseStructure;
  readonly definitions: SemanticDefinitionLookup;
  readonly builder: SemanticSnapshotBuilder;
}

interface TraversalContext {
  readonly parentId: EmbeddedNodeId | null;
  readonly surfaceId: EmbeddedNodeId | null;
  readonly parentNodeType: string | null;
  readonly layoutDefinition: SemanticLayoutDefinition | undefined;
  readonly siblingTypeOrdinal: number;
}

interface ClassifiedNode {
  readonly item: SemanticSnapshotItemInput;
  readonly parentId: EmbeddedNodeId | null;
  readonly surfaceId: EmbeddedNodeId | null;
  readonly layoutDefinition: SemanticLayoutDefinition | undefined;
  readonly closesTraversal: boolean;
}

export function projectCoreStructuralItems({
  doc,
  courseStructure,
  definitions,
  builder,
}: ProjectCoreStructuralItemsInput): void {
  const walkNode = (node: ProseMirrorNode, pos: number, context: TraversalContext): void => {
    const classified = classifyNode(node, context, courseStructure, definitions, builder);
    const parentId = classified?.item.id ?? context.parentId;
    const surfaceId = classified?.surfaceId ?? context.surfaceId;

    if (classified) {
      builder.addItem({
        item: classified.item,
        parentId: classified.parentId,
        location: {
          id: classified.item.id,
          nodeType: node.type.name,
          from: pos,
          to: pos + node.nodeSize,
          selectionTarget:
            node.type.spec.selectable === false ? { kind: "near", pos } : { kind: "node", pos },
          surfaceId,
          activationPath: [],
        },
      });
      if (classified.closesTraversal) return;
    }

    const typeCounts = new Map<string, number>();
    let offset = 0;
    node.forEach((child) => {
      const ordinal = (typeCounts.get(child.type.name) ?? 0) + 1;
      typeCounts.set(child.type.name, ordinal);
      walkNode(child, pos + (node.type.name === "doc" ? 0 : 1) + offset, {
        parentId,
        surfaceId,
        parentNodeType: node.type.name,
        layoutDefinition: classified?.layoutDefinition,
        siblingTypeOrdinal: ordinal,
      });
      offset += child.nodeSize;
    });
  };

  walkNode(doc, 0, {
    parentId: null,
    surfaceId: null,
    parentNodeType: null,
    layoutDefinition: undefined,
    siblingTypeOrdinal: 1,
  });
}

function classifyNode(
  node: ProseMirrorNode,
  context: TraversalContext,
  courseStructure: ProjectedCourseStructure,
  definitions: SemanticDefinitionLookup,
  builder: SemanticSnapshotBuilder,
): ClassifiedNode | null {
  const nodeType = node.type.name;

  if (nodeType === NODE_TYPES.courseSection) {
    const id = requireNodeId(node);
    const section = courseStructure.courseSectionById[id];
    if (!section) throw new Error(`Course Structure does not contain Course Section ${id}.`);
    return classified(item(id, "course-section", nodeType, null, section.title), null, null);
  }

  if (nodeType === NODE_TYPES.surface) {
    const id = requireNodeId(node);
    const projectedSurface = courseStructure.surfaceById[id];
    if (!projectedSurface) throw new Error(`Course Structure does not contain Surface ${id}.`);
    const variant = readNonEmptyString(node.attrs["variant"]);
    const definition = variant ? definitions.surfaces.get(variant) : undefined;
    if (!definition) addMissingDefinitionDiagnostic(builder, id, nodeType);
    return classified(
      item(
        id,
        "surface",
        nodeType,
        definition?.id ?? null,
        definition?.title ?? "Surface",
        definition?.documentSemantics?.presentation,
      ),
      projectedSurface.courseSectionId,
      id,
    );
  }

  if (nodeType === NODE_TYPES.layout) {
    const id = requireNodeId(node);
    const variant = readNonEmptyString(node.attrs["variant"]);
    const definition = variant ? definitions.layouts.get(variant) : undefined;
    if (!definition) addMissingDefinitionDiagnostic(builder, id, nodeType);
    return classified(
      item(
        id,
        "layout",
        nodeType,
        definition?.id ?? null,
        definition?.title ?? "Layout",
        definition?.documentSemantics?.presentation,
      ),
      context.parentId,
      context.surfaceId,
      definition,
    );
  }

  if (nodeType === NODE_TYPES.layoutSection && context.parentNodeType === NODE_TYPES.layout) {
    const id = requireNodeId(node);
    const authoredLabel = readNonEmptyString(node.attrs["label"]);
    const definition = context.layoutDefinition;
    return classified(
      item(
        id,
        "layout-section",
        nodeType,
        definition?.id ?? null,
        authoredLabel ?? definition?.section?.label ?? "Section",
        definition?.section?.documentSemantics?.presentation,
      ),
      context.parentId,
      context.surfaceId,
    );
  }

  if (nodeType === NODE_TYPES.region) {
    const id = requireNodeId(node);
    const role = readNonEmptyString(node.attrs["role"]) ?? "main";
    return classified(
      item(id, "region", nodeType, null, humanize(role)),
      context.parentId,
      context.surfaceId,
    );
  }

  if (nodeType === NODE_TYPES.grid) {
    const id = requireNodeId(node);
    return classified(
      item(id, "grid", nodeType, null, "Grid"),
      context.parentId,
      context.surfaceId,
    );
  }

  if (nodeType === NODE_TYPES.cell && context.parentNodeType === NODE_TYPES.grid) {
    const id = requireNodeId(node);
    return classified(
      item(id, "cell", nodeType, null, `Cell ${context.siblingTypeOrdinal}`),
      context.parentId,
      context.surfaceId,
    );
  }

  const block = definitions.blocks.get(nodeType);
  if (!block) return null;
  const id = requireNodeId(node);
  return classified(
    item(
      id,
      "block",
      nodeType,
      block.nodeType,
      block.title,
      block.isAssessment ? undefined : block.documentSemantics?.presentation,
    ),
    context.parentId,
    context.surfaceId,
    undefined,
    true,
  );
}

function classified(
  itemValue: SemanticSnapshotItemInput,
  parentId: EmbeddedNodeId | null,
  surfaceId: EmbeddedNodeId | null,
  layoutDefinition?: SemanticLayoutDefinition,
  closesTraversal = false,
): ClassifiedNode {
  return { item: itemValue, parentId, surfaceId, layoutDefinition, closesTraversal };
}

function item(
  id: EmbeddedNodeId,
  kind: SemanticSnapshotItemInput["kind"],
  nodeType: string,
  definitionId: string | null,
  label: string,
  presentation?: SemanticPresentationDefinition,
): SemanticSnapshotItemInput {
  return {
    id,
    kind,
    nodeType,
    definitionId,
    label,
    summary: null,
    presentation: {
      actionIds: presentation?.actionIds ?? [],
      disabledReason: presentation?.disabledReason ?? null,
    },
  };
}

function requireNodeId(node: ProseMirrorNode): EmbeddedNodeId {
  const parsed = EmbeddedNodeIdSchema.safeParse(node.attrs["id"]);
  if (!parsed.success)
    throw new Error(`Semantic structural node ${node.type.name} has no valid ID.`);
  return parsed.data;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function humanize(value: string): string {
  const normalized = value.replaceAll(/[-_]+/g, " ").trim();
  return normalized.length === 0
    ? "Region"
    : `${normalized[0]?.toUpperCase()}${normalized.slice(1)}`;
}

function addMissingDefinitionDiagnostic(
  builder: SemanticSnapshotBuilder,
  ownerId: EmbeddedNodeId,
  ownerNodeType: string,
): void {
  builder.addDiagnostic({
    code: "missing-mounted-definition",
    ownerId,
    candidateId: null,
    ownerNodeType,
    candidateNodeType: null,
  });
}
