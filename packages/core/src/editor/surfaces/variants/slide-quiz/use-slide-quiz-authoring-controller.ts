import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useMemo, useState } from "react";

import { requireLayerMutationAccessForState } from "@/document/authoring/layers/layer-editing-boundaries";
import { replaceRangeWithNodeChecked } from "@/document/model/commands/checked-transactions";
import {
  deleteQuizQuestion,
  duplicateQuizQuestion,
  getQuizAssessmentCatalogItems,
  moveQuizQuestion,
  reorderQuizQuestion,
} from "@/editor/assessment/quiz/quiz-authoring";
import { getQuizSummary } from "@/editor/assessment/quiz/quiz-shared";
import type { InsertAction } from "@/editor/insertion/insert-action";
import { SURFACE_CATEGORISE_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-categorise-question-node";
import { SURFACE_DROPDOWN_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-dropdown-question-node";
import { SURFACE_DRAG_DROP_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-drag-drop-question-node";
import { SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-fill-blanks-question-node";
import { SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-image-hotspot-question-node";
import { SURFACE_MATCHING_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-matching-question-node";
import { SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-multiple-choice-question-node";
import { SURFACE_MULTISELECT_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-multiselect-question-node";
import {
  requireSurfaceQuizChild,
  surfaceQuizQuestionKeysNeedingSetup,
  SURFACE_QUIZ_NODE_TYPE,
} from "@/editor/surfaces/model/assessment/surface-quiz-node";
import { SURFACE_SEQUENCING_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-sequencing-question-node";
import { createQuizQuestion } from "@/editor/surfaces/model/templates/assessment/slide-quiz";

const PRIVATE_NODE_TYPE_BY_BLOCK_NODE_TYPE = new Map<string, string>([
  ["mcq", SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE],
  ["multiselect", SURFACE_MULTISELECT_QUESTION_NODE_TYPE],
  ["dropdown", SURFACE_DROPDOWN_QUESTION_NODE_TYPE],
  ["drag_drop", SURFACE_DRAG_DROP_QUESTION_NODE_TYPE],
  ["fill_blanks", SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE],
  ["categorise", SURFACE_CATEGORISE_QUESTION_NODE_TYPE],
  ["sequencing", SURFACE_SEQUENCING_QUESTION_NODE_TYPE],
  ["matching", SURFACE_MATCHING_QUESTION_NODE_TYPE],
  ["image_hotspot", SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE],
]);

export function useSlideQuizAuthoringController({
  editor,
  getPos,
  surface,
}: {
  editor: Editor;
  getPos: (() => number | undefined) | boolean;
  surface: ProseMirrorNode;
}) {
  const quiz = requireSurfaceQuizChild(surface);
  const summary = useMemo(() => getQuizSummary(quiz), [quiz]);
  const questionKeysNeedingSetup = useMemo(() => surfaceQuizQuestionKeysNeedingSetup(quiz), [quiz]);
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const activeChildKey =
    activeChildId && summary.childKeys.includes(activeChildId)
      ? activeChildId
      : (summary.childKeys[0] ?? null);
  const activeChildIndex = activeChildKey ? summary.childKeys.indexOf(activeChildKey) : -1;
  const getQuizPos = (): number | undefined => resolveCurrentQuizPos(editor, getPos, surface);
  const assessmentCatalogItems = useMemo(
    () => privateQuizCatalogItems(getQuizAssessmentCatalogItems(editor)),
    [editor],
  );

  return {
    actions: {
      addQuestion: (actionId: string) => {
        const quizPos = getQuizPos();
        if (quizPos === undefined) return;
        const questionJson = createQuizQuestion(actionId);
        const question = editor.schema.nodeFromJSON(questionJson);
        const currentQuiz = editor.state.doc.nodeAt(quizPos);
        if (!currentQuiz || currentQuiz.type.name !== SURFACE_QUIZ_NODE_TYPE) {
          throw new Error("Quiz Surface authoring owner is no longer mounted.");
        }
        const insertAt = quizPos + currentQuiz.nodeSize - 1;
        const result = replaceRangeWithNodeChecked({
          tr: editor.state.tr,
          from: insertAt,
          node: question,
          to: insertAt,
          layerAccess: requireLayerMutationAccessForState(editor.state),
        });
        if (!result.ok) return;
        editor.view.dispatch(result.tr.scrollIntoView());
        const id = question.attrs["id"];
        if (typeof id === "string") setActiveChildId(id);
      },
      deleteQuestion: () => {
        if (activeChildIndex < 0) return;
        setActiveChildId(
          deleteQuizQuestion({ editor, getPos: getQuizPos, index: activeChildIndex, node: quiz }),
        );
      },
      duplicateQuestion: () => {
        if (activeChildIndex < 0) return;
        const id = duplicateQuizQuestion({
          editor,
          getPos: getQuizPos,
          index: activeChildIndex,
          node: quiz,
        });
        if (id) setActiveChildId(id);
      },
      moveQuestion: (childKey: string, index: number, direction: "up" | "down") => {
        if (moveQuizQuestion({ direction, editor, getPos: getQuizPos, index, node: quiz })) {
          setActiveChildId(childKey);
        }
      },
      reorderQuestion: (sourceKey: string, targetKey: string) => {
        if (reorderQuizQuestion({ editor, getPos: getQuizPos, node: quiz, sourceKey, targetKey })) {
          setActiveChildId(sourceKey);
        }
      },
      selectAuthoringChild: setActiveChildId,
    },
    activeChildIndex,
    activeChildKey,
    activeChildNode: activeChildIndex >= 0 ? quiz.child(activeChildIndex) : null,
    assessmentCatalogItems,
    childCount: summary.childCount,
    childKeys: summary.childKeys,
    childTypes: summary.childTypes,
    isEmpty: summary.isEmpty,
    quiz,
    quizViewId: summary.quizViewId,
    questionKeysNeedingSetup,
    settings: summary.settings,
    totalPoints: summary.totalPoints,
  };
}

function privateQuizCatalogItems(items: readonly InsertAction[]): readonly InsertAction[] {
  return items.flatMap((item) => {
    const nodeType = PRIVATE_NODE_TYPE_BY_BLOCK_NODE_TYPE.get(item.nodeType);
    return nodeType ? [{ ...item, id: nodeType, nodeType }] : [];
  });
}

function resolveCurrentQuizPos(
  editor: Editor,
  getPos: (() => number | undefined) | boolean,
  expectedSurface: ProseMirrorNode,
): number | undefined {
  if (typeof getPos !== "function") return undefined;
  const surfacePos = getPos();
  if (typeof surfacePos !== "number") return undefined;
  const currentSurface = editor.state.doc.nodeAt(surfacePos);
  if (
    currentSurface?.type.name !== "surface" ||
    currentSurface.attrs["id"] !== expectedSurface.attrs["id"]
  ) {
    throw new Error("Quiz Surface authoring owner is no longer mounted.");
  }
  let quizPos: number | undefined;
  currentSurface.forEach((child, offset) => {
    if (child.type.name !== SURFACE_QUIZ_NODE_TYPE) return;
    if (quizPos !== undefined) throw new Error("Quiz Surface contains more than one private Quiz.");
    quizPos = surfacePos + 1 + offset;
  });
  return quizPos;
}
