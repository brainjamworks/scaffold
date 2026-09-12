import type { AnyExtension } from "@tiptap/core";

import {
  DropdownChoiceLabelNode,
  DropdownChoiceNode,
  DropdownChoicesGroupNode,
} from "@/editor/blocks/assessment/dropdown/dropdown-choice";
import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import { SurfaceDropdownQuestionNode } from "@/editor/surfaces/model/assessment/surface-dropdown-question-node";

/**
 * Production assessment-question schema for movement fixtures that own custom
 * assessment_choices_group and selectable_choice nodes.
 */
export const movementSurfaceDropdownQuestionSchemaExtensions: readonly AnyExtension[] =
  Object.freeze([
    SurfaceDropdownQuestionNode,
    AssessmentTitleNode,
    AssessmentInstructionsNode,
    AssessmentPromptNode,
    DropdownChoicesGroupNode,
    DropdownChoiceNode,
    DropdownChoiceLabelNode,
    AssessmentActionsGroupNode,
    AssessmentHintsGroupNode,
    AssessmentHintNode,
    AssessmentSummaryFeedbackNode,
  ]);
