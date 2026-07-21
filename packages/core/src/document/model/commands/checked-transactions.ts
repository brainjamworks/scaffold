import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Fragment } from "@tiptap/pm/model";
import type { Transform } from "@tiptap/pm/transform";

import { cloneJsonWithNewStableIds } from "../identity/clone-with-new-ids";

export interface CheckedMutationIssue {
  code: string;
  message: string;
  field?: string;
}

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
}: {
  tr: TTransform;
  pos: number;
  node: ProseMirrorNode;
}): CheckedMutationResult<TTransform> {
  const nodeIssue = checkNode(node);
  if (nodeIssue) return { ok: false, issue: nodeIssue };

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
}: {
  tr: TTransform;
  from: number;
  to: number;
  node: ProseMirrorNode;
}): CheckedMutationResult<TTransform> {
  const nodeIssue = checkNode(node);
  if (nodeIssue) return { ok: false, issue: nodeIssue };

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
}: {
  tr: TTransform;
  pos: number;
  nodeType?: string;
  content: readonly ProseMirrorNode[];
}): CheckedMutationResult<TTransform> {
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
}: {
  tr: TTransform;
  pos: number;
}): CheckedMutationResult<TTransform> {
  const target = nodeAtChecked(tr, pos, "delete");
  if (!target.ok) return target;

  try {
    tr.delete(pos, pos + target.node.nodeSize);
    tr.doc.check();
    return { ok: true, tr };
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
}

export function duplicateNodeChecked<TTransform extends Transform>({
  tr,
  pos,
  regenerateStableIds = false,
}: {
  tr: TTransform;
  pos: number;
  regenerateStableIds?: boolean;
}): CheckedDuplicateNodeResult<TTransform> {
  const target = nodeAtChecked(tr, pos, "duplicate");
  if (!target.ok) return target;

  const sourceJson = target.node.toJSON() as JSONContent;
  const cloneJson = regenerateStableIds ? cloneJsonWithNewStableIds(sourceJson) : sourceJson;

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

  const insertResult = insertNodeChecked({
    tr,
    pos: pos + target.node.nodeSize,
    node: clone,
  });
  if (!insertResult.ok) return insertResult;

  return { ok: true, node: clone, tr: insertResult.tr };
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
