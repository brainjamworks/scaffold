import { AssessmentInteractionContractSchema, SequencingSettingsSchema } from "@scaffold/contracts";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { useMemo } from "react";

import {
  projectSequencingInteraction,
  projectSequencingSettings,
  sequencingResponseCodec,
} from "@/editor/assessment/sequencing/assessment";
import { sequencingCourseContentFromProseMirror } from "@/editor/assessment/sequencing/sequencing-course-content";
import { SequencingCourseInteraction } from "@/editor/assessment/sequencing/sequencing-course-interaction";
import { pageAssessmentExperience } from "@/editor/assessment/shared/model/assessment-capability";
import { countAssessmentHints } from "@/editor/assessment/shared/model/assessment-prosemirror";
import { textBetween } from "@/editor/assessment/shared/publication/projection";
import { assessmentResponseName } from "@/editor/assessment/shared/runtime/assessment-response-name";
import {
  useAssessmentRuntimeForTarget,
  type AssessmentRuntimeProblemConfig,
} from "@/editor/assessment/shared/runtime/use-assessment-runtime";
import { SURFACE_SEQUENCING_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-sequencing-question-node";
import { useAssessmentStoreApi } from "@/runtime/assessment/AssessmentRuntimeProvider";

import "./styles.css";
import type { SurfaceRuntimeViewProps } from "../../runtime/surface-runtime-view-registry";
import { AssessmentSlideSurfaceRuntimeFrame } from "../../runtime/views/AssessmentSlideSurfaceRuntimeFrame";
import { useAssessmentSurfaceControlBinding } from "../../runtime/variants/assessment/assessment-surface-control-binding";
import { FullSlideQuestionStage } from "../../runtime/variants/assessment/FullSlideQuestionStage";

export function SlideSequencingQuestionSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  const question = surfaceSequencingQuestion(props.node);

  return (
    <AssessmentSlideSurfaceRuntimeFrame
      {...props}
      variantClassName="sc-slide-sequencing-question-surface-view sc-slide-sequencing-question-surface-runtime-view"
    >
      <SequencingFullSlideQuestionPresenter
        editor={props.editor}
        question={question}
        surfaceControlBinding={props}
      />
    </AssessmentSlideSurfaceRuntimeFrame>
  );
}

export function SequencingFullSlideQuestionPresenter({
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
  if (question.type.name !== SURFACE_SEQUENCING_QUESTION_NODE_TYPE) {
    throw new Error("Sequencing presenter requires a private Surface question.");
  }
  const assessmentTargetId = readAssessmentTargetId(question);
  const serializer = useMemo(() => DOMSerializer.fromSchema(editor.schema), [editor.schema]);
  const config = useMemo(() => createRuntimeConfig(question), [question]);
  const content = useMemo(
    () => sequencingCourseContentFromProseMirror(sequencingItemsGroup(question), serializer),
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
        data-slot="sequencing-content"
        data-surface-sequencing-interaction=""
        className="sc-course-sequencing__content sc-course-sequencing__content--runtime"
      >
        <SequencingCourseInteraction
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
  const settings = SequencingSettingsSchema.parse(question.attrs["settings"] ?? {});
  const projectedSettings = projectSequencingSettings(settings);
  const interaction = AssessmentInteractionContractSchema.parse(
    projectSequencingInteraction(question.toJSON()),
  );
  if (interaction.kind !== "sequence") {
    throw new Error('Surface Sequencing runtime requires a "sequence" interaction.');
  }
  const responseCodec = {
    ...sequencingResponseCodec,
    toContractResponse: (response: unknown) =>
      sequencingResponseCodec.toContractResponse(response, interaction),
    fromContractResponse: (
      response: Parameters<typeof sequencingResponseCodec.fromContractResponse>[0],
    ) => sequencingResponseCodec.fromContractResponse(response, interaction),
    hasResponse: (response: unknown) => sequencingResponseCodec.hasResponse(response, interaction),
  };
  const activityDescription = assessmentActivityDescription(question);

  return {
    kind: "sequence",
    targetId: assessmentTargetId,
    interactionKind: "sequence",
    learningEventDefinition: {
      ...(activityDescription ? { activityDescription } : {}),
      interaction,
    },
    choiceMode: null,
    feedbackMode: settings.feedbackMode,
    maxAttempts: settings.maxAttempts,
    maxSelect: null,
    currentOptionIds: [],
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

function surfaceSequencingQuestion(surface: PMNode): PMNode {
  if (
    surface.childCount !== 1 ||
    surface.child(0).type.name !== SURFACE_SEQUENCING_QUESTION_NODE_TYPE
  ) {
    throw new Error("Sequencing Question Surface requires exactly one private question node.");
  }
  return surface.child(0);
}

function sequencingItemsGroup(question: PMNode): PMNode {
  for (let index = 0; index < question.childCount; index += 1) {
    const child = question.child(index);
    if (child.type.name === "sequencing_items_group") return child;
  }
  throw new Error("Surface Sequencing question is missing its items group.");
}

function readAssessmentTargetId(question: PMNode): string {
  const id = question.attrs["id"];
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Surface Sequencing question is missing its assessment target id.");
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
