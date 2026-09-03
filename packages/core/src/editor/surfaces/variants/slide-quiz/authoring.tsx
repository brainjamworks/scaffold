import { BracketsCurlyIcon as BracketsCurly } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { categoriseConfiguration } from "@/editor/blocks/assessment/categorise/categorise-definition";
import { dropdownConfiguration } from "@/editor/blocks/assessment/dropdown/dropdown-definition";
import { dragDropConfiguration } from "@/editor/blocks/assessment/drag-drop/drag-drop-definition";
import {
  applyFillBlankToEditor,
  canApplyFillBlankToEditor,
} from "@/editor/blocks/assessment/fill-blanks/commands";
import { fillBlanksConfiguration } from "@/editor/blocks/assessment/fill-blanks/fill-blanks-definition";
import { imageHotspotConfiguration } from "@/editor/blocks/assessment/image-hotspot/image-hotspot-definition";
import { matchingConfiguration } from "@/editor/blocks/assessment/matching/matching-definition";
import { mcqConfiguration } from "@/editor/blocks/assessment/mcq/mcq-definition";
import { multiselectConfiguration } from "@/editor/blocks/assessment/multiselect/multiselect-definition";
import { QuizEmptyStage } from "@/editor/assessment/quiz/QuizEmptyStage";
import type { ResolvedQuickAction } from "@/editor/assessment/quiz/quick-actions";
import { sequencingConfiguration } from "@/editor/blocks/assessment/sequencing/sequencing-definition";
import { deriveSettingsSheetDefinition } from "@/editor/configuration/settings-sheet-derivation";
import type { ConfigurationDefinition } from "@/editor/configuration/definition";
import { SURFACE_CATEGORISE_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-categorise-question-node";
import { SURFACE_DROPDOWN_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-dropdown-question-node";
import { SURFACE_DRAG_DROP_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-drag-drop-question-node";
import { SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-fill-blanks-question-node";
import { SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-image-hotspot-question-node";
import { SURFACE_MATCHING_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-matching-question-node";
import { SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-multiple-choice-question-node";
import { SURFACE_MULTISELECT_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-multiselect-question-node";
import { SURFACE_SEQUENCING_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-sequencing-question-node";
import {
  ConfigurationSettingsSheet,
  type ConfigurationNodeSettingsSheetDefinition,
} from "@/editor/shell/settings/sheets/ConfigurationSettingsSheet";

import "./styles.css";
import type { SurfaceAuthoringViewProps } from "../../authoring/surface-authoring-view-registry";
import { AssessmentSlideSurfaceAuthoringFrame } from "../../authoring/views/AssessmentSlideSurfaceAuthoringFrame";
import { SlideQuizActiveQuestionStyle } from "./SlideQuizActiveQuestionStyle";
import { SlideQuizAuthoringRail } from "./SlideQuizAuthoringRail";
import { useSlideQuizAuthoringController } from "./use-slide-quiz-authoring-controller";

const MANAGED_QUIZ_CHILD_SETTINGS = new Set([
  "feedbackMode",
  "showAnswer",
  "maxAttempts",
  "isGraded",
]);
const MANAGED_QUIZ_CHILD_SETTINGS_REASON = "Managed by quiz";

const QUESTION_CONFIGURATION_BY_NODE_TYPE = new Map<
  string,
  { configuration: ConfigurationDefinition; title: string }
>([
  [
    SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE,
    { configuration: mcqConfiguration, title: "Multiple choice" },
  ],
  [
    SURFACE_MULTISELECT_QUESTION_NODE_TYPE,
    { configuration: multiselectConfiguration, title: "Multi-select" },
  ],
  [
    SURFACE_DROPDOWN_QUESTION_NODE_TYPE,
    { configuration: dropdownConfiguration, title: "Dropdown" },
  ],
  [
    SURFACE_DRAG_DROP_QUESTION_NODE_TYPE,
    { configuration: dragDropConfiguration, title: "Drag and Drop" },
  ],
  [
    SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE,
    { configuration: fillBlanksConfiguration, title: "Fill in the blanks" },
  ],
  [
    SURFACE_CATEGORISE_QUESTION_NODE_TYPE,
    { configuration: categoriseConfiguration, title: "Categorise" },
  ],
  [
    SURFACE_SEQUENCING_QUESTION_NODE_TYPE,
    { configuration: sequencingConfiguration, title: "Sequencing" },
  ],
  [
    SURFACE_MATCHING_QUESTION_NODE_TYPE,
    { configuration: matchingConfiguration, title: "Matching" },
  ],
  [
    SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE,
    { configuration: imageHotspotConfiguration, title: "Image hotspot" },
  ],
]);

export function SlideQuizSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  const quiz = useSlideQuizAuthoringController({
    editor: props.editor,
    getPos: props.getPos,
    surface: props.node,
  });
  const [questionSettingsOpen, setQuestionSettingsOpen] = useState(false);
  const activeType = quiz.activeChildNode?.type.name ?? null;
  const questionSettings = activeType ? questionSettingsFor(activeType) : null;
  const quickActions = useMemo<ResolvedQuickAction[]>(
    () =>
      activeType === SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE
        ? [
            {
              id: "fill-blanks:create-blank",
              label: "Create blank",
              icon: BracketsCurly,
              canRun: ({ editor }) => canApplyFillBlankToEditor(editor),
              run: () => applyFillBlankToEditor(props.editor),
            },
          ]
        : [],
    [activeType, props.editor],
  );

  return (
    <AssessmentSlideSurfaceAuthoringFrame
      {...props}
      attributes={{
        "data-quiz-view-id": quiz.quizViewId,
        "data-active-question-id": quiz.activeChildKey ?? undefined,
        "data-active-question-index":
          quiz.activeChildIndex >= 0 ? String(quiz.activeChildIndex) : undefined,
      }}
      variantClassName="sc-slide-quiz-surface-view sc-slide-quiz-surface-authoring-view"
    >
      <SlideQuizAuthoringRail
        activeChildKey={quiz.activeChildKey}
        activeIndex={quiz.activeChildIndex}
        childKeys={quiz.childKeys}
        childTypes={quiz.childTypes}
        editor={props.editor}
        items={quiz.assessmentCatalogItems}
        questionKeysNeedingSetup={quiz.questionKeysNeedingSetup}
        quickActions={quickActions}
        totalPoints={quiz.totalPoints}
        onAdd={(item) => quiz.actions.addQuestion(item.id)}
        onDelete={quiz.actions.deleteQuestion}
        onDuplicate={quiz.actions.duplicateQuestion}
        onMove={quiz.actions.moveQuestion}
        onReorder={quiz.actions.reorderQuestion}
        onSelect={quiz.actions.selectAuthoringChild}
        onSettings={() => setQuestionSettingsOpen(true)}
      />

      {quiz.isEmpty ? (
        <QuizEmptyStage
          items={quiz.assessmentCatalogItems}
          onAdd={(item) => quiz.actions.addQuestion(item.id)}
        />
      ) : null}

      <SlideQuizActiveQuestionStyle
        activeQuestionId={quiz.activeChildKey}
        quizId={quiz.quizViewId}
      />

      {questionSettings && quiz.activeChildKey && activeType ? (
        <ConfigurationSettingsSheet
          editor={props.editor}
          entry={questionSettings.entry}
          nodeType={activeType}
          open={questionSettingsOpen}
          pos={null}
          targetId={quiz.activeChildKey}
          title={`${questionSettings.title} settings`}
          onOpenChange={setQuestionSettingsOpen}
        />
      ) : null}
    </AssessmentSlideSurfaceAuthoringFrame>
  );
}

function questionSettingsFor(
  nodeType: string,
): { entry: ConfigurationNodeSettingsSheetDefinition; title: string } | null {
  const registered = QUESTION_CONFIGURATION_BY_NODE_TYPE.get(nodeType);
  if (!registered)
    throw new Error(`Quiz cannot configure unsupported question type "${nodeType}".`);
  const settings = deriveSettingsSheetDefinition(registered.configuration);
  if (!settings) return null;
  return {
    title: registered.title,
    entry: {
      ...settings,
      nodeType,
      sections: settings.sections.map((section) => ({
        ...section,
        items: section.items.map((item) =>
          "name" in item && MANAGED_QUIZ_CHILD_SETTINGS.has(item.name)
            ? { ...item, disabledReason: MANAGED_QUIZ_CHILD_SETTINGS_REASON }
            : item,
        ),
      })),
    },
  };
}
