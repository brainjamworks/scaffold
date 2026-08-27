import { AssessmentInteractionContractSchema, CategoriseSettingsSchema } from "@scaffold/contracts";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { useMemo } from "react";

import {
  categoriseResponseCodec,
  projectCategoriseInteraction,
  projectCategoriseSettings,
} from "@/editor/blocks/assessment/categorise/assessment";
import { categoriseCourseContentFromProseMirror } from "@/editor/blocks/assessment/categorise/categorise-course-content";
import { CategoriseCourseInteraction } from "@/editor/blocks/assessment/categorise/categorise-course-interaction";
import { countAssessmentHints } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { pageAssessmentExperience } from "@/editor/blocks/assessment/shared/model/assessment-capability";
import { textBetween } from "@/editor/blocks/assessment/shared/publication/projection";
import { assessmentResponseName } from "@/editor/blocks/assessment/shared/runtime/assessment-response-name";
import {
  useAssessmentRuntimeForTarget,
  type AssessmentRuntimeProblemConfig,
} from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { SURFACE_CATEGORISE_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-categorise-question-node";
import { useAssessmentStoreApi } from "@/runtime/assessment/AssessmentRuntimeProvider";

import "../../../view/variants/assessment/slide-categorise-question.css";
import { AssessmentSlideSurfaceRuntimeFrame } from "../../views/AssessmentSlideSurfaceRuntimeFrame";
import type { SurfaceRuntimeViewProps } from "../../surface-runtime-view-registry";
import { useAssessmentSurfaceControlBinding } from "./assessment-surface-control-binding";

export function SlideCategoriseQuestionSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  const question = surfaceCategoriseQuestion(props.node);
  const assessmentTargetId = readAssessmentTargetId(question);
  const serializer = useMemo(
    () => DOMSerializer.fromSchema(props.editor.schema),
    [props.editor.schema],
  );
  const config = useMemo(() => createRuntimeConfig(question), [question]);
  const content = useMemo(
    () => categoriseCourseContentFromProseMirror(categoriseContent(question), serializer),
    [question, serializer],
  );
  const runtime = useAssessmentRuntimeForTarget({ assessmentTargetId, config });
  const store = useAssessmentStoreApi();
  useAssessmentSurfaceControlBinding({
    assessmentTargetId,
    editor: props.editor,
    enabled: !runtime.hasUnsafeIdentity && runtime.problem?.context === "standalone",
    getPos: props.getPos,
    node: props.node,
    problemId: runtime.problemId,
    store,
  });

  return (
    <AssessmentSlideSurfaceRuntimeFrame
      {...props}
      variantClassName="sc-slide-categorise-question-surface-view sc-slide-categorise-question-surface-runtime-view"
    >
      <div
        className="sc-course-categorise__content sc-course-categorise__content--runtime"
        data-assessment-interaction-content=""
        data-slot="categorise-content"
        data-surface-categorise-interaction=""
      >
        <CategoriseCourseInteraction
          assessmentTargetId={assessmentTargetId}
          content={content}
          presentation="full-slide"
        />
      </div>
    </AssessmentSlideSurfaceRuntimeFrame>
  );
}

function createRuntimeConfig(question: PMNode): AssessmentRuntimeProblemConfig {
  const assessmentTargetId = readAssessmentTargetId(question);
  const settings = CategoriseSettingsSchema.parse(question.attrs["settings"] ?? {});
  const projectedSettings = projectCategoriseSettings(settings);
  const interaction = AssessmentInteractionContractSchema.parse(
    projectCategoriseInteraction(question.toJSON()),
  );
  if (interaction.kind !== "classify") {
    throw new Error('Surface Categorise runtime requires a "classify" interaction.');
  }
  const responseCodec = {
    ...categoriseResponseCodec,
    toContractResponse: (response: unknown) =>
      categoriseResponseCodec.toContractResponse(response, interaction),
    fromContractResponse: (
      response: Parameters<typeof categoriseResponseCodec.fromContractResponse>[0],
    ) => categoriseResponseCodec.fromContractResponse(response, interaction),
    hasResponse: (response: unknown) => categoriseResponseCodec.hasResponse(response, interaction),
  };
  const activityDescription = assessmentActivityDescription(question);

  return {
    kind: "classify",
    targetId: assessmentTargetId,
    interactionKind: "classify",
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

function surfaceCategoriseQuestion(surface: PMNode): PMNode {
  if (
    surface.childCount !== 1 ||
    surface.child(0).type.name !== SURFACE_CATEGORISE_QUESTION_NODE_TYPE
  ) {
    throw new Error("Categorise Question Surface requires exactly one private question node.");
  }
  return surface.child(0);
}

function categoriseContent(question: PMNode): PMNode {
  for (let index = 0; index < question.childCount; index += 1) {
    const child = question.child(index);
    if (child.type.name === "categorise_content") return child;
  }
  throw new Error("Surface Categorise question is missing categorise content.");
}

function readAssessmentTargetId(question: PMNode): string {
  const id = question.attrs["id"];
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Surface Categorise question is missing its assessment target id.");
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
