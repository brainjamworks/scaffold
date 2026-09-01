import {
  EmbeddedNodeIdSchema,
  PresentationContentLayoutSchema,
  type EmbeddedNodeId,
  type PresentationContentLayout,
} from "@scaffold/contracts";
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
import { CONTENT_LAYOUT_ATTR } from "../nodes/presentation-container-attributes";
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
import type { SemanticProjectionNodeIndex } from "./projection-node-index";
import { readAuthoredSemanticLabel } from "./semantic-labels";
import type { SemanticSnapshotBuilder, SemanticSnapshotItemInput } from "./snapshot-builder";
import type { SemanticPresentationContainer } from "./semantic-document-snapshot";

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
  readonly definitions: SemanticDefinitionLookup;
  readonly nodeIndex: SemanticProjectionNodeIndex;
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
  nodeIndex,
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
          candidates: resolveOwnerPublication(ownerContext, definitions, nodeIndex, builder),
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
          label:
            readAuthoredSemanticLabel(resolved.node.attrs["semanticLabel"]) ??
            readNonEmptyString(resolved.candidate.label) ??
            humanize(resolved.node.type.name),
          summary: readNonEmptyString(resolved.candidate.summary),
          presentation: {
            actionIds: resolved.candidate.presentation?.actionIds ?? [],
            ...(resolved.candidate.presentation?.reconstructableCommandTypes
              ? {
                  reconstructableCommandTypes:
                    resolved.candidate.presentation.reconstructableCommandTypes,
                }
              : {}),
            disabledReason: resolved.candidate.presentation?.disabledReason ?? null,
          },
          presentationContainer: null,
        },
        parentId,
        location: {
          id: resolved.id,
          nodeType: resolved.node.type.name,
          from: resolved.absolutePos,
          to: resolved.absolutePos + resolved.node.nodeSize,
          selectionTarget: semanticSelectionTarget(resolved.node, resolved.absolutePos, isRichText),
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
  definitions: SemanticDefinitionLookup,
  builder: SemanticSnapshotBuilder,
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
      item(id, unavailableRoot.kind, nodeType, null, unavailableRoot.label, undefined, null),
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
      item(id, "course-section", nodeType, null, section.title, undefined, null),
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
        definition?.documentSemantics?.presentation,
        null,
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
        null,
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
        projectPresentationContainer(node, courseStructure.mode),
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
      item(
        id,
        "region",
        nodeType,
        null,
        humanize(role),
        undefined,
        projectPresentationContainer(node, courseStructure.mode),
      ),
      context.parentId,
      context.surfaceId,
      undefined,
      standardRichTextDocumentSemantics,
    );
  }

  if (nodeType === NODE_TYPES.grid) {
    const id = requireNodeId(node);
    return classified(
      item(id, "grid", nodeType, null, "Grid", undefined, null),
      context.parentId,
      context.surfaceId,
    );
  }

  if (nodeType === NODE_TYPES.cell && context.parentNodeType === NODE_TYPES.grid) {
    const id = requireNodeId(node);
    return classified(
      item(
        id,
        "cell",
        nodeType,
        null,
        `Cell ${context.siblingTypeOrdinal}`,
        undefined,
        projectPresentationContainer(node, courseStructure.mode),
      ),
      context.parentId,
      context.surfaceId,
      undefined,
      standardRichTextDocumentSemantics,
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
      null,
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
  presentation: SemanticPresentationDefinition | undefined,
  presentationContainer: SemanticPresentationContainer | null,
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
      ...(presentation?.reconstructableCommandTypes
        ? { reconstructableCommandTypes: presentation.reconstructableCommandTypes }
        : {}),
      disabledReason: presentation?.disabledReason ?? null,
    },
    presentationContainer,
  };
}

function projectPresentationContainer(
  node: ProseMirrorNode,
  mode: "page" | "slideshow",
): SemanticPresentationContainer | null {
  if (mode === "page") return null;
  if (
    node.type.name !== NODE_TYPES.region &&
    node.type.name !== NODE_TYPES.cell &&
    node.type.name !== NODE_TYPES.layoutSection
  ) {
    return null;
  }
  return { contentLayout: decodePresentationContentLayout(node) };
}

function decodePresentationContentLayout(node: ProseMirrorNode): PresentationContentLayout {
  const parsed = PresentationContentLayoutSchema.safeParse(node.attrs[CONTENT_LAYOUT_ATTR]);
  if (!parsed.success) {
    throw new Error(`Semantic projection encountered invalid contentLayout on ${node.type.name}.`);
  }
  return parsed.data;
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
