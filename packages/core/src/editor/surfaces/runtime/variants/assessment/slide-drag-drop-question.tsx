import {
  AssessmentInteractionContractSchema,
  DragDropCanvasDataSchema,
  DragDropSettingsSchema,
} from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useMemo } from "react";

import {
  projectDragDropInteraction,
  projectDragDropSettings,
} from "@/editor/blocks/assessment/drag-drop/assessment";
import { createDragDropCourseContent } from "@/editor/blocks/assessment/drag-drop/drag-drop-course-content";
import { DragDropCourseInteraction } from "@/editor/blocks/assessment/drag-drop/drag-drop-course-interaction";
import { dragDropResponseCodec } from "@/editor/blocks/assessment/drag-drop/drag-drop-response-codec";
import { pageAssessmentExperience } from "@/editor/assessment/shared/model/assessment-capability";
import { countAssessmentHints } from "@/editor/assessment/shared/model/assessment-prosemirror";
import { textBetween } from "@/editor/assessment/shared/publication/projection";
import { assessmentResponseName } from "@/editor/assessment/shared/runtime/assessment-response-name";
import {
  useAssessmentRuntimeForTarget,
  type AssessmentRuntimeProblemConfig,
} from "@/editor/assessment/shared/runtime/use-assessment-runtime";
import { SURFACE_DRAG_DROP_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-drag-drop-question-node";
import { useAssessmentStoreApi } from "@/runtime/assessment/AssessmentRuntimeProvider";

import "../../../view/variants/assessment/slide-drag-drop-question.css";
import type { SurfaceRuntimeViewProps } from "../../surface-runtime-view-registry";
import { AssessmentSlideSurfaceRuntimeFrame } from "../../views/AssessmentSlideSurfaceRuntimeFrame";
import { useAssessmentSurfaceControlBinding } from "./assessment-surface-control-binding";
import { FullSlideQuestionStage } from "./FullSlideQuestionStage";

export function SlideDragDropQuestionSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  const question = findSurfaceDragDropQuestion(props.node);
  return (
    <AssessmentSlideSurfaceRuntimeFrame
      {...props}
      variantClassName="sc-slide-drag-drop-question-surface-view sc-slide-drag-drop-question-surface-runtime-view"
    >
      <DragDropFullSlideQuestionPresenter
        editor={props.editor}
        question={question}
        surfaceControlBinding={props}
      />
    </AssessmentSlideSurfaceRuntimeFrame>
  );
}

export function DragDropFullSlideQuestionPresenter({
  editor,
  question,
  surfaceControlBinding,
  visible = true,
}: {
  readonly editor: SurfaceRuntimeViewProps["editor"];
  readonly question: ProseMirrorNode;
  readonly surfaceControlBinding?: SurfaceRuntimeViewProps;
  readonly visible?: boolean;
}) {
  if (question.type.name !== SURFACE_DRAG_DROP_QUESTION_NODE_TYPE) {
    throw new Error("Drag and Drop presenter requires a private Surface question.");
  }
  const assessmentTargetId = readAssessmentTargetId(question);
  const settings = useMemo(
    () => DragDropSettingsSchema.parse(question.attrs["settings"] ?? {}),
    [question],
  );
  const config = useMemo(() => createRuntimeConfig(question), [question]);
  const content = useMemo(
    () =>
      createDragDropCourseContent(
        DragDropCanvasDataSchema.parse(dragDropCanvas(question).attrs["data"] ?? {}),
        settings.legend ?? undefined,
      ),
    [question, settings.legend],
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
        className="sc-course-drag-drop__content sc-course-drag-drop__content--runtime"
        data-assessment-interaction-content=""
        data-slot="drag-drop-content"
        data-surface-drag-drop-interaction=""
      >
        <DragDropCourseInteraction
          assessmentTargetId={assessmentTargetId}
          content={content}
          presentation="full-slide"
        />
      </div>
    </FullSlideQuestionStage>
  );
}

function createRuntimeConfig(question: ProseMirrorNode): AssessmentRuntimeProblemConfig {
  const assessmentTargetId = readAssessmentTargetId(question);
  const settings = DragDropSettingsSchema.parse(question.attrs["settings"] ?? {});
  const interaction = AssessmentInteractionContractSchema.parse(
    projectDragDropInteraction(question.toJSON()),
  );
  if (interaction.kind !== "spatial-placement") {
    throw new Error('Surface Drag and Drop runtime requires a "spatial-placement" interaction.');
  }
  const responseCodec = {
    ...dragDropResponseCodec,
    toContractResponse: (response: unknown) =>
      dragDropResponseCodec.toContractResponse(response, interaction),
    fromContractResponse: (
      response: Parameters<typeof dragDropResponseCodec.fromContractResponse>[0],
    ) => dragDropResponseCodec.fromContractResponse(response, interaction),
    hasResponse: (response: unknown) => dragDropResponseCodec.hasResponse(response, interaction),
  };
  const activityDescription = assessmentActivityDescription(question);
  const projectedSettings = projectDragDropSettings(settings);
  return {
    kind: "spatial-placement",
    targetId: assessmentTargetId,
    interactionKind: "spatial-placement",
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

function findSurfaceDragDropQuestion(surface: ProseMirrorNode): ProseMirrorNode {
  const questions: ProseMirrorNode[] = [];
  for (let index = 0; index < surface.childCount; index += 1) {
    const child = surface.child(index);
    if (child.type.name === SURFACE_DRAG_DROP_QUESTION_NODE_TYPE) questions.push(child);
  }
  if (questions.length !== 1) {
    throw new Error("Drag and Drop Question Surface requires exactly one private question node.");
  }
  return questions[0]!;
}

function dragDropCanvas(question: ProseMirrorNode): ProseMirrorNode {
  for (let index = 0; index < question.childCount; index += 1) {
    const child = question.child(index);
    if (child.type.name === "drag_drop_canvas") return child;
  }
  throw new Error("Surface Drag and Drop question is missing its canvas.");
}

function readAssessmentTargetId(question: ProseMirrorNode): string {
  const id = question.attrs["id"];
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Surface Drag and Drop question is missing its assessment target id.");
  }
  return id;
}

function assessmentActivityDescription(question: ProseMirrorNode): string | undefined {
  for (let index = 0; index < question.childCount; index += 1) {
    const child = question.child(index);
    if (child.type.name === "assessment_prompt")
      return textBetween(child.toJSON()).trim() || undefined;
  }
  return undefined;
}
