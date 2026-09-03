import { AssessmentInteractionContractSchema, FillBlanksSettingsSchema } from "@scaffold/contracts";
import type { Node as PMNode } from "@tiptap/pm/model";
import { useMemo } from "react";

import {
  fillBlanksResponseCodec,
  projectFillBlanksInteraction,
  projectFillBlanksSettings,
} from "@/editor/assessment/fill-blanks/assessment";
import { pageAssessmentExperience } from "@/editor/assessment/shared/model/assessment-capability";
import { countAssessmentHints } from "@/editor/assessment/shared/model/assessment-prosemirror";
import { textBetween } from "@/editor/assessment/shared/publication/projection";
import { assessmentResponseName } from "@/editor/assessment/shared/runtime/assessment-response-name";
import {
  useAssessmentRuntimeForTarget,
  type AssessmentRuntimeProblemConfig,
} from "@/editor/assessment/shared/runtime/use-assessment-runtime";
import { SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-fill-blanks-question-node";
import { useAssessmentStoreApi } from "@/runtime/assessment/AssessmentRuntimeProvider";

import "./styles.css";
import type { SurfaceRuntimeViewProps } from "../../shared/surface-view-props";
import { AssessmentSlideSurfaceRuntimeFrame } from "../../runtime/views/AssessmentSlideSurfaceRuntimeFrame";
import { useAssessmentSurfaceControlBinding } from "../../runtime/assessment-surface-control-binding";

export function SlideFillBlanksQuestionSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  const question = surfaceFillBlanksQuestion(props.node);

  return (
    <AssessmentSlideSurfaceRuntimeFrame
      {...props}
      variantClassName="sc-fill-blanks-slide-surface-view sc-fill-blanks-slide-surface-runtime-view sc-slide-fill-blanks-question-surface-view sc-slide-fill-blanks-question-surface-runtime-view"
    >
      <FillBlanksFullSlideQuestionPresenter
        editor={props.editor}
        question={question}
        surfaceControlBinding={props}
      />
    </AssessmentSlideSurfaceRuntimeFrame>
  );
}

export function FillBlanksFullSlideQuestionPresenter({
  editor,
  question,
  surfaceControlBinding,
}: {
  editor: SurfaceRuntimeViewProps["editor"];
  question: PMNode;
  surfaceControlBinding?: SurfaceRuntimeViewProps;
  visible?: boolean;
}) {
  if (question.type.name !== SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE) {
    throw new Error("Fill in Blanks presenter requires a private Surface question.");
  }
  const assessmentTargetId = readAssessmentTargetId(question);
  const config = useMemo(() => createRuntimeConfig(question), [question]);
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

  return null;
}

function createRuntimeConfig(question: PMNode): AssessmentRuntimeProblemConfig {
  const assessmentTargetId = readAssessmentTargetId(question);
  const settings = FillBlanksSettingsSchema.parse(question.attrs["settings"] ?? {});
  const projectedSettings = projectFillBlanksSettings(settings);
  const interaction = AssessmentInteractionContractSchema.parse(
    projectFillBlanksInteraction(question.toJSON()),
  );
  if (interaction.kind !== "fill-blanks") {
    throw new Error('Surface Fill in Blanks runtime requires a "fill-blanks" interaction.');
  }
  const responseCodec = {
    ...fillBlanksResponseCodec,
    toContractResponse: (response: unknown) =>
      fillBlanksResponseCodec.toContractResponse(response, interaction),
    fromContractResponse: (
      response: Parameters<typeof fillBlanksResponseCodec.fromContractResponse>[0],
    ) => fillBlanksResponseCodec.fromContractResponse(response, interaction),
    hasResponse: (response: unknown) => fillBlanksResponseCodec.hasResponse(response, interaction),
  };
  const activityDescription = assessmentPromptText(question) || undefined;

  return {
    kind: "fill-blanks",
    targetId: assessmentTargetId,
    interactionKind: "fill-blanks",
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

function surfaceFillBlanksQuestion(surface: PMNode): PMNode {
  if (
    surface.childCount !== 1 ||
    surface.child(0).type.name !== SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE
  ) {
    throw new Error("Fill in Blanks Question Surface requires exactly one private question node.");
  }
  return surface.child(0);
}

function readAssessmentTargetId(question: PMNode): string {
  const id = question.attrs["id"];
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Surface Fill in Blanks question is missing its assessment target id.");
  }
  return id;
}

function assessmentPromptText(question: PMNode): string {
  for (let index = 0; index < question.childCount; index += 1) {
    const child = question.child(index);
    if (child.type.name === "assessment_prompt") return textBetween(child.toJSON()).trim();
  }
  return "";
}
