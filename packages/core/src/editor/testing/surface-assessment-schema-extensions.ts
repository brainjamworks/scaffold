import type { AnyExtension } from "@tiptap/core";

import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentChoicesGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-choices-group";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import {
  SelectableChoiceBodyNode,
  SelectableChoiceNode,
} from "@/editor/blocks/assessment/shared/nodes/selectable-choice";
import { SurfaceMultipleChoiceQuestionNode } from "@/editor/surfaces/model/assessment/surface-multiple-choice-question-node";

/**
 * The smallest production assessment-question schema cluster used by focused
 * Surface tests that do not otherwise install an assessment Block.
 */
export const surfaceAssessmentQuestionSchemaExtensions: readonly AnyExtension[] = Object.freeze([
  SurfaceMultipleChoiceQuestionNode,
  AssessmentTitleNode,
  AssessmentInstructionsNode,
  AssessmentPromptNode,
  AssessmentChoicesGroupNode,
  SelectableChoiceNode,
  SelectableChoiceBodyNode,
  AssessmentActionsGroupNode,
  AssessmentHintsGroupNode,
  AssessmentHintNode,
  AssessmentSummaryFeedbackNode,
]);
