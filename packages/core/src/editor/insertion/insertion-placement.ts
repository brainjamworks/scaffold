import type { Editor } from "@tiptap/core";
import type { NodeType } from "@tiptap/pm/model";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import {
  allowsBoundedContainerRootInsertionAtPosition,
  resolveBoundedFillInsertionPolicyAtPosition,
} from "@/editor/bounded-containers/model/bounded-container-placement";
import { resolveBoundedContainerOccupancyPolicy } from "@/editor/content-layout/model/content-layout-bounded-placement";
import { allowsSurfaceRootInsertionAtPosition } from "@/editor/surfaces/model/policies/surface-root-insertion-policy";
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";

import type { InsertAction, InsertActionIntent, InsertActionRange } from "./insert-action";

export interface InsertActionPlacementDependencies {
  readonly blockDefinitions: BlockDefinitionLookup;
  readonly layoutDefinitions: LayoutRegistry;
  readonly surfaceVariants: SurfaceVariantLookup;
}

export type InsertActionPlacementResult =
  | { readonly ok: true; readonly range: InsertActionRange }
  | { readonly ok: false };

export function resolveInsertActionPlacement({
  blockDefinitions,
  editor,
  intent = "ordinary",
  item,
  layoutDefinitions,
  range: explicitRange,
  surfaceVariants,
}: InsertActionPlacementDependencies & {
  readonly editor: Editor;
  readonly intent?: InsertActionIntent;
  readonly item: InsertAction;
  readonly range?: InsertActionRange;
}): InsertActionPlacementResult {
  const { doc } = editor.state;
  if (intent === "slash-trigger-replacement" && explicitRange === undefined) {
    return { ok: false };
  }
  const range = explicitRange ?? {
    from: editor.state.selection.from,
    to: editor.state.selection.to,
  };
  if (!isValidRange(range, doc.content.size)) return { ok: false };

  const nodeType = editor.schema.nodes[item.nodeType];
  if (!nodeType) return { ok: false };
  if (!allowsSurfaceRootInsertionAtPosition(doc, range.from, surfaceVariants)) {
    return { ok: false };
  }

  const insertionContext = resolveInsertionContext(doc, range, nodeType);
  if (!insertionContext) return { ok: false };
  const { $from, parent, parentPos } = insertionContext;

  if (
    !allowsBoundedContainerRootInsertionAtPosition({
      blockDefinitions,
      doc,
      layoutDefinitions,
      pos: parentPos,
      resolveBoundedContainerOccupancyPolicy,
    })
  ) {
    return { ok: false };
  }

  if (item.boundedPlacement !== "fill") return { ok: true, range };
  const fillInsertionPolicy = resolveBoundedFillInsertionPolicyAtPosition({
    blockDefinitions,
    doc,
    layoutDefinitions,
    pos: parentPos,
    resolveBoundedContainerOccupancyPolicy,
  });
  if (
    fillInsertionPolicy.kind === "not-active-bounded-container" ||
    fillInsertionPolicy.kind === "insert-at-checked-range"
  ) {
    return { ok: true, range };
  }

  try {
    if (!$from.parent.isTextblock || $from.parent.type.name !== "paragraph") {
      return { ok: false };
    }
    if (parent.childCount !== 1 || parent.firstChild !== $from.parent) {
      return { ok: false };
    }
    if ($from.parent.content.size > 0 && intent !== "slash-trigger-replacement") {
      return { ok: false };
    }

    const contentFrom = $from.start($from.depth);
    const contentTo = contentFrom + $from.parent.content.size;
    if (range.from !== contentFrom || range.to !== contentTo) {
      return { ok: false };
    }

    return {
      ok: true,
      range: {
        from: $from.before($from.depth),
        to: $from.after($from.depth),
      },
    };
  } catch {
    return { ok: false };
  }
}

function resolveInsertionContext(
  doc: Editor["state"]["doc"],
  range: InsertActionRange,
  nodeType: NodeType,
) {
  try {
    const $from = doc.resolve(range.from);
    const parentDepth = $from.parent.isTextblock && $from.depth > 0 ? $from.depth - 1 : $from.depth;
    const parent = $from.node(parentDepth);
    const index = $from.index(parentDepth);
    if (!parent.contentMatchAt(index).matchType(nodeType)) return null;

    return {
      $from,
      parent,
      parentPos: parentDepth > 0 ? $from.before(parentDepth) : 0,
    };
  } catch {
    return null;
  }
}

function isValidRange(range: InsertActionRange, docSize: number): boolean {
  return (
    Number.isInteger(range.from) &&
    Number.isInteger(range.to) &&
    range.from >= 0 &&
    range.from <= range.to &&
    range.to <= docSize
  );
}
