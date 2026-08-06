import type { Editor } from "@tiptap/core";
import {
  DropdownPrivateAssessmentSchema,
  McqPrivateAssessmentSchema,
  MultiselectPrivateAssessmentSchema,
  type AssessmentFeedbackContent,
} from "@scaffold/contracts";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { resolveAssessmentAttrParent } from "./private-assessment-attrs";

const MINIMUM_CHOICE_COUNT = 1;

/** Deletes a choice and its private answer-key/feedback references in one transaction. */
export function deleteAssessmentChoice(editor: Editor, choicePos: number): boolean {
  if (!isValidEditorDocPos(editor, choicePos)) return false;
  const choice = editor.state.doc.nodeAt(choicePos);
  if (!choice) return false;
  const choiceType = choice.type.name;
  if (choiceType !== "selectable_choice" && choiceType !== "dropdown_choice") return false;

  const $choice = editor.state.doc.resolve(choicePos);
  let siblingCount = 0;
  $choice.parent.forEach((sibling) => {
    if (sibling.type.name === choiceType) siblingCount += 1;
  });
  if (siblingCount <= MINIMUM_CHOICE_COUNT) return false;

  const choiceId = String(choice.attrs["id"] ?? "");
  if (!choiceId) return false;
  const allowedParents =
    choiceType === "dropdown_choice" ? (["dropdown"] as const) : (["mcq", "multiselect"] as const);
  const parent = resolveAssessmentAttrParent(editor, choicePos, allowedParents);
  if (!parent) return false;

  const nextAssessment = (() => {
    if (parent.typeName === "mcq") {
      const assessment = McqPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
      return {
        ...assessment,
        correctOptionId:
          assessment.correctOptionId === choiceId ? null : assessment.correctOptionId,
        feedbackByOptionId: withoutChoiceFeedback(assessment.feedbackByOptionId, choiceId),
      };
    }
    if (parent.typeName === "multiselect") {
      const assessment = MultiselectPrivateAssessmentSchema.parse(
        parent.node.attrs["assessment"] ?? {},
      );
      return {
        ...assessment,
        correctOptionIds: assessment.correctOptionIds.filter((id) => id !== choiceId),
        feedbackByOptionId: withoutChoiceFeedback(assessment.feedbackByOptionId, choiceId),
      };
    }
    const assessment = DropdownPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
    return {
      ...assessment,
      correctOptionId: assessment.correctOptionId === choiceId ? null : assessment.correctOptionId,
      feedbackByOptionId: withoutChoiceFeedback(assessment.feedbackByOptionId, choiceId),
    };
  })();

  const transaction = editor.state.tr
    .setNodeMarkup(parent.pos, null, {
      ...parent.node.attrs,
      assessment: nextAssessment,
    })
    .delete(choicePos, choicePos + choice.nodeSize)
    .scrollIntoView();
  editor.view.focus();
  editor.view.dispatch(transaction);
  return true;
}

function withoutChoiceFeedback(
  feedbackByOptionId: Record<string, AssessmentFeedbackContent>,
  choiceId: string,
): Record<string, AssessmentFeedbackContent> {
  const next = { ...feedbackByOptionId };
  delete next[choiceId];
  return next;
}
