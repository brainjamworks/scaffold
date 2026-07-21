import type { Extensions, Node as TiptapNode } from "@tiptap/core";

import { CellRuntimeNode, GridRuntimeNode } from "@/editor/arrangements/grid/runtime/grid-nodes";
import {
  LayoutRuntimeNode,
  SectionRuntimeNode,
} from "@/editor/arrangements/layout/runtime/layout-nodes";
import { createRuntimeBlockExtensions } from "@/editor/blocks/runtime-block-extensions";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { AssessmentActionsGroupRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group-runtime";
import { AssessmentChoicesGroupRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-choices-group-runtime";
import { AssessmentHintRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint-runtime";
import { AssessmentHintsGroupRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group-runtime";
import { AssessmentSummaryFeedbackRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback-runtime";
import { SelectableChoiceRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/selectable-choice-runtime";
import { InlineIconRuntimeNode } from "@/editor/rich-text/inline-icon/runtime/InlineIconRuntimeNode";
import { MathInlineRuntimeNode } from "@/editor/rich-text/math/runtime/MathInlineRuntime";
import { VocabularyTermRuntimeNode } from "@/editor/rich-text/vocabulary-term/runtime/VocabularyTermRuntimeNode";
import { createCourseDocumentBaseExtensions } from "@/composition/model/create-document-composition";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { createSurfaceRuntimeNode } from "@/editor/surfaces/runtime/nodes/surface-runtime-node";
import { builtInSurfaceRuntimeViewMap } from "@/editor/surfaces/runtime/surface-runtime-views";
import { StudentGuard } from "@/runtime/guards/student-guard";
import "@/editor/rich-text/view/text-alignment.css";

const builtInSurfaceRuntimeNode = createSurfaceRuntimeNode({
  registry: builtInSurfaceVariantRegistry,
  views: builtInSurfaceRuntimeViewMap,
});

export function createCourseDocumentRuntimeExtensions({
  surfaceNode = builtInSurfaceRuntimeNode,
}: {
  surfaceNode?: TiptapNode;
} = {}): Extensions {
  return [
    ...createCourseDocumentBaseExtensions({
      assessmentActionsGroupNode: AssessmentActionsGroupRuntimeNode,
      assessmentChoicesGroupNode: AssessmentChoicesGroupRuntimeNode,
      assessmentHintNode: AssessmentHintRuntimeNode,
      assessmentHintsGroupNode: AssessmentHintsGroupRuntimeNode,
      assessmentSummaryFeedbackNode: AssessmentSummaryFeedbackRuntimeNode,
      blockStableIdNodeTypes: builtInBlockRegistry.stableIdNodeTypes,
      cellNode: CellRuntimeNode,
      gridNode: GridRuntimeNode,
      inlineIconNode: InlineIconRuntimeNode,
      layoutNode: LayoutRuntimeNode,
      mathInlineNode: MathInlineRuntimeNode,
      selectableChoiceNode: SelectableChoiceRuntimeNode,
      resizableBlockNodeTypes: builtInBlockRegistry.resizableNodeTypes,
      sectionNode: SectionRuntimeNode,
      surfaceNode,
      studentGuardExtension: StudentGuard,
      updateDocumentIds: false,
      vocabularyTermNode: VocabularyTermRuntimeNode,
    }),
    ...createRuntimeBlockExtensions(builtInBlockRegistry),
  ];
}
