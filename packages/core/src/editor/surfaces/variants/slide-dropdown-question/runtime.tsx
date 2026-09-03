import { AssessmentInteractionContractSchema, DropdownSettingsSchema } from "@scaffold/contracts";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { useMemo } from "react";

import {
  dropdownResponseCodec,
  projectDropdownInteraction,
  projectDropdownSettings,
} from "@/editor/assessment/dropdown/assessment";
import { dropdownCourseContentFromProseMirror } from "@/editor/assessment/dropdown/dropdown-course-content";
import { DropdownCourseInteraction } from "@/editor/assessment/dropdown/dropdown-course-interaction";
import { pageAssessmentExperience } from "@/editor/assessment/shared/model/assessment-capability";
import { countAssessmentHints } from "@/editor/assessment/shared/model/assessment-prosemirror";
import { textBetween } from "@/editor/assessment/shared/publication/projection";
import { assessmentResponseName } from "@/editor/assessment/shared/runtime/assessment-response-name";
import {
  useAssessmentRuntimeForTarget,
  type AssessmentRuntimeProblemConfig,
} from "@/editor/assessment/shared/runtime/use-assessment-runtime";
import { SURFACE_DROPDOWN_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-dropdown-question-node";
import { useAssessmentStoreApi } from "@/runtime/assessment/AssessmentRuntimeProvider";

import "./styles.css";
import type { SurfaceRuntimeViewProps } from "../../shared/surface-view-props";
import { AssessmentSlideSurfaceRuntimeFrame } from "../../runtime/views/AssessmentSlideSurfaceRuntimeFrame";
import { useAssessmentSurfaceControlBinding } from "../../runtime/assessment-surface-control-binding";
import { FullSlideQuestionStage } from "../../runtime/FullSlideQuestionStage";

export function SlideDropdownQuestionSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  const question = surfaceDropdownQuestion(props.node);

  return (
    <AssessmentSlideSurfaceRuntimeFrame
      {...props}
      variantClassName="sc-dropdown-slide-surface-view sc-dropdown-slide-surface-runtime-view sc-slide-dropdown-question-surface-view sc-slide-dropdown-question-surface-runtime-view"
    >
      <DropdownFullSlideQuestionPresenter
        editor={props.editor}
        question={question}
        surfaceControlBinding={props}
      />
    </AssessmentSlideSurfaceRuntimeFrame>
  );
}

export function DropdownFullSlideQuestionPresenter({
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
  if (question.type.name !== SURFACE_DROPDOWN_QUESTION_NODE_TYPE) {
    throw new Error("Dropdown presenter requires a private Surface question.");
  }
  const assessmentTargetId = readAssessmentTargetId(question);
  const config = useMemo(() => createRuntimeConfig(question), [question]);
  const serializer = useMemo(() => DOMSerializer.fromSchema(editor.schema), [editor.schema]);
  const content = useMemo(
    () => dropdownCourseContentFromProseMirror(choicesGroup(question), serializer),
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
        data-surface-dropdown-interaction=""
        className="sc-course-dropdown-interaction__content"
      >
        <DropdownCourseInteraction
          assessmentTargetId={assessmentTargetId}
          content={content}
          presentation="full-slide"
          promptHasText={assessmentPromptText(question).length > 0}
        />
      </div>
    </FullSlideQuestionStage>
  );
}

function createRuntimeConfig(question: PMNode): AssessmentRuntimeProblemConfig {
  const assessmentTargetId = readAssessmentTargetId(question);
  const settings = DropdownSettingsSchema.parse(question.attrs["settings"] ?? {});
  const projectedSettings = projectDropdownSettings(settings);
  const interaction = AssessmentInteractionContractSchema.parse(
    projectDropdownInteraction(question.toJSON()),
  );
  if (interaction.kind !== "single-select") {
    throw new Error('Surface Dropdown runtime requires a "single-select" interaction.');
  }
  const responseCodec = {
    ...dropdownResponseCodec,
    toContractResponse: (response: unknown) =>
      dropdownResponseCodec.toContractResponse(response, interaction),
    fromContractResponse: (
      response: Parameters<typeof dropdownResponseCodec.fromContractResponse>[0],
    ) => dropdownResponseCodec.fromContractResponse(response, interaction),
    hasResponse: (response: unknown) => dropdownResponseCodec.hasResponse(response, interaction),
  };
  const activityDescription = assessmentPromptText(question) || undefined;

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
    legend: projectedSettings.label ?? "",
    placeholder: projectedSettings.placeholder ?? "Select...",
    showAnswerEnabled: settings.showAnswer,
    experience: pageAssessmentExperience,
    hintsTotal: countAssessmentHints(question),
    points: settings.points,
    isGraded: settings.isGraded,
    responseCodec,
  };
}

function surfaceDropdownQuestion(surface: PMNode): PMNode {
  if (
    surface.childCount !== 1 ||
    surface.child(0).type.name !== SURFACE_DROPDOWN_QUESTION_NODE_TYPE
  ) {
    throw new Error("Dropdown Question Surface requires exactly one private question node.");
  }
  return surface.child(0);
}

function choicesGroup(question: PMNode): PMNode {
  for (let index = 0; index < question.childCount; index += 1) {
    const child = question.child(index);
    if (child.type.name === "dropdown_choices_group") return child;
  }
  throw new Error("Surface Dropdown question is missing its choices group.");
}

function readAssessmentTargetId(question: PMNode): string {
  const id = question.attrs["id"];
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Surface Dropdown question is missing its assessment target id.");
  }
  return id;
}

function assessmentPromptText(question: PMNode): string {
  for (let index = 0; index < question.childCount; index += 1) {
    const child = question.child(index);
    if (child.type.name !== "assessment_prompt") continue;
    return textBetween(child.toJSON()).trim();
  }
  return "";
}
