import type { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Fragment } from "@tiptap/pm/model";

import {
  deleteNodeChecked,
  replaceRangeWithNodeChecked,
} from "@/document/model/commands/checked-transactions";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { materializeCatalogNodeHorizontalAlignment } from "@/editor/interactions/alignment/alignment-insertion";
import {
  createInteractionTargetRef,
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { moveSiblingNode } from "@/editor/prosemirror/move-sibling/move-sibling-node";
import { ASSESSMENT_QUESTION_CONTENT } from "@/document/model/content-model/content-groups";
import { cloneJsonWithNewStableIds } from "@/document/model/identity/clone-with-new-ids";
import { createStableId } from "@/document/model/identity/stable-ids";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { createCatalogNodeChecked } from "@/editor/insertion/checked-insertion";
import type { InsertAction } from "@/editor/insertion/insert-action";
import type { ScaffoldBlockContext } from "@/editor/selection/block-context";

import { getQuizChildKeys as getSharedQuizChildKeys } from "./quiz-shared";

export function getQuizAssessmentCatalogItems(editor: Editor): readonly InsertAction[] {
  const assessmentNodeTypes = new Set(builtInBlockRegistry.assessmentNodeTypes);

  return builtInInsertCatalog.actions.filter((item) => {
    if (!assessmentNodeTypes.has(item.nodeType)) return false;
    const nodeType = editor.schema.nodes[item.nodeType];
    if (!nodeType) return false;
    return nodeType.spec.group?.split(/\s+/).includes(ASSESSMENT_QUESTION_CONTENT) ?? false;
  });
}

export function addQuizQuestion({
  catalogId,
  editor,
  getPos,
  node,
}: {
  catalogId: string;
  editor: Editor;
  getPos: (() => number | undefined) | undefined;
  node: ProseMirrorNode;
}): string | null {
  if (typeof getPos !== "function") return null;

  const pos = getPos();
  if (typeof pos !== "number") return null;

  const insertAt = pos + node.nodeSize - 1;
  const nodeResult = createCatalogNodeChecked({
    catalog: builtInInsertCatalog,
    schema: editor.schema,
    catalogId,
  });
  if (!nodeResult.ok) return null;

  const question = materializeCatalogNodeHorizontalAlignment({
    blockDefinitions: builtInBlockRegistry,
    doc: editor.state.doc,
    from: insertAt,
    node: nodeResult.node,
    owner: { contentStart: pos + 1, node },
    to: insertAt,
  });
  const result = replaceRangeWithNodeChecked({
    tr: editor.state.tr,
    from: insertAt,
    node: question,
    to: insertAt,
  });
  if (!result.ok) return null;

  const insertedId = question.attrs["id"];
  editor.view.dispatch(result.tr.scrollIntoView());
  return typeof insertedId === "string" ? insertedId : null;
}

export function moveQuizQuestion({
  direction,
  editor,
  getPos,
  index,
  node,
}: {
  direction: "up" | "down";
  editor: Editor;
  getPos: (() => number | undefined) | undefined;
  index: number;
  node: ProseMirrorNode;
}): boolean {
  if (typeof getPos !== "function") return false;

  const pos = getPos();
  if (typeof pos !== "number") return false;

  const childPos = quizChildPosAt(node, pos, index);
  if (childPos === null) return false;
  return moveSiblingNode(editor, childPos, direction);
}

export function duplicateQuizQuestion({
  editor,
  getPos,
  index,
  node,
}: {
  editor: Editor;
  getPos: (() => number | undefined) | undefined;
  index: number;
  node: ProseMirrorNode;
}): string | null {
  const quizPos = getQuizPos(getPos);
  if (quizPos === null || index < 0 || index >= node.childCount) return null;

  const source = node.child(index);
  const sourceJson = source.toJSON() as JSONContent;
  const duplicatedId = createStableId();
  const cloneJson = cloneJsonWithNewStableIds(sourceJson);
  let clone: ProseMirrorNode;
  try {
    clone = source.type.schema.nodeFromJSON({
      ...cloneJson,
      attrs: {
        ...(cloneJson.attrs ?? {}),
        id: duplicatedId,
      },
    });
  } catch {
    return null;
  }

  const children: ProseMirrorNode[] = [];
  for (let childIndex = 0; childIndex < node.childCount; childIndex += 1) {
    children.push(node.child(childIndex));
    if (childIndex === index) children.push(clone);
  }

  const nextQuiz = node.type.create(node.attrs, Fragment.fromArray(children), node.marks);
  const tr = editor.state.tr.replaceWith(quizPos, quizPos + node.nodeSize, nextQuiz);
  tr.doc.check();
  editor.view.dispatch(tr.scrollIntoView());
  return duplicatedId;
}

export function deleteQuizQuestion({
  editor,
  getPos,
  index,
  node,
}: {
  editor: Editor;
  getPos: (() => number | undefined) | undefined;
  index: number;
  node: ProseMirrorNode;
}): string | null {
  const childPos = getQuizChildPos({ getPos, index, node });
  if (childPos === null) return null;

  const fallbackId = quizChildIdAt(node, index + 1) ?? quizChildIdAt(node, index - 1);
  const result = deleteNodeChecked({
    tr: editor.state.tr,
    pos: childPos,
  });
  if (!result.ok) return null;

  editor.view.dispatch(result.tr.scrollIntoView());
  return fallbackId;
}

export function getQuizChildBlock({
  blockDefinitions,
  getPos,
  index,
  node,
}: {
  blockDefinitions: BlockDefinitionLookup;
  getPos: (() => number | undefined) | undefined;
  index: number;
  node: ProseMirrorNode;
}): ScaffoldBlockContext | null {
  const childPos = getQuizChildPos({ getPos, index, node });
  if (childPos === null) return null;

  const child = node.child(index);
  const definition = blockDefinitions.getByNodeType(child.type.name);
  if (!definition) return null;

  return {
    definition,
    node: child,
    nodeType: child.type.name,
    pos: childPos,
  };
}

export function getQuizChildInteractionTarget({
  getPos,
  index,
  node,
}: {
  getPos: (() => number | undefined) | undefined;
  index: number;
  node: ProseMirrorNode;
}): InteractionTargetRef | null {
  const pos = getQuizChildPos({ getPos, index, node });
  const id = quizChildIdAt(node, index);
  if (pos === null || id === null) return null;

  return createInteractionTargetRef({
    id,
    kind: InteractionTargetKind.Block,
    pos,
  });
}

export function getQuizChildKeys(node: ProseMirrorNode): string[] {
  return getSharedQuizChildKeys(node);
}

function getQuizChildPos({
  getPos,
  index,
  node,
}: {
  getPos: (() => number | undefined) | undefined;
  index: number;
  node: ProseMirrorNode;
}): number | null {
  const quizPos = getQuizPos(getPos);
  if (quizPos === null) return null;

  return quizChildPosAt(node, quizPos, index);
}

function getQuizPos(getPos: (() => number | undefined) | undefined): number | null {
  if (typeof getPos !== "function") return null;
  const quizPos = getPos();
  return typeof quizPos === "number" ? quizPos : null;
}

function quizChildPosAt(node: ProseMirrorNode, quizPos: number, index: number): number | null {
  if (index < 0 || index >= node.childCount) return null;
  let childPos = quizPos + 1;
  for (let i = 0; i < index; i += 1) {
    childPos += node.child(i).nodeSize;
  }
  return childPos;
}

function quizChildIdAt(node: ProseMirrorNode, index: number): string | null {
  if (index < 0 || index >= node.childCount) return null;
  const id = node.child(index).attrs["id"];
  return typeof id === "string" && id.length > 0 ? id : null;
}
