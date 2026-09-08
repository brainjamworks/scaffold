import type { JSONContent } from "@tiptap/core";
import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Fragment } from "@tiptap/pm/model";
import type { Transform } from "@tiptap/pm/transform";

import {
  authorizeExplicitLayerStructuralSteps,
  isLayerFillOccupantNode,
  validateExplicitLayerEditRange,
  validateExplicitLayerStructuralRootAccess,
  validateImplicitLayerEditRange,
  validateImplicitLayerStructuralRootAccess,
  validateLayerContentPlacement,
  type LayerEditingBoundaryError,
  type LayerEditingTarget,
  type LayerMutationAccess,
} from "@/document/authoring/layers/layer-editing-boundaries";
import { createEditableTextblock } from "@/document/model/content-model/editable-region";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { LAYER_NODE_TYPE } from "@/document/model/nodes/structural-node-types";
import {
  cloneJsonWithNewStableIds,
  type ContentIdentityRewriteLookup,
} from "../identity/clone-with-new-ids";

export interface GenericCheckedMutationIssue {
  readonly kind?: never;
  code: string;
  message: string;
  field?: string;
}

export type CheckedMutationIssue =
  | GenericCheckedMutationIssue
  | {
      readonly kind: "layer";
      readonly code: "layer_editing_refused";
      readonly message: string;
      readonly error: LayerEditingBoundaryError;
    }
  | {
      readonly kind: "layer";
      readonly code:
        | "layer_insert_refused"
        | "layer_delete_refused"
        | "layer_duplicate_refused"
        | "layer_content_replace_refused";
      readonly message: string;
      readonly layerId: EmbeddedNodeId;
    }
  | {
      readonly kind: "layer";
      readonly code: "layer_owner_content_replace_refused";
      readonly message: string;
      readonly ownerId: EmbeddedNodeId;
    };

export type CheckedMutationResult<TTransform extends Transform = Transform> =
  | { ok: true; tr: TTransform }
  | { ok: false; issue: CheckedMutationIssue };

export type CheckedDuplicateNodeResult<TTransform extends Transform = Transform> =
  | { ok: true; node: ProseMirrorNode; tr: TTransform }
  | { ok: false; issue: CheckedMutationIssue };

export function insertNodeChecked<TTransform extends Transform>({
  tr,
  pos,
  node,
  layerAccess,
}: {
  tr: TTransform;
  pos: number;
  node: ProseMirrorNode;
  layerAccess: LayerMutationAccess;
}): CheckedMutationResult<TTransform> {
  assertLayerMutationAccess(tr.doc, layerAccess);
  const nodeIssue = checkNode(node);
  if (nodeIssue) return { ok: false, issue: nodeIssue };
  if (node.type.name === LAYER_NODE_TYPE) {
    return protectedLayerIssue("insert", node);
  }

  if (!Number.isInteger(pos) || pos < 0 || pos > tr.doc.content.size) {
    return {
      ok: false,
      issue: {
        code: "invalid_insert_position",
        message: `Insert position ${pos} is outside the document.`,
      },
    };
  }

  if (!canInsertNodeAt(tr.doc, pos, node)) {
    return {
      ok: false,
      issue: {
        code: "invalid_insert_target",
        message: `Cannot insert "${node.type.name}" at position ${pos}.`,
      },
    };
  }

  const layerBoundaryIssue = checkLayerPlacement(tr.doc, pos, pos, node, layerAccess);
  if (layerBoundaryIssue) return { ok: false, issue: layerBoundaryIssue };

  try {
    tr.insert(pos, node);
    tr.doc.check();
    return { ok: true, tr };
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: "invalid_document_after_insert",
        message:
          error instanceof Error
            ? error.message
            : `Inserting "${node.type.name}" produced an invalid document.`,
      },
    };
  }
}

export function replaceRangeWithNodeChecked<TTransform extends Transform>({
  tr,
  from,
  to,
  node,
  layerAccess,
}: {
  tr: TTransform;
  from: number;
  to: number;
  node: ProseMirrorNode;
  layerAccess: LayerMutationAccess;
}): CheckedMutationResult<TTransform> {
  assertLayerMutationAccess(tr.doc, layerAccess);
  const nodeIssue = checkNode(node);
  if (nodeIssue) return { ok: false, issue: nodeIssue };
  if (node.type.name === LAYER_NODE_TYPE) {
    return protectedLayerIssue("insert", node);
  }

  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < from ||
    to > tr.doc.content.size
  ) {
    return {
      ok: false,
      issue: {
        code: "invalid_replace_range",
        message: `Replace range ${from}-${to} is outside the document.`,
      },
    };
  }

  const layerBoundaryIssue = checkLayerPlacement(tr.doc, from, to, node, layerAccess);
  if (layerBoundaryIssue) return { ok: false, issue: layerBoundaryIssue };

  try {
    tr.replaceRangeWith(from, to, node);
    tr.doc.check();
    return { ok: true, tr };
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: "invalid_document_after_replace",
        message:
          error instanceof Error
            ? error.message
            : `Replacing range with "${node.type.name}" produced an invalid document.`,
      },
    };
  }
}

export function replaceNodeContentChecked<TTransform extends Transform>({
  tr,
  pos,
  nodeType,
  content,
  layerAccess,
}: {
  tr: TTransform;
  pos: number;
  nodeType?: string;
  content: readonly ProseMirrorNode[];
  layerAccess: LayerMutationAccess;
}): CheckedMutationResult<TTransform> {
  assertLayerMutationAccess(tr.doc, layerAccess);
  const target = nodeAtChecked(tr, pos, "replace_content");
  if (!target.ok) return target;

  if (nodeType && target.node.type.name !== nodeType) {
    return {
      ok: false,
      issue: {
        code: "wrong_replace_content_node_type",
        message: `Node at position ${pos} is "${target.node.type.name}", not "${nodeType}".`,
      },
    };
  }
  if (target.node.type.name === LAYER_NODE_TYPE) {
    return protectedLayerIssue("content-replace", target.node);
  }
  if (hasDirectLayerChild(target.node)) return protectedOwnerContentReplaceIssue(target.node);
  const layerBoundaryIssue = checkLayerRange(
    tr.doc,
    pos + 1,
    pos + target.node.nodeSize - 1,
    layerAccess,
  );
  if (layerBoundaryIssue) return { ok: false, issue: layerBoundaryIssue };

  for (const child of content) {
    const childIssue = checkNode(child);
    if (childIssue) return { ok: false, issue: childIssue };
  }

  const fragment = Fragment.fromArray([...content]);
  if (!target.node.type.validContent(fragment)) {
    return {
      ok: false,
      issue: {
        code: "invalid_replacement_content",
        message: `Replacement content is not valid for "${target.node.type.name}".`,
      },
    };
  }

  try {
    tr.replaceWith(pos + 1, pos + target.node.nodeSize - 1, fragment);
    tr.doc.check();
    return { ok: true, tr };
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: "invalid_document_after_content_replace",
        message:
          error instanceof Error
            ? error.message
            : `Replacing content inside "${target.node.type.name}" produced an invalid document.`,
      },
    };
  }
}

export function deleteNodeChecked<TTransform extends Transform>({
  tr,
  pos,
  layerAccess,
}: {
  tr: TTransform;
  pos: number;
  layerAccess: LayerMutationAccess;
}): CheckedMutationResult<TTransform> {
  assertLayerMutationAccess(tr.doc, layerAccess);
  const target = nodeAtChecked(tr, pos, "delete");
  if (!target.ok) return target;
  if (target.node.type.name === LAYER_NODE_TYPE) {
    return protectedLayerIssue("delete", target.node);
  }
  const deletesWholeOwner = containsLayer(target.node);
  const layerBoundaryIssue = deletesWholeOwner
    ? checkLayerStructuralRootAccess(tr.doc, target.node, pos, layerAccess)
    : checkLayerRange(tr.doc, pos, pos + target.node.nodeSize, layerAccess);
  if (layerBoundaryIssue) {
    return { ok: false, issue: layerBoundaryIssue };
  }

  const replacement = deletesWholeOwner
    ? requiredLayerBodyReplacement(tr.doc, pos, target.node)
    : null;
  const fromStep = tr.steps.length;
  try {
    if (replacement) {
      tr.replaceWith(pos, pos + target.node.nodeSize, replacement.node);
    } else {
      tr.delete(pos, pos + target.node.nodeSize);
    }
    tr.doc.check();
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: "invalid_document_after_delete",
        message:
          error instanceof Error
            ? error.message
            : `Deleting node at position ${pos} produced an invalid document.`,
      },
    };
  }
  if (deletesWholeOwner) {
    authorizeExplicitLayerStructuralSteps(tr, {
      fromStep,
      rootIds: [requireStableNodeId(target.node), ...(replacement ? [replacement.id] : [])],
    });
  }
  return { ok: true, tr };
}

function requiredLayerBodyReplacement(
  doc: ProseMirrorNode,
  pos: number,
  target: ProseMirrorNode,
): { readonly node: ProseMirrorNode; readonly id: EmbeddedNodeId } | null {
  const $pos = doc.resolve(pos);
  if (
    $pos.parent.type.name !== LAYER_NODE_TYPE ||
    $pos.parentOffset !== 0 ||
    $pos.parent.childCount !== 1 ||
    $pos.nodeAfter !== target
  ) {
    return null;
  }

  const emptyTextblock = createEditableTextblock(doc.type.schema);
  if (!emptyTextblock) {
    throw new Error(`Layer schema has no editable paragraph for deleting "${target.type.name}".`);
  }
  if (!("id" in emptyTextblock.attrs)) {
    throw new Error(
      `Editable Layer replacement "${emptyTextblock.type.name}" has no stable identity attribute.`,
    );
  }

  const id = createEmbeddedNodeId();
  return {
    id,
    node: emptyTextblock.type.create(
      { ...emptyTextblock.attrs, id },
      emptyTextblock.content,
      emptyTextblock.marks,
    ),
  };
}

type DuplicateNodeCheckedInput<TTransform extends Transform> = {
  tr: TTransform;
  pos: number;
  layerAccess: LayerMutationAccess;
} & (
  | { regenerateNodeIds?: false; identityRewrites?: never }
  | { regenerateNodeIds: true; identityRewrites: ContentIdentityRewriteLookup }
);

export function duplicateNodeChecked<TTransform extends Transform>(
  input: DuplicateNodeCheckedInput<TTransform>,
): CheckedDuplicateNodeResult<TTransform> {
  const { tr, pos, layerAccess } = input;
  assertLayerMutationAccess(tr.doc, layerAccess);
  const target = nodeAtChecked(tr, pos, "duplicate");
  if (!target.ok) return target;
  if (target.node.type.name === LAYER_NODE_TYPE) {
    return protectedLayerIssue("duplicate", target.node);
  }

  const sourceJson = target.node.toJSON() as JSONContent;
  const cloneJson = input.regenerateNodeIds
    ? cloneJsonWithNewStableIds(sourceJson, { identityRewrites: input.identityRewrites })
    : sourceJson;

  let clone: ProseMirrorNode;
  try {
    clone = target.node.type.schema.nodeFromJSON(cloneJson);
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: "invalid_duplicate_content",
        message:
          error instanceof Error
            ? error.message
            : `Duplicating node at position ${pos} produced invalid content.`,
      },
    };
  }

  const fromStep = tr.steps.length;
  const insertResult = insertNodeChecked({
    tr,
    pos: pos + target.node.nodeSize,
    node: clone,
    layerAccess,
  });
  if (!insertResult.ok) return insertResult;

  if (containsLayer(target.node)) {
    authorizeExplicitLayerStructuralSteps(insertResult.tr, {
      fromStep,
      rootIds: [requireStableNodeId(clone)],
    });
  }

  return { ok: true, node: clone, tr: insertResult.tr };
}

function checkLayerRange(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  access: LayerMutationAccess,
): Extract<CheckedMutationIssue, { code: "layer_editing_refused" }> | null {
  const result = resolveCheckedLayerRange(doc, from, to, access);
  return result.status === "error" ? result.issue : null;
}

function checkLayerStructuralRootAccess(
  doc: ProseMirrorNode,
  node: ProseMirrorNode,
  pos: number,
  access: LayerMutationAccess,
): Extract<CheckedMutationIssue, { code: "layer_editing_refused" }> | null {
  if (access.kind === "non-layer-document") return null;
  const result =
    access.kind === "implicit-authoring"
      ? validateImplicitLayerStructuralRootAccess({ ...access.context, doc, node, pos })
      : validateExplicitLayerStructuralRootAccess({
          doc,
          node,
          pos,
          ...access.destination,
          layoutDefinitions: access.layoutDefinitions,
        });
  return result.status === "ready" ? null : layerBoundaryIssue(result.error);
}

function checkLayerPlacement(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  node: ProseMirrorNode,
  access: LayerMutationAccess,
): Extract<CheckedMutationIssue, { code: "layer_editing_refused" }> | null {
  const range = resolveCheckedLayerRange(doc, from, to, access);
  if (range.status === "error") return range.issue;
  const target = range.target;
  if (!target) return null;
  if (access.kind === "non-layer-document") {
    throw new Error("A non-Layer mutation access declaration resolved a Layer target.");
  }
  const blockDefinitions =
    access.kind === "implicit-authoring"
      ? access.context.blockDefinitions
      : access.blockDefinitions;
  const layoutDefinitions =
    access.kind === "implicit-authoring"
      ? access.context.layoutDefinitions
      : access.layoutDefinitions;
  if (doc.resolve(from).parent !== target.layer || doc.resolve(to).parent !== target.layer) {
    return null;
  }
  const placement = validateLayerContentPlacement({
    target,
    contentType: node.type.name,
    contentIsFillOccupant: isLayerFillOccupantNode(node, blockDefinitions, layoutDefinitions),
    existingChildIsFillOccupant: (child) =>
      isLayerFillOccupantNode(child, blockDefinitions, layoutDefinitions),
    from,
    to,
  });
  return placement.status === "error" ? layerBoundaryIssue(placement.error) : null;
}

type CheckedLayerRangeResolution =
  | { readonly status: "ready"; readonly target: LayerEditingTarget | null }
  | {
      readonly status: "error";
      readonly issue: Extract<CheckedMutationIssue, { code: "layer_editing_refused" }>;
    };

function resolveCheckedLayerRange(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  access: LayerMutationAccess,
): CheckedLayerRangeResolution {
  if (access.kind === "non-layer-document") return { status: "ready", target: null };
  if (access.kind === "implicit-authoring") {
    const result = validateImplicitLayerEditRange({ ...access.context, doc, from, to });
    return result.status === "ready"
      ? { status: "ready", target: result.value.at(-1) ?? null }
      : { status: "error", issue: layerBoundaryIssue(result.error) };
  }
  const result = validateExplicitLayerEditRange({
    doc,
    ...access.destination,
    layoutDefinitions: access.layoutDefinitions,
    from,
    to,
  });
  return result.status === "ready"
    ? { status: "ready", target: result.value }
    : { status: "error", issue: layerBoundaryIssue(result.error) };
}

function layerBoundaryIssue(
  error: LayerEditingBoundaryError,
): Extract<CheckedMutationIssue, { code: "layer_editing_refused" }> {
  return {
    code: "layer_editing_refused",
    kind: "layer",
    message: `Layer editing refused: ${error.reason}.`,
    error,
  };
}

function protectedLayerIssue(
  operation: "insert" | "delete" | "duplicate" | "content-replace",
  node: ProseMirrorNode,
): { ok: false; issue: CheckedMutationIssue } {
  const layerId = requireStableNodeId(node);
  const code = protectedLayerCode(operation);
  return {
    ok: false,
    issue: {
      kind: "layer",
      code,
      message: `Cannot ${operation} protected Layer "${layerId}" through a generic mutation.`,
      layerId,
    },
  };
}

function protectedOwnerContentReplaceIssue(node: ProseMirrorNode): {
  ok: false;
  issue: CheckedMutationIssue;
} {
  const ownerId = requireStableNodeId(node);
  return {
    ok: false,
    issue: {
      kind: "layer",
      code: "layer_owner_content_replace_refused",
      message: `Cannot replace Layer membership for owner "${ownerId}" through a generic content mutation.`,
      ownerId,
    },
  };
}

function protectedLayerCode(
  operation: "insert" | "delete" | "duplicate" | "content-replace",
):
  | "layer_insert_refused"
  | "layer_delete_refused"
  | "layer_duplicate_refused"
  | "layer_content_replace_refused" {
  switch (operation) {
    case "insert":
      return "layer_insert_refused";
    case "delete":
      return "layer_delete_refused";
    case "duplicate":
      return "layer_duplicate_refused";
    case "content-replace":
      return "layer_content_replace_refused";
  }
}

function assertLayerMutationAccess(doc: ProseMirrorNode, access: LayerMutationAccess): void {
  if (access.kind !== "non-layer-document") return;
  if (containsLayer(doc)) {
    throw new Error("Layer-aware checked mutation requires explicit Layer access.");
  }
}

function hasDirectLayerChild(node: ProseMirrorNode): boolean {
  for (let index = 0; index < node.childCount; index += 1) {
    if (node.child(index).type.name === LAYER_NODE_TYPE) return true;
  }
  return false;
}

function containsLayer(node: ProseMirrorNode): boolean {
  let found = node.type.name === LAYER_NODE_TYPE;
  node.descendants((child) => {
    if (child.type.name !== LAYER_NODE_TYPE) return true;
    found = true;
    return false;
  });
  return found;
}

function requireStableNodeId(node: ProseMirrorNode): EmbeddedNodeId {
  const id = node.attrs["id"];
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`Structural node "${node.type.name}" has no stable identity.`);
  }
  return id as EmbeddedNodeId;
}

export function canInsertNodeAt(doc: ProseMirrorNode, pos: number, node: ProseMirrorNode): boolean {
  try {
    const resolved = doc.resolve(pos);
    const insertIndex = resolved.index();
    return resolved.parent.canReplace(insertIndex, insertIndex, Fragment.from(node));
  } catch {
    return false;
  }
}

function nodeAtChecked(
  tr: Transform,
  pos: number,
  operation: "delete" | "duplicate" | "replace_content",
): { ok: true; node: ProseMirrorNode } | { ok: false; issue: CheckedMutationIssue } {
  if (!Number.isInteger(pos) || pos < 0 || pos > tr.doc.content.size) {
    return {
      ok: false,
      issue: {
        code: `invalid_${operation}_position`,
        message: `Cannot ${operation} node at position ${pos}.`,
      },
    };
  }

  const node = tr.doc.nodeAt(pos);
  if (!node) {
    return {
      ok: false,
      issue: {
        code: `${operation}_target_not_found`,
        message: `No node exists at position ${pos}.`,
      },
    };
  }

  const nodeIssue = checkNode(node);
  if (nodeIssue) return { ok: false, issue: nodeIssue };

  return { ok: true, node };
}

function checkNode(node: ProseMirrorNode): CheckedMutationIssue | null {
  try {
    node.check();
    return null;
  } catch (error) {
    return {
      code: "invalid_node",
      message: error instanceof Error ? error.message : `Node "${node.type.name}" is invalid.`,
    };
  }
}
