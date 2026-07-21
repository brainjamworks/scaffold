import type { Editor } from "@tiptap/core";
import type { Schema, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Fragment } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

import { isActiveBoundedContainerAtPosition } from "@/editor/bounded-containers/model/bounded-container-structure-policy";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { cloneJsonWithNewStableIds } from "@/document/model/identity/clone-with-new-ids";
import { isValidDocPos } from "@/editor/prosemirror/position/document-position";
import {
  setNonDestructiveSelectionNearInTransaction,
  setNodeSelectionInTransaction,
} from "@/editor/selection/selection-transactions";
import {
  VerticalContentPositionSchema,
  type VerticalContentPosition,
} from "@/schemas/course-document";

import type { LayoutRegistry } from "./layout-registry";

export function createLayoutTemplate(
  schema: Schema,
  layoutId: string,
  layoutRegistry: LayoutRegistry,
  options: Record<string, unknown> = {},
): ProseMirrorNode | null {
  const definition = layoutRegistry.getById(layoutId);
  if (!definition) return null;

  try {
    const node = schema.nodeFromJSON(definition.createContent({ options }));
    if (node.type.name !== "layout") return null;
    if (!layoutHasStableIds(node)) return null;
    node.check();
    return node;
  } catch {
    return null;
  }
}

export function canAppendLayoutSectionAt(
  editor: Editor,
  layoutPos: number | null,
  layoutRegistry: LayoutRegistry,
): boolean {
  if (layoutPos === null) return false;
  if (!isValidDocPos(editor.state.doc, layoutPos)) return false;
  const layout = editor.state.doc.nodeAt(layoutPos);
  if (!layout || layout.type.name !== "layout") return false;
  if (!hasStableStringId(layout)) return false;
  return Boolean(layoutRegistry.getForNode(layout)?.section?.create);
}

export function appendLayoutSectionAt(
  editor: Editor,
  layoutPos: number | null,
  layoutRegistry: LayoutRegistry,
): boolean {
  if (layoutPos === null) return false;
  if (!isValidDocPos(editor.state.doc, layoutPos)) return false;
  const layout = editor.state.doc.nodeAt(layoutPos);
  if (!layout || layout.type.name !== "layout") return false;
  if (!hasStableStringId(layout)) return false;
  const definition = layoutRegistry.getForNode(layout);
  const createSection = definition?.section?.create;
  if (!createSection) return false;

  try {
    const section = editor.state.schema.nodeFromJSON(
      createSection({
        index: layout.childCount,
        layout,
      }),
    );
    if (section.type.name !== "section") return false;
    if (!hasStableStringId(section)) return false;

    const insertPos = layoutPos + layout.nodeSize - 1;
    const tr = editor.state.tr.insert(insertPos, section);
    tr.doc.check();
    setNonDestructiveSelectionNearInTransaction(tr, insertPos + 1);
    editor.view.dispatch(tr.scrollIntoView());
    return true;
  } catch {
    return false;
  }
}

export function duplicateLayoutAt(editor: Editor, layoutPos: number): boolean {
  if (!isValidDocPos(editor.state.doc, layoutPos)) return false;
  const layout = editor.state.doc.nodeAt(layoutPos);
  if (!layout || layout.type.name !== "layout") return false;

  try {
    const clone = editor.state.schema.nodeFromJSON(cloneJsonWithNewStableIds(layout.toJSON()));
    const insertPos = layoutPos + layout.nodeSize;
    const tr = editor.state.tr.insert(insertPos, clone);
    if (!setNodeSelectionInTransaction(tr, insertPos)) return false;
    return dispatchChecked(editor, tr);
  } catch {
    return false;
  }
}

export function deleteLayoutAt(editor: Editor, layoutPos: number): boolean {
  if (!isValidDocPos(editor.state.doc, layoutPos)) return false;
  const layout = editor.state.doc.nodeAt(layoutPos);
  if (!layout || layout.type.name !== "layout") return false;

  try {
    const tr = editor.state.tr.delete(layoutPos, layoutPos + layout.nodeSize);
    return dispatchChecked(editor, tr);
  } catch {
    return false;
  }
}

export function duplicateLayoutSectionAt(editor: Editor, sectionPos: number): boolean {
  if (!isValidDocPos(editor.state.doc, sectionPos)) return false;
  const section = editor.state.doc.nodeAt(sectionPos);
  if (!section || section.type.name !== "section") return false;

  try {
    const clone = editor.state.schema.nodeFromJSON(cloneJsonWithNewStableIds(section.toJSON()));
    const insertPos = sectionPos + section.nodeSize;
    const tr = editor.state.tr.insert(insertPos, clone);
    if (!setNodeSelectionInTransaction(tr, insertPos)) return false;
    return dispatchChecked(editor, tr);
  } catch {
    return false;
  }
}

export function deleteLayoutSectionAt(editor: Editor, sectionPos: number): boolean {
  if (!isValidDocPos(editor.state.doc, sectionPos)) return false;
  const section = editor.state.doc.nodeAt(sectionPos);
  if (!section || section.type.name !== "section") return false;

  const owner = findOwningLayout(editor.state.doc, sectionPos);
  if (!owner) return false;

  try {
    const tr =
      owner.node.childCount === 1
        ? editor.state.tr.delete(owner.pos, owner.pos + owner.node.nodeSize)
        : editor.state.tr.delete(sectionPos, sectionPos + section.nodeSize);
    return dispatchChecked(editor, tr);
  } catch {
    return false;
  }
}

export function setLayoutSectionVerticalPositionAt(
  editor: Editor,
  sectionPos: number,
  value: VerticalContentPosition,
  blockDefinitions: BlockDefinitionLookup,
): boolean {
  const tr = setLayoutSectionVerticalPositionInTransaction(
    editor.state.tr,
    sectionPos,
    value,
    blockDefinitions,
  );
  if (!tr) return false;
  return dispatchChecked(editor, tr);
}

export function setLayoutSectionVerticalPositionInTransaction(
  tr: Transaction,
  sectionPos: number,
  value: VerticalContentPosition,
  blockDefinitions: BlockDefinitionLookup,
): Transaction | null {
  if (!isValidDocPos(tr.doc, sectionPos)) return null;
  const section = tr.doc.nodeAt(sectionPos);
  if (!section || section.type.name !== "section") return null;
  if (
    !isActiveBoundedContainerAtPosition({
      blockDefinitions,
      containerType: "section",
      doc: tr.doc,
      pos: sectionPos,
    })
  ) {
    return null;
  }

  const parsed = VerticalContentPositionSchema.safeParse(value);
  if (!parsed.success) return null;

  try {
    tr.setNodeMarkup(sectionPos, undefined, {
      ...section.attrs,
      verticalPosition: parsed.data,
    });
    tr.doc.check();
    return tr;
  } catch {
    return null;
  }
}

export function reorderLayoutSectionAt(
  editor: Editor,
  sourceSectionPos: number,
  targetLayoutPos: number,
  targetIndex: number,
): boolean {
  const tr = reorderLayoutSectionInTransaction(
    editor.state.tr,
    sourceSectionPos,
    targetLayoutPos,
    targetIndex,
  );
  if (!tr) return false;

  try {
    if (tr.doc.eq(editor.state.doc)) return false;
    tr.doc.check();
    editor.view.dispatch(tr.scrollIntoView());
    return true;
  } catch {
    return false;
  }
}

export function reorderLayoutSectionInTransaction(
  tr: Transaction,
  sourceSectionPos: number,
  targetLayoutPos: number,
  targetIndex: number,
): Transaction | null {
  if (!isValidDocPos(tr.doc, sourceSectionPos)) return null;
  if (!isValidDocPos(tr.doc, targetLayoutPos)) return null;
  const sourceSection = tr.doc.nodeAt(sourceSectionPos);
  const targetLayout = tr.doc.nodeAt(targetLayoutPos);
  if (!sourceSection || sourceSection.type.name !== "section") return null;
  if (!targetLayout || targetLayout.type.name !== "layout") return null;

  const sourceOwner = findOwningLayout(tr.doc, sourceSectionPos);
  if (!sourceOwner) return null;
  if (sourceOwner.pos !== targetLayoutPos) return null;
  if (!Number.isInteger(targetIndex) || targetIndex < 0) return null;
  if (targetIndex >= targetLayout.childCount) return null;
  if (sourceOwner.index === targetIndex) return null;

  const sections = Array.from({ length: targetLayout.childCount }, (_, index) =>
    targetLayout.child(index),
  );
  const [movedSection] = sections.splice(sourceOwner.index, 1);
  if (!movedSection) return null;
  sections.splice(targetIndex, 0, movedSection);

  try {
    const nextLayout = targetLayout.type.createChecked(
      targetLayout.attrs,
      Fragment.fromArray(sections),
      targetLayout.marks,
    );

    tr.replaceWith(targetLayoutPos, targetLayoutPos + targetLayout.nodeSize, nextLayout);
    tr.doc.check();
    return tr;
  } catch {
    return null;
  }
}

function findOwningLayout(
  doc: ProseMirrorNode,
  sectionPos: number,
): { index: number; node: ProseMirrorNode; pos: number } | null {
  try {
    if (!isValidDocPos(doc, sectionPos)) return null;
    const resolved = doc.resolve(sectionPos);
    if (resolved.parent.type.name === "layout") {
      return {
        index: resolved.index(),
        node: resolved.parent,
        pos: resolved.before(resolved.depth),
      };
    }
  } catch {
    return null;
  }

  return null;
}

function layoutHasStableIds(layout: ProseMirrorNode): boolean {
  if (!hasStableStringId(layout)) return false;

  let valid = true;
  layout.forEach((child) => {
    if (child.type.name === "section" && !hasStableStringId(child)) {
      valid = false;
    }
  });
  return valid;
}

function hasStableStringId(node: ProseMirrorNode): boolean {
  const id = node.attrs["id"];
  return typeof id === "string" && id.length > 0;
}

function dispatchChecked(editor: Editor, tr: Transaction): boolean {
  if (tr.doc.eq(editor.state.doc)) return false;

  try {
    tr.doc.check();
    editor.view.dispatch(tr.scrollIntoView());
    return true;
  } catch {
    return false;
  }
}
