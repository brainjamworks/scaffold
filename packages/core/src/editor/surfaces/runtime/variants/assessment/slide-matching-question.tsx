import { AssessmentInteractionContractSchema, MatchingSettingsSchema } from "@scaffold/contracts";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { useMemo } from "react";

import {
  matchingResponseCodec,
  projectMatchingInteraction,
  projectMatchingSettings,
} from "@/editor/blocks/assessment/matching/assessment";
import { matchingCourseContentFromProseMirror } from "@/editor/blocks/assessment/matching/matching-course-content";
import { MatchingCourseInteraction } from "@/editor/blocks/assessment/matching/matching-course-interaction";
import { countAssessmentHints } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { pageAssessmentExperience } from "@/editor/blocks/assessment/shared/model/assessment-capability";
import { textBetween } from "@/editor/blocks/assessment/shared/publication/projection";
import { assessmentResponseName } from "@/editor/blocks/assessment/shared/runtime/assessment-response-name";
import {
  useAssessmentRuntimeForTarget,
  type AssessmentRuntimeProblemConfig,
} from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { SURFACE_MATCHING_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-matching-question-node";
import { useAssessmentStoreApi } from "@/runtime/assessment/AssessmentRuntimeProvider";

import "../../../view/variants/assessment/slide-matching-question.css";
import { AssessmentSlideSurfaceRuntimeFrame } from "../../views/AssessmentSlideSurfaceRuntimeFrame";
import type { SurfaceRuntimeViewProps } from "../../surface-runtime-view-registry";
import { useAssessmentSurfaceControlBinding } from "./assessment-surface-control-binding";

export function SlideMatchingQuestionSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  const question = surfaceMatchingQuestion(props.node);
  const assessmentTargetId = readAssessmentTargetId(question);
  const serializer = useMemo(
    () => DOMSerializer.fromSchema(props.editor.schema),
    [props.editor.schema],
  );
  const config = useMemo(() => createRuntimeConfig(question), [question]);
  const content = useMemo(
    () => matchingCourseContentFromProseMirror(matchingPairsGroup(question), serializer),
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
      variantClassName="sc-slide-matching-question-surface-view sc-slide-matching-question-surface-runtime-view"
    >
      <div
        className="sc-course-matching__content sc-course-matching__content--runtime"
        data-assessment-interaction-content=""
        data-slot="matching-content"
        data-surface-matching-interaction=""
      >
        <MatchingCourseInteraction
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
  const settings = MatchingSettingsSchema.parse(question.attrs["settings"] ?? {});
  const projectedSettings = projectMatchingSettings(settings);
  const interaction = AssessmentInteractionContractSchema.parse(
    projectMatchingInteraction(question.toJSON()),
  );
  if (interaction.kind !== "match") {
    throw new Error('Surface Matching runtime requires a "match" interaction.');
  }
  const responseCodec = {
    ...matchingResponseCodec,
    toContractResponse: (response: unknown) =>
      matchingResponseCodec.toContractResponse(response, interaction),
    fromContractResponse: (
      response: Parameters<typeof matchingResponseCodec.fromContractResponse>[0],
    ) => matchingResponseCodec.fromContractResponse(response, interaction),
    hasResponse: (response: unknown) => matchingResponseCodec.hasResponse(response, interaction),
  };
  const activityDescription = assessmentActivityDescription(question);

  return {
    kind: "match",
    targetId: assessmentTargetId,
    interactionKind: "match",
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

function surfaceMatchingQuestion(surface: PMNode): PMNode {
  if (
    surface.childCount !== 1 ||
    surface.child(0).type.name !== SURFACE_MATCHING_QUESTION_NODE_TYPE
  ) {
    throw new Error("Matching Question Surface requires exactly one private question node.");
  }
  return surface.child(0);
}

function matchingPairsGroup(question: PMNode): PMNode {
  for (let index = 0; index < question.childCount; index += 1) {
    const child = question.child(index);
    if (child.type.name === "matching_pairs_group") return child;
  }
  throw new Error("Surface Matching question is missing matching pairs.");
}

function readAssessmentTargetId(question: PMNode): string {
  const id = question.attrs["id"];
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Surface Matching question is missing its assessment target id.");
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
