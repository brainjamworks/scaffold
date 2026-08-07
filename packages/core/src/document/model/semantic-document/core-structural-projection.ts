import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { ProjectedCourseStructure } from "../course-structure/course-structure-projection";
import type { SemanticDefinitionLookup, SemanticLayoutDefinition } from "./definition-lookup";
import type {
  DocumentSemanticsDefinition,
  SemanticActivationRelationship,
  SemanticChildProjector,
  SemanticPresentationDefinition,
} from "./definition";
import {
  evaluateOwnerDescription,
  resolveOwnerPublication,
  type ResolvedPublishedSemanticChild,
  type SemanticOwnerContext,
} from "./owner-publication";
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
  readonly activationPath: readonly SemanticActivationRelationship[];
}

interface ClassifiedNode {
  readonly item: SemanticSnapshotItemInput;
  readonly parentId: EmbeddedNodeId | null;
  readonly surfaceId: EmbeddedNodeId | null;
  readonly layoutDefinition: SemanticLayoutDefinition | undefined;
  readonly documentSemantics: DocumentSemanticsDefinition | undefined;
  readonly closesTraversal: boolean;
}

const projectStandardRichTextChildren: SemanticChildProjector = ({ helpers }) =>
  helpers.projectStandardRichText();
const standardRichTextDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: projectStandardRichTextChildren,
});

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
      if (builder.hasItem(classified.item.id)) return;
      const ownerContext: SemanticOwnerContext | null = classified.documentSemantics
        ? {
            node,
            id: classified.item.id,
            nodeType: node.type.name,
            definitionId: classified.item.definitionId ?? node.type.name,
            absolutePos: pos,
            documentSemantics: classified.documentSemantics,
          }
        : null;
      const description = ownerContext
        ? evaluateOwnerDescription(ownerContext, definitions, builder)
        : null;
      const describedItem = description
        ? {
            ...classified.item,
            label: readNonEmptyString(description.label) ?? classified.item.label,
            summary: readNonEmptyString(description.summary),
          }
        : classified.item;
      builder.addItem({
        item: describedItem,
        parentId: classified.parentId,
        location: {
          id: describedItem.id,
          nodeType: node.type.name,
          from: pos,
          to: pos + node.nodeSize,
          selectionTarget:
            node.type.spec.selectable === false ? { kind: "near", pos } : { kind: "node", pos },
          surfaceId,
          activationPath: context.activationPath,
        },
      });
      if (ownerContext) {
        projectPublishedChildren({
          owner: ownerContext,
          candidates: resolveOwnerPublication(ownerContext, definitions, builder),
          surfaceId,
          inheritedActivationPath: context.activationPath,
          definitions,
          builder,
          courseStructure,
          walkNode,
        });
      }
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
        activationPath: context.activationPath,
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
    activationPath: [],
  });
}

function projectPublishedChildren(input: {
  readonly owner: SemanticOwnerContext;
  readonly candidates: readonly ResolvedPublishedSemanticChild[];
  readonly surfaceId: EmbeddedNodeId | null;
  readonly inheritedActivationPath: readonly SemanticActivationRelationship[];
  readonly definitions: SemanticDefinitionLookup;
  readonly builder: SemanticSnapshotBuilder;
  readonly courseStructure: ProjectedCourseStructure;
  readonly walkNode: (node: ProseMirrorNode, pos: number, context: TraversalContext) => void;
}): void {
  const accepted: Array<{
    readonly id: EmbeddedNodeId;
    readonly from: number;
    readonly to: number;
  }> = [];

  for (const resolved of input.candidates) {
    let containingCandidate: (typeof accepted)[number] | undefined;
    for (let index = accepted.length - 1; index >= 0; index -= 1) {
      const possibleParent = accepted[index]!;
      if (
        possibleParent.from < resolved.relativePos &&
        possibleParent.to >= resolved.relativePos + resolved.node.nodeSize
      ) {
        containingCandidate = possibleParent;
        break;
      }
    }
    const parentId = containingCandidate?.id ?? input.owner.id;
    const activationPath = [...input.inheritedActivationPath, ...resolved.activationPath] as const;
    const context: TraversalContext = {
      parentId,
      surfaceId: input.surfaceId,
      parentNodeType: resolved.parentNodeType,
      layoutDefinition:
        input.owner.nodeType === NODE_TYPES.layout
          ? input.definitions.layouts.get(input.owner.definitionId)
          : undefined,
      siblingTypeOrdinal: 1,
      activationPath,
    };
    const structural = classifyNode(
      resolved.node,
      context,
      input.courseStructure,
      input.definitions,
      input.builder,
    );

    if (structural) {
      input.walkNode(resolved.node, resolved.absolutePos, context);
    } else if (resolved.candidate.semanticRole) {
      if (input.builder.hasItem(resolved.id)) {
        addCandidateDiagnostic(
          input.builder,
          "duplicate-published-candidate",
          input.owner,
          resolved,
        );
        continue;
      }
      const isRichText = resolved.candidate.semanticRole === "rich-text";
      input.builder.addItem({
        item: {
          id: resolved.id,
          kind: resolved.candidate.semanticRole,
          nodeType: resolved.node.type.name,
          definitionId: input.owner.definitionId,
          label: readNonEmptyString(resolved.candidate.label) ?? humanize(resolved.node.type.name),
          summary: readNonEmptyString(resolved.candidate.summary),
          presentation: {
            actionIds: resolved.candidate.presentation?.actionIds ?? [],
            disabledReason: resolved.candidate.presentation?.disabledReason ?? null,
          },
        },
        parentId,
        location: {
          id: resolved.id,
          nodeType: resolved.node.type.name,
          from: resolved.absolutePos,
          to: resolved.absolutePos + resolved.node.nodeSize,
          selectionTarget: semanticSelectionTarget(resolved.node, resolved.absolutePos, isRichText),
          surfaceId: input.surfaceId,
          activationPath,
        },
      });
    } else {
      addCandidateDiagnostic(input.builder, "invalid-published-candidate", input.owner, resolved);
      continue;
    }

    if (input.builder.hasItem(resolved.id)) {
      accepted.push({
        id: resolved.id,
        from: resolved.relativePos,
        to: resolved.relativePos + resolved.node.nodeSize,
      });
    }
  }
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
      undefined,
      definition?.documentSemantics,
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
      definition?.documentSemantics,
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
      undefined,
      withDefaultRichTextPublication(definition?.section?.documentSemantics),
    );
  }

  if (nodeType === NODE_TYPES.region) {
    const id = requireNodeId(node);
    const role = readNonEmptyString(node.attrs["role"]) ?? "main";
    return classified(
      item(id, "region", nodeType, null, humanize(role)),
      context.parentId,
      context.surfaceId,
      undefined,
      standardRichTextDocumentSemantics,
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
  const documentSemantics = block.isAssessment
    ? block.documentSemantics?.describe
      ? Object.freeze({ describe: block.documentSemantics.describe })
      : undefined
    : block.documentSemantics;
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
    documentSemantics,
    true,
  );
}

function classified(
  itemValue: SemanticSnapshotItemInput,
  parentId: EmbeddedNodeId | null,
  surfaceId: EmbeddedNodeId | null,
  layoutDefinition?: SemanticLayoutDefinition,
  documentSemantics?: DocumentSemanticsDefinition,
  closesTraversal = false,
): ClassifiedNode {
  return {
    item: itemValue,
    parentId,
    surfaceId,
    layoutDefinition,
    documentSemantics,
    closesTraversal,
  };
}

function withDefaultRichTextPublication(
  documentSemantics: DocumentSemanticsDefinition | undefined,
): DocumentSemanticsDefinition {
  if (documentSemantics?.projectChildren) return documentSemantics;
  if (!documentSemantics) return standardRichTextDocumentSemantics;
  return Object.freeze({
    ...documentSemantics,
    projectChildren: projectStandardRichTextChildren,
  });
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

function semanticSelectionTarget(
  node: ProseMirrorNode,
  pos: number,
  richText: boolean,
):
  | { readonly kind: "node"; readonly pos: number }
  | { readonly kind: "text"; readonly from: number; readonly to: number }
  | { readonly kind: "near"; readonly pos: number } {
  if (richText && node.isTextblock) return { kind: "text", from: pos + 1, to: pos + 1 };
  if (richText && node.type.name === "listItem" && node.firstChild?.isTextblock) {
    return { kind: "text", from: pos + 2, to: pos + 2 };
  }
  return node.type.spec.selectable === false ? { kind: "near", pos } : { kind: "node", pos };
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

function addCandidateDiagnostic(
  builder: SemanticSnapshotBuilder,
  code: "invalid-published-candidate" | "duplicate-published-candidate",
  owner: SemanticOwnerContext,
  candidate: ResolvedPublishedSemanticChild,
): void {
  builder.addDiagnostic({
    code,
    ownerId: owner.id,
    candidateId: candidate.id,
    ownerNodeType: owner.nodeType,
    candidateNodeType: candidate.node.type.name,
  });
}
