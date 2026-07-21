import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transform } from "@tiptap/pm/transform";
import type { ZodTypeAny } from "zod";

import type { CheckedMutationIssue, CheckedMutationResult } from "./checked-transactions";
import { resolveStableNode } from "../identity/resolve-stable-node";

interface DirectChildCollectionTarget {
  ownerId: string;
  ownerNodeType: string;
  childNodeType: string;
  attr: string;
  schema: ZodTypeAny;
}

interface DirectChildSettingsItem {
  id: string;
  value: unknown;
}

type ReadDirectChildSettingsItemsResult =
  | { ok: true; items: DirectChildSettingsItem[] }
  | { ok: false; issue: CheckedMutationIssue };

type DirectChildWriteInput<TTransform extends Transform> = DirectChildCollectionTarget & {
  tr: TTransform;
  childId: string;
};

type DirectChildValueWriteInput<TTransform extends Transform> =
  DirectChildWriteInput<TTransform> & {
    value: unknown;
  };

export function readDirectChildSettingsItems({
  doc,
  ...target
}: DirectChildCollectionTarget & { doc: ProseMirrorNode }): ReadDirectChildSettingsItemsResult {
  const owner = resolveOwner(doc, target.ownerId, target.ownerNodeType);
  if (!owner.ok) return owner;

  const items: DirectChildSettingsItem[] = [];
  let issue: CheckedMutationIssue | null = null;
  owner.node.forEach((child) => {
    if (issue || child.type.name !== target.childNodeType) return;
    const id = child.attrs["id"];
    if (typeof id !== "string" || id.length === 0) {
      issue = {
        code: "invalid_collection_child_id",
        message: `A direct "${target.childNodeType}" child of "${target.ownerId}" has no stable id.`,
      };
      return;
    }
    const parsed = target.schema.safeParse(child.attrs[target.attr]);
    if (!parsed.success) {
      issue = {
        code: "invalid_collection_item_value",
        message: parsed.error.message,
      };
      return;
    }
    items.push({ id, value: parsed.data });
  });

  return issue ? { ok: false, issue } : { ok: true, items };
}

export function insertDirectChildSettingsItemChecked<TTransform extends Transform>({
  tr,
  childId,
  value,
  ...target
}: DirectChildValueWriteInput<TTransform>): CheckedMutationResult<TTransform> {
  const owner = resolveOwner(tr.doc, target.ownerId, target.ownerNodeType);
  if (!owner.ok) return owner;
  if (findNodeByStableId(tr.doc, childId)) {
    return failure(
      "duplicate_collection_child_id",
      `Node id "${childId}" already exists in the document.`,
    );
  }
  const parsed = parseValue(target.schema, value);
  if (!parsed.ok) return parsed;

  const childType = tr.doc.type.schema.nodes[target.childNodeType];
  if (!childType) {
    return failure(
      "missing_collection_child_type",
      `Node type "${target.childNodeType}" is not present in the document schema.`,
    );
  }

  let child: ProseMirrorNode | null = null;
  try {
    child = childType.createAndFill({ id: childId, [target.attr]: parsed.value });
  } catch (error) {
    return failure(
      "invalid_collection_child",
      error instanceof Error ? error.message : `Could not create "${target.childNodeType}".`,
    );
  }
  if (!child || !owner.node.type.validContent(owner.node.content.append(Fragment.from(child)))) {
    return failure(
      "invalid_collection_insert",
      `Cannot append "${target.childNodeType}" to "${target.ownerNodeType}".`,
    );
  }

  try {
    tr.insert(owner.pos + owner.node.nodeSize - 1, child);
    tr.doc.check();
    return { ok: true, tr };
  } catch (error) {
    return failure(
      "invalid_document_after_collection_insert",
      error instanceof Error ? error.message : "Collection insert produced an invalid document.",
    );
  }
}

export function updateDirectChildSettingsItemChecked<TTransform extends Transform>({
  tr,
  childId,
  value,
  ...target
}: DirectChildValueWriteInput<TTransform>): CheckedMutationResult<TTransform> {
  const resolved = resolveDirectChild(tr.doc, target, childId);
  if (!resolved.ok) return resolved;
  const parsed = parseValue(target.schema, value);
  if (!parsed.ok) return parsed;

  try {
    const attrs = { ...resolved.child.node.attrs, [target.attr]: parsed.value };
    resolved.child.node.type
      .create(attrs, resolved.child.node.content, resolved.child.node.marks)
      .check();
    tr.setNodeMarkup(resolved.child.pos, undefined, attrs);
    tr.doc.check();
    return { ok: true, tr };
  } catch (error) {
    return failure(
      "invalid_document_after_collection_update",
      error instanceof Error ? error.message : "Collection update produced an invalid document.",
    );
  }
}

export function removeDirectChildSettingsItemChecked<TTransform extends Transform>({
  tr,
  childId,
  ...target
}: DirectChildWriteInput<TTransform>): CheckedMutationResult<TTransform> {
  const resolved = resolveDirectChild(tr.doc, target, childId);
  if (!resolved.ok) return resolved;

  const content = Fragment.fromArray(
    resolved.owner.node.content.content.filter((_, index) => index !== resolved.child.index),
  );
  if (!resolved.owner.node.type.validContent(content)) {
    return failure(
      "invalid_collection_remove",
      `Cannot remove "${childId}" from "${target.ownerNodeType}".`,
    );
  }

  try {
    tr.delete(resolved.child.pos, resolved.child.pos + resolved.child.node.nodeSize);
    tr.doc.check();
    return { ok: true, tr };
  } catch (error) {
    return failure(
      "invalid_document_after_collection_remove",
      error instanceof Error ? error.message : "Collection removal produced an invalid document.",
    );
  }
}

function resolveOwner(
  doc: ProseMirrorNode,
  ownerId: string,
  ownerNodeType: string,
): { ok: true; node: ProseMirrorNode; pos: number } | { ok: false; issue: CheckedMutationIssue } {
  const owner = resolveStableNode(doc, { id: ownerId, nodeType: ownerNodeType });
  if (owner.status === "missing") {
    return failure("missing_collection_owner", `Collection owner "${ownerId}" was not found.`);
  }
  if (owner.status === "invalid") {
    if (owner.reason === "duplicate_id") {
      return failure(
        "duplicate_collection_owner",
        `Collection owner id "${ownerId}" is duplicated.`,
      );
    }
    return failure(
      "wrong_collection_owner_type",
      `Collection owner "${ownerId}" is not "${ownerNodeType}".`,
    );
  }
  return { ok: true, node: owner.node, pos: owner.pos };
}

function resolveDirectChild(
  doc: ProseMirrorNode,
  target: DirectChildCollectionTarget,
  childId: string,
):
  | {
      ok: true;
      owner: { node: ProseMirrorNode; pos: number };
      child: { node: ProseMirrorNode; pos: number; index: number };
    }
  | { ok: false; issue: CheckedMutationIssue } {
  const owner = resolveOwner(doc, target.ownerId, target.ownerNodeType);
  if (!owner.ok) return owner;

  const child = findDirectChildByStableId(owner, childId);

  if (!child) {
    if (findNodeByStableId(doc, childId)) {
      return failure(
        "collection_child_not_direct",
        `Node "${childId}" is not a direct child of collection owner "${target.ownerId}".`,
      );
    }
    return failure("missing_collection_child", `Collection child "${childId}" was not found.`);
  }
  if (child.node.type.name !== target.childNodeType) {
    return failure(
      "wrong_collection_child_type",
      `Collection child "${childId}" is "${child.node.type.name}", not "${target.childNodeType}".`,
    );
  }
  return { ok: true, owner, child };
}

function findDirectChildByStableId(
  owner: { node: ProseMirrorNode; pos: number },
  childId: string,
): { node: ProseMirrorNode; pos: number; index: number } | null {
  let offset = 0;
  for (let index = 0; index < owner.node.childCount; index += 1) {
    const node = owner.node.child(index);
    if (node.attrs["id"] === childId) {
      return { node, pos: owner.pos + 1 + offset, index };
    }
    offset += node.nodeSize;
  }
  return null;
}

function findNodeByStableId(
  doc: ProseMirrorNode,
  id: string,
): { node: ProseMirrorNode; pos: number } | null {
  let result: { node: ProseMirrorNode; pos: number } | null = null;

  doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    result = { node, pos };
    return false;
  });

  return result;
}

function parseValue(
  schema: ZodTypeAny,
  value: unknown,
): { ok: true; value: unknown } | { ok: false; issue: CheckedMutationIssue } {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : failure("invalid_collection_item_value", parsed.error.message);
}

function failure(code: string, message: string): { ok: false; issue: CheckedMutationIssue } {
  return { ok: false, issue: { code, message } };
}
