import type { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Fragment } from "@tiptap/pm/model";

import { getScaffoldAuthoringCataloguesForEditor } from "@/composition/extensions/scaffold-authoring-catalogues-storage";
import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import { requireLayerMutationAccessForState } from "@/document/authoring/layers/layer-editing-boundaries";
import {
  deleteNodeChecked,
  replaceRangeWithNodeChecked,
} from "@/document/model/commands/checked-transactions";
import type { BlockDefinitionLookup, BlockRegistry } from "@/editor/blocks/block-registry";
import { materializeCatalogNodeHorizontalAlignment } from "@/editor/interactions/alignment/alignment-insertion";
import {
  createInteractionTargetRef,
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import {
  moveSiblingNode,
  moveSiblingNodeTo,
} from "@/editor/prosemirror/move-sibling/move-sibling-node";
import { ASSESSMENT_QUESTION_CONTENT } from "@/document/model/content-model/content-groups";
import { cloneJsonWithNewStableIds } from "@/document/model/identity/clone-with-new-ids";
import { createCatalogNodeChecked } from "@/editor/insertion/checked-insertion";
import type { InsertCatalog } from "@/editor/insertion/insert-catalog";
import type { InsertAction } from "@/editor/insertion/insert-action";
import type { ScaffoldBlockContext } from "@/editor/selection/block-context";

import { getQuizChildKeys as getSharedQuizChildKeys } from "@/editor/assessment/quiz/quiz-shared";

export function getQuizAssessmentCatalogItems(editor: Editor): readonly InsertAction[] {
  const { blockDefinitions, catalog } = getQuizAuthoringInputs(editor);
  const assessmentNodeTypes = new Set(blockDefinitions.assessmentNodeTypes);

  return catalog.actions.filter((item) => {
    if (!assessmentNodeTypes.has(item.nodeType)) return false;
    const nodeType = editor.schema.nodes[item.nodeType];
    if (!nodeType) return false;
    return nodeType.spec.group?.split(/\s+/).includes(ASSESSMENT_QUESTION_CONTENT) ?? false;
  });
}

export function addQuizQuestion({
  actionId,
  editor,
  getPos,
  node,
}: {
  actionId: string;
  editor: Editor;
  getPos: (() => number | undefined) | undefined;
  node: ProseMirrorNode;
}): string | null {
  if (typeof getPos !== "function") return null;

  const pos = getPos();
  if (typeof pos !== "number") return null;

  const insertAt = pos + node.nodeSize - 1;
  const { blockDefinitions, catalog } = getQuizAuthoringInputs(editor);
  const nodeResult = createCatalogNodeChecked({
    catalog,
    schema: editor.schema,
    actionId,
  });
  if (!nodeResult.ok) return null;

  const question = materializeCatalogNodeHorizontalAlignment({
    blockDefinitions,
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
    layerAccess: requireLayerMutationAccessForState(editor.state),
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

export function reorderQuizQuestion({
  editor,
  getPos,
  node,
  sourceKey,
  targetKey,
}: {
  editor: Editor;
  getPos: (() => number | undefined) | undefined;
  node: ProseMirrorNode;
  sourceKey: string;
  targetKey: string;
}): boolean {
  const quizPos = getQuizPos(getPos);
  if (quizPos === null || sourceKey === targetKey) return false;

  const sourceIndex = quizChildIndexById(node, sourceKey);
  const targetIndex = quizChildIndexById(node, targetKey);
  if (sourceIndex < 0 || targetIndex < 0) return false;

  const sourcePos = quizChildPosAt(node, quizPos, sourceIndex);
  const targetPos = quizChildPosAt(node, quizPos, targetIndex);
  if (sourcePos === null || targetPos === null) return false;

  return moveSiblingNodeTo(
    editor,
    sourcePos,
    targetPos,
    sourceIndex < targetIndex ? "after" : "before",
  );
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
  const cloneJson = cloneJsonWithNewStableIds(sourceJson, {
    identityRewrites: getScaffoldCapabilitiesForEditor(editor).contentIdentity.rewrites,
  });
  const duplicatedId = cloneJson.attrs?.["id"];
  if (typeof duplicatedId !== "string") return null;
  let clone: ProseMirrorNode;
  try {
    clone = source.type.schema.nodeFromJSON(cloneJson);
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
    layerAccess: requireLayerMutationAccessForState(editor.state),
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

function quizChildIndexById(node: ProseMirrorNode, childId: string): number {
  for (let index = 0; index < node.childCount; index += 1) {
    if (quizChildIdAt(node, index) === childId) return index;
  }
  return -1;
}

function getQuizAuthoringInputs(editor: Editor): {
  blockDefinitions: BlockRegistry;
  catalog: InsertCatalog;
} {
  return {
    blockDefinitions: getScaffoldCapabilitiesForEditor(editor).blocks.registry,
    catalog: getScaffoldAuthoringCataloguesForEditor(editor).inDocument,
  };
}
