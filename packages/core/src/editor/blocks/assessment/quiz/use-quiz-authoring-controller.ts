import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useMemo, useState } from "react";

import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";

import {
  addQuizQuestion,
  deleteQuizQuestion,
  duplicateQuizQuestion,
  getQuizAssessmentCatalogItems,
  getQuizChildInteractionTarget,
  moveQuizQuestion,
} from "./quiz-authoring";
import { getQuizSummary } from "./quiz-shared";

export function useQuizAuthoringController({
  editor,
  getPos,
  node,
}: {
  editor: Editor;
  getPos: (() => number | undefined) | undefined;
  node: ProseMirrorNode;
}) {
  const quizSummary = useMemo(() => getQuizSummary(node), [node]);
  const { childCount, childKeys, isEmpty, quizViewId, settings } = quizSummary;
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const activeChildKey =
    activeChildId && childKeys.includes(activeChildId) ? activeChildId : (childKeys[0] ?? null);
  const activeChildIndex = activeChildKey ? childKeys.indexOf(activeChildKey) : -1;
  const assessmentCatalogItems = useMemo(() => getQuizAssessmentCatalogItems(editor), [editor]);

  return {
    actions: {
      addQuestion: (catalogId: string) => {
        const insertedId = addQuizQuestion({ catalogId, editor, getPos, node });
        setActiveChildId(insertedId);
      },
      deleteQuestion: () => {
        if (activeChildIndex < 0) return;
        setActiveChildId(deleteQuizQuestion({ editor, getPos, index: activeChildIndex, node }));
      },
      duplicateQuestion: () => {
        if (activeChildIndex < 0) return;
        const duplicatedId = duplicateQuizQuestion({
          editor,
          getPos,
          index: activeChildIndex,
          node,
        });
        if (duplicatedId) setActiveChildId(duplicatedId);
      },
      moveQuestion: (childKey: string, index: number, direction: "up" | "down") => {
        if (moveQuizQuestion({ direction, editor, getPos, index, node })) {
          setActiveChildId(childKey);
        }
      },
      openQuestionSettings: () => {
        if (activeChildIndex < 0) return;
        const target = getQuizChildInteractionTarget({
          getPos,
          index: activeChildIndex,
          node,
        });
        if (!target) return;
        getInteractionFacadeStoreForEditor(editor).getState().commands.openSettings(target);
      },
      selectAuthoringChild: setActiveChildId,
    },
    activeChildIndex,
    activeChildKey,
    assessmentCatalogItems,
    childCount,
    childKeys,
    childTypes: quizSummary.childTypes,
    isEmpty,
    quizViewId,
    settings,
    totalPoints: quizSummary.totalPoints,
  };
}
