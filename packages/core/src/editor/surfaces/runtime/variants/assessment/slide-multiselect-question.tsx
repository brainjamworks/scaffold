import {
  AssessmentInteractionContractSchema,
  MultiselectSettingsSchema,
} from "@scaffold/contracts";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { useMemo } from "react";

import {
  multiselectResponseCodec,
  projectMultiselectInteraction,
  projectMultiselectSettings,
} from "@/editor/blocks/assessment/multiselect/assessment";
import { multiselectCourseContentFromProseMirror } from "@/editor/blocks/assessment/multiselect/multiselect-course-content";
import { MultiselectCourseInteraction } from "@/editor/blocks/assessment/multiselect/multiselect-course-interaction";
import { pageAssessmentExperience } from "@/editor/assessment/shared/model/assessment-capability";
import { countAssessmentHints } from "@/editor/assessment/shared/model/assessment-prosemirror";
import { textBetween } from "@/editor/assessment/shared/publication/projection";
import { assessmentResponseName } from "@/editor/assessment/shared/runtime/assessment-response-name";
import {
  useAssessmentRuntimeForTarget,
  type AssessmentRuntimeProblemConfig,
} from "@/editor/assessment/shared/runtime/use-assessment-runtime";
import { SURFACE_MULTISELECT_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-multiselect-question-node";
import { useAssessmentStoreApi } from "@/runtime/assessment/AssessmentRuntimeProvider";

import "../../../view/assessment-selectable-choice-surface.css";
import type { SurfaceRuntimeViewProps } from "../../surface-runtime-view-registry";
import { AssessmentSlideSurfaceRuntimeFrame } from "../../views/AssessmentSlideSurfaceRuntimeFrame";
import { useAssessmentSurfaceControlBinding } from "./assessment-surface-control-binding";
import { FullSlideQuestionStage } from "./FullSlideQuestionStage";

export function SlideMultiselectQuestionSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  const question = surfaceMultiselectQuestion(props.node);

  return (
    <AssessmentSlideSurfaceRuntimeFrame
      {...props}
      variantClassName="sc-selectable-choice-slide-surface-view sc-selectable-choice-slide-surface-runtime-view sc-slide-multiselect-question-surface-view sc-slide-multiselect-question-surface-runtime-view"
    >
      <MultiselectFullSlideQuestionPresenter
        editor={props.editor}
        question={question}
        surfaceControlBinding={props}
      />
    </AssessmentSlideSurfaceRuntimeFrame>
  );
}

export function MultiselectFullSlideQuestionPresenter({
  editor,
  question,
  surfaceControlBinding,
  visible = true,
}: {
  editor: SurfaceRuntimeViewProps["editor"];
  question: PMNode;
  surfaceControlBinding?: SurfaceRuntimeViewProps;
  visible?: boolean;
}) {
  if (question.type.name !== SURFACE_MULTISELECT_QUESTION_NODE_TYPE) {
    throw new Error("Multi-select presenter requires a private Surface question.");
  }
  const assessmentTargetId = readAssessmentTargetId(question);
  const config = useMemo(() => createRuntimeConfig(question), [question]);
  const serializer = useMemo(() => DOMSerializer.fromSchema(editor.schema), [editor.schema]);
  const content = useMemo(
    () => multiselectCourseContentFromProseMirror(choicesGroup(question), serializer),
    [question, serializer],
  );
  const runtime = useAssessmentRuntimeForTarget({ assessmentTargetId, config });
  const store = useAssessmentStoreApi();
  useAssessmentSurfaceControlBinding({
    assessmentTargetId,
    editor,
    enabled:
      Boolean(surfaceControlBinding) &&
      !runtime.hasUnsafeIdentity &&
      runtime.problem?.context === "standalone",
    getPos: surfaceControlBinding?.getPos ?? (() => undefined),
    node: surfaceControlBinding?.node ?? question,
    problemId: runtime.problemId,
    store,
  });

  if (!visible) return null;
  return (
    <FullSlideQuestionStage question={question}>
      <div
        data-assessment-interaction-content=""
        data-surface-multiselect-interaction=""
        className="sc-course-selectable-choice-interaction__content sc-course-multiselect-interaction__content"
      >
        <MultiselectCourseInteraction
          assessmentTargetId={assessmentTargetId}
          content={content}
          presentation="full-slide"
        />
      </div>
    </FullSlideQuestionStage>
  );
}

function createRuntimeConfig(question: PMNode): AssessmentRuntimeProblemConfig {
  const assessmentTargetId = readAssessmentTargetId(question);
  const settings = MultiselectSettingsSchema.parse(question.attrs["settings"] ?? {});
  const projectedSettings = projectMultiselectSettings(settings);
  const interaction = AssessmentInteractionContractSchema.parse(
    projectMultiselectInteraction(question.toJSON(), settings),
  );
  if (interaction.kind !== "multi-select") {
    throw new Error('Surface Multi-select runtime requires a "multi-select" interaction.');
  }
  const responseCodec = {
    ...multiselectResponseCodec,
    toContractResponse: (response: unknown) =>
      multiselectResponseCodec.toContractResponse(response, interaction),
    fromContractResponse: (
      response: Parameters<typeof multiselectResponseCodec.fromContractResponse>[0],
    ) => multiselectResponseCodec.fromContractResponse(response, interaction),
    hasResponse: (response: unknown) => multiselectResponseCodec.hasResponse(response, interaction),
  };
  const activityDescription = assessmentActivityDescription(question);

  return {
    kind: "multi-select",
    targetId: assessmentTargetId,
    interactionKind: "multi-select",
    learningEventDefinition: {
      ...(activityDescription ? { activityDescription } : {}),
      interaction,
    },
    choiceMode: "multiple",
    feedbackMode: settings.feedbackMode,
    maxAttempts: settings.maxAttempts,
    maxSelect: projectedSettings.maxSelections ?? settings.maxSelect,
    currentOptionIds: interaction.options.map((option) => option.id),
    responseName: assessmentResponseName(assessmentTargetId),
    legend: projectedSettings.legend ?? "",
    placeholder: "",
    showAnswerEnabled: settings.showAnswer,
    experience: pageAssessmentExperience,
    hintsTotal: countAssessmentHints(question),
    points: settings.points,
    isGraded: settings.isGraded,
    responseCodec,
  };
}

function surfaceMultiselectQuestion(surface: PMNode): PMNode {
  if (
    surface.childCount !== 1 ||
    surface.child(0).type.name !== SURFACE_MULTISELECT_QUESTION_NODE_TYPE
  ) {
    throw new Error("Multi-select Question Surface requires exactly one private question node.");
  }
  return surface.child(0);
}

function choicesGroup(question: PMNode): PMNode {
  for (let index = 0; index < question.childCount; index += 1) {
    const child = question.child(index);
    if (child.type.name === "assessment_choices_group") return child;
  }
  throw new Error("Surface Multi-select question is missing its choices group.");
}

function readAssessmentTargetId(question: PMNode): string {
  const id = question.attrs["id"];
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Surface Multi-select question is missing its assessment target id.");
  }
  return id;
}

function assessmentActivityDescription(question: PMNode): string | undefined {
  for (let index = 0; index < question.childCount; index += 1) {
    const child = question.child(index);
    if (child.type.name !== "assessment_prompt") continue;
    return textBetween(child.toJSON()).trim() || undefined;
  }
  return undefined;
}
