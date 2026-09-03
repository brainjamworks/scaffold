import { AssessmentInteractionContractSchema, McqSettingsSchema } from "@scaffold/contracts";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { useMemo } from "react";

import {
  mcqResponseCodec,
  projectMcqInteraction,
  projectMcqSettings,
} from "@/editor/assessment/mcq/assessment";
import { mcqCourseContentFromProseMirror } from "@/editor/assessment/mcq/mcq-course-content";
import { McqCourseInteraction } from "@/editor/assessment/mcq/mcq-course-interaction";
import { pageAssessmentExperience } from "@/editor/assessment/shared/model/assessment-capability";
import { countAssessmentHints } from "@/editor/assessment/shared/model/assessment-prosemirror";
import { textBetween } from "@/editor/assessment/shared/publication/projection";
import { assessmentResponseName } from "@/editor/assessment/shared/runtime/assessment-response-name";
import {
  useAssessmentRuntimeForTarget,
  type AssessmentRuntimeProblemConfig,
} from "@/editor/assessment/shared/runtime/use-assessment-runtime";
import { SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-multiple-choice-question-node";
import { useAssessmentStoreApi } from "@/runtime/assessment/AssessmentRuntimeProvider";

import "../../view/assessment-selectable-choice-surface.css";
import type { SurfaceRuntimeViewProps } from "../../runtime/surface-runtime-view-registry";
import { AssessmentSlideSurfaceRuntimeFrame } from "../../runtime/views/AssessmentSlideSurfaceRuntimeFrame";
import { useAssessmentSurfaceControlBinding } from "../../runtime/variants/assessment/assessment-surface-control-binding";
import { FullSlideQuestionStage } from "../../runtime/variants/assessment/FullSlideQuestionStage";

export function SlideMultipleChoiceQuestionSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  const question = surfaceMultipleChoiceQuestion(props.node);

  return (
    <AssessmentSlideSurfaceRuntimeFrame
      {...props}
      variantClassName="sc-selectable-choice-slide-surface-view sc-selectable-choice-slide-surface-runtime-view sc-slide-multiple-choice-question-surface-view sc-slide-multiple-choice-question-surface-runtime-view"
    >
      <MultipleChoiceFullSlideQuestionPresenter
        editor={props.editor}
        question={question}
        surfaceControlBinding={props}
      />
    </AssessmentSlideSurfaceRuntimeFrame>
  );
}

export function MultipleChoiceFullSlideQuestionPresenter({
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
  if (question.type.name !== SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE) {
    throw new Error("Multiple Choice presenter requires a private Surface question.");
  }
  const assessmentTargetId = readAssessmentTargetId(question);
  const config = useMemo(() => createRuntimeConfig(question), [question]);
  const serializer = useMemo(() => DOMSerializer.fromSchema(editor.schema), [editor.schema]);
  const content = useMemo(
    () => mcqCourseContentFromProseMirror(choicesGroup(question), serializer),
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
        data-surface-multiple-choice-interaction=""
        className="sc-course-selectable-choice-interaction__content sc-course-mcq-interaction__content"
      >
        <McqCourseInteraction
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
  const settings = McqSettingsSchema.parse(question.attrs["settings"] ?? {});
  const projectedSettings = projectMcqSettings(settings);
  const interaction = AssessmentInteractionContractSchema.parse(
    projectMcqInteraction(question.toJSON()),
  );
  if (interaction.kind !== "single-select") {
    throw new Error('Surface Multiple Choice runtime requires a "single-select" interaction.');
  }
  const responseCodec = {
    ...mcqResponseCodec,
    toContractResponse: (response: unknown) =>
      mcqResponseCodec.toContractResponse(response, interaction),
    fromContractResponse: (response: Parameters<typeof mcqResponseCodec.fromContractResponse>[0]) =>
      mcqResponseCodec.fromContractResponse(response, interaction),
    hasResponse: (response: unknown) => mcqResponseCodec.hasResponse(response, interaction),
  };
  const activityDescription = assessmentActivityDescription(question);

  return {
    kind: "single-select",
    targetId: assessmentTargetId,
    interactionKind: "single-select",
    learningEventDefinition: {
      ...(activityDescription ? { activityDescription } : {}),
      interaction,
    },
    choiceMode: "single",
    feedbackMode: settings.feedbackMode,
    maxAttempts: settings.maxAttempts,
    maxSelect: null,
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

function surfaceMultipleChoiceQuestion(surface: PMNode): PMNode {
  if (
    surface.childCount !== 1 ||
    surface.child(0).type.name !== SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE
  ) {
    throw new Error("Multiple Choice Question Surface requires exactly one private question node.");
  }
  return surface.child(0);
}

function choicesGroup(question: PMNode): PMNode {
  for (let index = 0; index < question.childCount; index += 1) {
    const child = question.child(index);
    if (child.type.name === "assessment_choices_group") return child;
  }
  throw new Error("Surface Multiple Choice question is missing its choices group.");
}

function readAssessmentTargetId(question: PMNode): string {
  const id = question.attrs["id"];
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Surface Multiple Choice question is missing its assessment target id.");
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
