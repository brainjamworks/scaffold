import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { ProjectedCourseStructure } from "../course-structure/course-structure-projection";
import { readUnavailableContentCompatibilityRoot } from "../establishment/unavailable-content-compatibility-root";
import {
  CELL_NODE_TYPE,
  COURSE_SECTION_NODE_TYPE,
  GRID_NODE_TYPE,
  LAYOUT_NODE_TYPE,
  REGION_NODE_TYPE,
  SECTION_NODE_TYPE,
  SURFACE_NODE_TYPE,
} from "../nodes/structural-node-types";
import type {
  DocumentTreeDefinitionLookup,
  DocumentTreeLayoutDefinition,
} from "./definition-lookup";
import type {
  DocumentTreeDefinition,
  DocumentItemActivation,
  DocumentTreeChildrenBuilder,
  DocumentItemPresentation,
} from "./definition";
import { PRESENTATION_VISUAL_ACTION_IDS } from "./definition";
import {
  evaluateOwnerDescription,
  buildOwnerDocumentTreeChildren,
  type ResolvedExposedDocumentChild,
  type DocumentTreeOwnerContext,
} from "./owner-document-tree-children";
import type { DocumentTreeBuildNodeIndex } from "./document-tree-build-node-index";
import { readAuthoredSemanticLabel } from "./semantic-labels";
import type {
  DocumentTreeSnapshotBuilder,
  DocumentTreeSnapshotItemInput,
} from "./document-tree-snapshot-builder";

const NODE_TYPES = Object.freeze({
  courseSection: COURSE_SECTION_NODE_TYPE,
  surface: SURFACE_NODE_TYPE,
  layout: LAYOUT_NODE_TYPE,
  layoutSection: SECTION_NODE_TYPE,
  region: REGION_NODE_TYPE,
  grid: GRID_NODE_TYPE,
  cell: CELL_NODE_TYPE,
});

export interface ProjectCoreStructuralItemsInput {
  readonly doc: ProseMirrorNode;
  readonly courseStructure: ProjectedCourseStructure;
  readonly definitions: DocumentTreeDefinitionLookup;
  readonly nodeIndex: DocumentTreeBuildNodeIndex;
  readonly builder: DocumentTreeSnapshotBuilder;
}

interface TraversalContext {
  readonly parentId: EmbeddedNodeId | null;
  readonly surfaceId: EmbeddedNodeId | null;
  readonly parentNodeType: string | null;
  readonly layoutDefinition: DocumentTreeLayoutDefinition | undefined;
  readonly siblingTypeOrdinal: number;
  readonly activationPath: readonly DocumentItemActivation[];
}

interface ClassifiedNode {
  readonly item: DocumentTreeSnapshotItemInput;
  readonly parentId: EmbeddedNodeId | null;
  readonly surfaceId: EmbeddedNodeId | null;
  readonly layoutDefinition: DocumentTreeLayoutDefinition | undefined;
  readonly documentTree: DocumentTreeDefinition | undefined;
  readonly closesTraversal: boolean;
}

const projectStandardRichTextChildren: DocumentTreeChildrenBuilder = ({ helpers }) =>
  helpers.projectStandardRichText();
const standardRichTextDocumentTree: DocumentTreeDefinition = Object.freeze({
  projectChildren: projectStandardRichTextChildren,
});
const visualPresentationDefinition: DocumentItemPresentation = Object.freeze({
  actionIds: PRESENTATION_VISUAL_ACTION_IDS,
});

export function projectCoreStructuralItems({
  doc,
  courseStructure,
  definitions,
  nodeIndex,
  builder,
}: ProjectCoreStructuralItemsInput): void {
  const walkNode = (node: ProseMirrorNode, pos: number, context: TraversalContext): void => {
    const classified = classifyNode(node, context, courseStructure, definitions, builder);
    const parentId = classified?.item.id ?? context.parentId;
    const surfaceId = classified?.surfaceId ?? context.surfaceId;

    if (classified) {
      if (builder.hasItem(classified.item.id)) return;
      const ownerContext: DocumentTreeOwnerContext | null = classified.documentTree
        ? {
            node,
            id: classified.item.id,
            nodeType: node.type.name,
            definitionId: classified.item.definitionId ?? node.type.name,
            absolutePos: pos,
            documentTree: classified.documentTree,
          }
        : null;
      const description = ownerContext
        ? evaluateOwnerDescription(ownerContext, definitions, builder)
        : null;
      const describedItem = {
        ...classified.item,
        label:
          readAuthoredSemanticLabel(node.attrs["semanticLabel"]) ??
          readNonEmptyString(description?.label) ??
          classified.item.label,
        summary: description ? readNonEmptyString(description.summary) : classified.item.summary,
      };
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
          authoringAnchorId: null,
          activationPath: context.activationPath,
        },
      });
      if (ownerContext) {
        projectPublishedChildren({
          owner: ownerContext,
          candidates: buildOwnerDocumentTreeChildren(ownerContext, definitions, nodeIndex, builder),
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
  readonly owner: DocumentTreeOwnerContext;
  readonly candidates: readonly ResolvedExposedDocumentChild[];
  readonly surfaceId: EmbeddedNodeId | null;
  readonly inheritedActivationPath: readonly DocumentItemActivation[];
  readonly definitions: DocumentTreeDefinitionLookup;
  readonly builder: DocumentTreeSnapshotBuilder;
  readonly courseStructure: ProjectedCourseStructure;
  readonly walkNode: (node: ProseMirrorNode, pos: number, context: TraversalContext) => void;
}): void {
  const acceptedAncestors: Array<{
    readonly id: EmbeddedNodeId;
    readonly from: number;
    readonly to: number;
  }> = [];

  for (const resolved of input.candidates) {
    let containingCandidate = acceptedAncestors.at(-1);
    while (
      containingCandidate &&
      (containingCandidate.from >= resolved.relativePos ||
        containingCandidate.to < resolved.relativePos + resolved.node.nodeSize)
    ) {
      acceptedAncestors.pop();
      containingCandidate = acceptedAncestors.at(-1);
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
    } else if (resolved.candidate.treeRole) {
      if (input.builder.hasItem(resolved.id)) {
        addCandidateDiagnostic(
          input.builder,
          "duplicate-published-candidate",
          input.owner,
          resolved,
        );
        continue;
      }
      const isRichText = resolved.candidate.treeRole === "rich-text";
      input.builder.addItem({
        item: {
          id: resolved.id,
          kind: resolved.candidate.treeRole,
          nodeType: resolved.node.type.name,
          definitionId: input.owner.definitionId,
          label:
            readAuthoredSemanticLabel(resolved.node.attrs["semanticLabel"]) ??
            readNonEmptyString(resolved.candidate.label) ??
            humanize(resolved.node.type.name),
          summary: readNonEmptyString(resolved.candidate.summary),
          presentation: {
            actionIds:
              resolved.candidate.presentation?.actionIds ??
              (isRichText ? PRESENTATION_VISUAL_ACTION_IDS : []),
            ...(resolved.candidate.presentation?.reconstructableCommandTypes
              ? {
                  reconstructableCommandTypes:
                    resolved.candidate.presentation.reconstructableCommandTypes,
                }
              : {}),
            disabledReason: resolved.candidate.presentation?.disabledReason ?? null,
          },
        },
        parentId,
        location: {
          id: resolved.id,
          nodeType: resolved.node.type.name,
          from: resolved.absolutePos,
          to: resolved.absolutePos + resolved.node.nodeSize,
          selectionTarget: documentItemSelectionTarget(
            resolved.node,
            resolved.absolutePos,
            isRichText,
          ),
          surfaceId: input.surfaceId,
          authoringAnchorId: resolved.authoringAnchorId,
          activationPath,
        },
      });
    } else {
      addCandidateDiagnostic(input.builder, "invalid-published-candidate", input.owner, resolved);
      continue;
    }

    if (input.builder.hasItem(resolved.id)) {
      acceptedAncestors.push({
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
  definitions: DocumentTreeDefinitionLookup,
  builder: DocumentTreeSnapshotBuilder,
): ClassifiedNode | null {
  const nodeType = node.type.name;
  const unavailableRoot = readUnavailableContentCompatibilityRoot(nodeType, node.attrs);

  if (unavailableRoot) {
    const id = requireNodeId(node);
    const unavailableSurface =
      unavailableRoot.kind === "surface" ? courseStructure.surfaceById[id] : undefined;
    if (unavailableRoot.kind === "surface" && !unavailableSurface) {
      throw new Error(`Course Structure does not contain unavailable Surface ${id}.`);
    }
    return classified(
      item(id, unavailableRoot.kind, nodeType, null, unavailableRoot.label, undefined),
      unavailableSurface?.courseSectionId ?? context.parentId,
      unavailableRoot.kind === "surface" ? id : context.surfaceId,
      undefined,
      undefined,
      true,
    );
  }

  if (nodeType === NODE_TYPES.courseSection) {
    const id = requireNodeId(node);
    const section = courseStructure.courseSectionById[id];
    if (!section) throw new Error(`Course Structure does not contain Course Section ${id}.`);
    return classified(
      item(id, "course-section", nodeType, null, section.title, undefined),
      null,
      null,
    );
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
        definition
          ? (definition.documentTree?.presentation ?? visualPresentationDefinition)
          : undefined,
      ),
      projectedSurface.courseSectionId,
      id,
      undefined,
      definition?.documentTree,
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
        definition
          ? (definition.documentTree?.presentation ?? visualPresentationDefinition)
          : undefined,
      ),
      context.parentId,
      context.surfaceId,
      definition,
      definition?.documentTree,
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
        definition
          ? (definition.section?.documentTree?.presentation ?? visualPresentationDefinition)
          : undefined,
      ),
      context.parentId,
      context.surfaceId,
      undefined,
      withDefaultRichTextPublication(definition?.section?.documentTree),
    );
  }

  if (nodeType === NODE_TYPES.region) {
    const id = requireNodeId(node);
    const role = readNonEmptyString(node.attrs["role"]) ?? "main";
    return classified(
      item(id, "region", nodeType, null, humanize(role), undefined),
      context.parentId,
      context.surfaceId,
      undefined,
      standardRichTextDocumentTree,
    );
  }

  if (nodeType === NODE_TYPES.grid) {
    const id = requireNodeId(node);
    return classified(
      item(id, "grid", nodeType, null, "Grid", undefined),
      context.parentId,
      context.surfaceId,
    );
  }

  if (nodeType === NODE_TYPES.cell && context.parentNodeType === NODE_TYPES.grid) {
    const id = requireNodeId(node);
    return classified(
      item(id, "cell", nodeType, null, `Cell ${context.siblingTypeOrdinal}`, undefined),
      context.parentId,
      context.surfaceId,
      undefined,
      standardRichTextDocumentTree,
    );
  }

  const block = definitions.blocks.get(nodeType);
  if (!block) return null;
  const id = requireNodeId(node);
  const excludesPresentation = block.isAssessment || block.nodeType === "quiz";
  const documentTree = excludesPresentation
    ? block.documentTree?.describe
      ? Object.freeze({ describe: block.documentTree.describe })
      : undefined
    : block.documentTree;
  return classified(
    item(
      id,
      "block",
      nodeType,
      block.nodeType,
      block.title,
      excludesPresentation
        ? undefined
        : (block.documentTree?.presentation ?? visualPresentationDefinition),
    ),
    context.parentId,
    context.surfaceId,
    undefined,
    documentTree,
    true,
  );
}

function classified(
  itemValue: DocumentTreeSnapshotItemInput,
  parentId: EmbeddedNodeId | null,
  surfaceId: EmbeddedNodeId | null,
  layoutDefinition?: DocumentTreeLayoutDefinition,
  documentTree?: DocumentTreeDefinition,
  closesTraversal = false,
): ClassifiedNode {
  return {
    item: itemValue,
    parentId,
    surfaceId,
    layoutDefinition,
    documentTree,
    closesTraversal,
  };
}

function withDefaultRichTextPublication(
  documentTree: DocumentTreeDefinition | undefined,
): DocumentTreeDefinition {
  if (documentTree?.projectChildren) return documentTree;
  if (!documentTree) return standardRichTextDocumentTree;
  return Object.freeze({
    ...documentTree,
    projectChildren: projectStandardRichTextChildren,
  });
}

function item(
  id: EmbeddedNodeId,
  kind: DocumentTreeSnapshotItemInput["kind"],
  nodeType: string,
  definitionId: string | null,
  label: string,
  presentation: DocumentItemPresentation | undefined,
): DocumentTreeSnapshotItemInput {
  return {
    id,
    kind,
    nodeType,
    definitionId,
    label,
    summary: null,
    presentation: {
      actionIds: presentation?.actionIds ?? [],
      ...(presentation?.reconstructableCommandTypes
        ? { reconstructableCommandTypes: presentation.reconstructableCommandTypes }
        : {}),
      disabledReason: presentation?.disabledReason ?? null,
    },
  };
}

function requireNodeId(node: ProseMirrorNode): EmbeddedNodeId {
  const parsed = EmbeddedNodeIdSchema.safeParse(node.attrs["id"]);
  if (!parsed.success)
    throw new Error(`Document tree structural node ${node.type.name} has no valid ID.`);
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

function documentItemSelectionTarget(
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
  builder: DocumentTreeSnapshotBuilder,
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
  builder: DocumentTreeSnapshotBuilder,
  code: "invalid-published-candidate" | "duplicate-published-candidate",
  owner: DocumentTreeOwnerContext,
  candidate: ResolvedExposedDocumentChild,
): void {
  builder.addDiagnostic({
    code,
    ownerId: owner.id,
    candidateId: candidate.id,
    ownerNodeType: owner.nodeType,
    candidateNodeType: candidate.node.type.name,
  });
}
