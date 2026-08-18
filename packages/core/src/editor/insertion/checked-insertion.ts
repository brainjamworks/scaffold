import type { Editor, JSONContent } from "@tiptap/core";
import type { Schema, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection, type Transaction } from "@tiptap/pm/state";
import type { Transform } from "@tiptap/pm/transform";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import {
  replaceRangeWithNodeChecked,
  type CheckedMutationIssue,
} from "@/document/model/commands/checked-transactions";
import { materializeCatalogNodeHorizontalAlignment } from "@/editor/interactions/alignment/alignment-insertion";
import {
  isNodeSelectable,
  setNodeSelectionInTransaction,
} from "@/editor/selection/selection-transactions";
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";

import type { InsertAction, InsertActionIntent, InsertActionRange } from "./insert-action";
import type { InsertCatalog } from "./insert-catalog";
import { resolveInsertActionPlacement } from "./insertion-placement";

export type CreateCatalogNodeCheckedResult =
  | {
      readonly ok: true;
      readonly item: InsertAction;
      readonly node: ProseMirrorNode;
    }
  | {
      readonly ok: false;
      readonly issue: CheckedMutationIssue;
    };

export type ReplaceRangeWithCatalogNodeCheckedResult<TTransform extends Transform = Transform> =
  | {
      readonly ok: true;
      readonly item: InsertAction;
      readonly node: ProseMirrorNode;
      readonly tr: TTransform;
    }
  | {
      readonly ok: false;
      readonly issue: CheckedMutationIssue;
    };

export type InsertActionCheckedRange = InsertActionRange;

export function createCatalogNodeChecked({
  catalog,
  schema,
  actionId,
  contentOverride,
}: {
  catalog: InsertCatalog;
  schema: Schema;
  actionId: string;
  contentOverride?: JSONContent;
}): CreateCatalogNodeCheckedResult {
  const action = catalog.getById(actionId);
  if (!action) {
    return {
      ok: false,
      issue: {
        code: "unknown_catalog_item",
        message: `Insert action "${actionId}" is not in the supplied catalog.`,
      },
    };
  }

  return createInsertActionNodeChecked({
    action,
    schema,
    ...(contentOverride ? { contentOverride } : {}),
  });
}

export function replaceRangeWithCatalogNodeChecked<TTransform extends Transform>({
  catalog,
  tr,
  schema,
  actionId,
  from,
  to,
  contentOverride,
}: {
  catalog: InsertCatalog;
  tr: TTransform;
  schema: Schema;
  actionId: string;
  from: number;
  to: number;
  contentOverride?: JSONContent;
}): ReplaceRangeWithCatalogNodeCheckedResult<TTransform> {
  const nodeResult = createCatalogNodeChecked({
    catalog,
    schema,
    actionId,
    ...(contentOverride ? { contentOverride } : {}),
  });
  if (!nodeResult.ok) return nodeResult;

  return replaceRangeWithCheckedNode({
    action: nodeResult.item,
    node: nodeResult.node,
    tr,
    from,
    to,
  });
}

function createInsertActionNodeChecked({
  action,
  schema,
  contentOverride,
}: {
  action: InsertAction;
  schema: Schema;
  contentOverride?: JSONContent;
}): CreateCatalogNodeCheckedResult {
  try {
    const node = schema.nodeFromJSON(contentOverride ?? action.content());
    node.check();
    return { ok: true, item: action, node };
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: "invalid_catalog_content",
        message:
          error instanceof Error
            ? error.message
            : `Insert action "${action.id}" produced invalid content.`,
      },
    };
  }
}

function replaceRangeWithCheckedNode<TTransform extends Transform>({
  action,
  node,
  tr,
  from,
  to,
}: {
  action: InsertAction;
  node: ProseMirrorNode;
  tr: TTransform;
  from: number;
  to: number;
}): ReplaceRangeWithCatalogNodeCheckedResult<TTransform> {
  const replaceResult = replaceRangeWithNodeChecked({ tr, from, to, node });
  if (!replaceResult.ok) return replaceResult;
  return { ok: true, item: action, node, tr: replaceResult.tr };
}

export function insertCatalogItemChecked(
  editor: Editor,
  item: InsertAction,
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
  surfaceVariants: SurfaceVariantLookup,
  range: InsertActionCheckedRange = {
    from: editor.state.selection.from,
    to: editor.state.selection.to,
  },
  intent: InsertActionIntent = "ordinary",
): boolean {
  const placement = resolveInsertActionPlacement({
    blockDefinitions,
    editor,
    intent,
    item,
    layoutDefinitions,
    range,
    surfaceVariants,
  });
  if (!placement.ok) return false;
  editor.commands.focus();

  const nodeResult = createInsertActionNodeChecked({
    action: item,
    schema: editor.schema,
  });
  if (!nodeResult.ok) return false;

  const node = materializeCatalogNodeHorizontalAlignment({
    blockDefinitions,
    doc: editor.state.doc,
    from: placement.range.from,
    to: placement.range.to,
    node: nodeResult.node,
  });
  const result = replaceRangeWithCheckedNode({
    action: item,
    node,
    tr: editor.state.tr,
    from: placement.range.from,
    to: placement.range.to,
  });
  if (!result.ok) return false;
  if (result.tr.doc.eq(editor.state.doc)) return false;

  setSelectionNearInsertedNode(result.tr, node, placement.range.from);
  const docBeforeDispatch = editor.state.doc;
  editor.view.dispatch(result.tr.scrollIntoView());
  return !editor.state.doc.eq(docBeforeDispatch);
}

function setSelectionNearInsertedNode(
  tr: Transaction,
  insertedNode: ProseMirrorNode,
  fallbackFrom: number,
): void {
  const insertedStart = findNodePositionByIdentity(tr.doc, insertedNode);
  if (insertedStart !== null && insertedNode.isAtom && isNodeSelectable(insertedNode)) {
    if (!setNodeSelectionInTransaction(tr, insertedStart)) {
      throw new Error("Expected the inserted selectable atomic node to accept NodeSelection.");
    }
    return;
  }

  const selectionStart = insertedStart ?? tr.mapping.map(fallbackFrom, 1);
  const selectionPos = Math.max(0, Math.min(selectionStart + 1, tr.doc.content.size));
  tr.setSelection(Selection.near(tr.doc.resolve(selectionPos), 1));
}

function findNodePositionByIdentity(doc: ProseMirrorNode, target: ProseMirrorNode): number | null {
  let found: number | null = null;
  doc.descendants((node, position) => {
    if (node !== target) return true;
    found = position;
    return false;
  });
  return found;
}
