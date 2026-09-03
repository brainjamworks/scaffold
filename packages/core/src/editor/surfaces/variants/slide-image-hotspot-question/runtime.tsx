import {
  AssessmentInteractionContractSchema,
  ImageHotspotCanvasDataSchema,
  ImageHotspotSettingsSchema,
} from "@scaffold/contracts";
import type { Node as PMNode } from "@tiptap/pm/model";
import { useMemo } from "react";

import {
  imageHotspotResponseCodec,
  projectImageHotspotInteraction,
  projectImageHotspotSettings,
} from "@/editor/assessment/image-hotspot/assessment";
import { ImageHotspotCourseInteraction } from "@/editor/assessment/image-hotspot/course-interaction";
import { pageAssessmentExperience } from "@/editor/assessment/shared/model/assessment-capability";
import { countAssessmentHints } from "@/editor/assessment/shared/model/assessment-prosemirror";
import { textBetween } from "@/editor/assessment/shared/publication/projection";
import { assessmentResponseName } from "@/editor/assessment/shared/runtime/assessment-response-name";
import {
  useAssessmentRuntimeForTarget,
  type AssessmentRuntimeProblemConfig,
} from "@/editor/assessment/shared/runtime/use-assessment-runtime";
import { SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-image-hotspot-question-node";
import { useAssessmentStoreApi } from "@/runtime/assessment/AssessmentRuntimeProvider";

import "./styles.css";
import type { SurfaceRuntimeViewProps } from "../../runtime/surface-runtime-view-registry";
import { AssessmentSlideSurfaceRuntimeFrame } from "../../runtime/views/AssessmentSlideSurfaceRuntimeFrame";
import { useAssessmentSurfaceControlBinding } from "../../runtime/variants/assessment/assessment-surface-control-binding";
import { FullSlideQuestionStage } from "../../runtime/variants/assessment/FullSlideQuestionStage";

export function SlideImageHotspotQuestionSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  const question = surfaceImageHotspotQuestion(props.node);

  return (
    <AssessmentSlideSurfaceRuntimeFrame
      {...props}
      variantClassName="sc-slide-image-hotspot-question-surface-view sc-slide-image-hotspot-question-surface-runtime-view"
    >
      <ImageHotspotFullSlideQuestionPresenter
        editor={props.editor}
        question={question}
        surfaceControlBinding={props}
      />
    </AssessmentSlideSurfaceRuntimeFrame>
  );
}

export function ImageHotspotFullSlideQuestionPresenter({
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
  if (question.type.name !== SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE) {
    throw new Error("Image Hotspot presenter requires a private Surface question.");
  }
  const assessmentTargetId = readAssessmentTargetId(question);
  const config = useMemo(() => createRuntimeConfig(question), [question]);
  const data = useMemo(
    () => ImageHotspotCanvasDataSchema.parse(imageHotspotCanvas(question).attrs["data"] ?? {}),
    [question],
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
        className="sc-course-image-hotspot__content sc-course-image-hotspot__content--runtime"
        data-assessment-interaction-content=""
        data-slot="image-hotspot-content"
        data-surface-image-hotspot-interaction=""
      >
        <ImageHotspotCourseInteraction
          assessmentTargetId={assessmentTargetId}
          data={data}
          fitStrategy="contain"
          presentation="full-slide"
        />
      </div>
    </FullSlideQuestionStage>
  );
}

function createRuntimeConfig(question: PMNode): AssessmentRuntimeProblemConfig {
  const assessmentTargetId = readAssessmentTargetId(question);
  const settings = ImageHotspotSettingsSchema.parse(question.attrs["settings"] ?? {});
  const projectedSettings = projectImageHotspotSettings(settings);
  const interaction = AssessmentInteractionContractSchema.parse(
    projectImageHotspotInteraction(question.toJSON()),
  );
  if (interaction.kind !== "spatial-hotspot") {
    throw new Error('Surface Image Hotspot runtime requires a "spatial-hotspot" interaction.');
  }
  const responseCodec = {
    ...imageHotspotResponseCodec,
    toContractResponse: (response: unknown) =>
      imageHotspotResponseCodec.toContractResponse(response, interaction),
    fromContractResponse: (
      response: Parameters<typeof imageHotspotResponseCodec.fromContractResponse>[0],
    ) => imageHotspotResponseCodec.fromContractResponse(response, interaction),
    hasResponse: (response: unknown) =>
      imageHotspotResponseCodec.hasResponse(response, interaction),
  };
  const activityDescription = assessmentActivityDescription(question);

  return {
    kind: "spatial-hotspot",
    targetId: assessmentTargetId,
    interactionKind: "spatial-hotspot",
    learningEventDefinition: {
      ...(activityDescription ? { activityDescription } : {}),
      interaction,
    },
    choiceMode: null,
    feedbackMode: settings.feedbackMode,
    maxAttempts: settings.maxAttempts,
    maxSelect: interaction.maxSelections,
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

function surfaceImageHotspotQuestion(surface: PMNode): PMNode {
  if (
    surface.childCount !== 1 ||
    surface.child(0).type.name !== SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE
  ) {
    throw new Error("Image Hotspot Question Surface requires exactly one private question node.");
  }
  return surface.child(0);
}

function imageHotspotCanvas(question: PMNode): PMNode {
  for (let index = 0; index < question.childCount; index += 1) {
    const child = question.child(index);
    if (child.type.name === "image_hotspot_canvas") return child;
  }
  throw new Error("Surface Image Hotspot question is missing its canvas.");
}

function readAssessmentTargetId(question: PMNode): string {
  const id = question.attrs["id"];
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Surface Image Hotspot question is missing its assessment target id.");
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
