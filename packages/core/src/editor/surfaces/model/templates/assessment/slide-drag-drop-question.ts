import {
  AssessmentTargetContractSchema,
  DragDropPrivateAssessmentSchema,
  DragDropSettingsSchema,
  SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
} from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import {
  projectDragDropAssessment,
  projectDragDropInteraction,
  projectDragDropLearnerNode,
  projectDragDropSettings,
} from "@/editor/blocks/assessment/drag-drop/assessment";
import { defaultDragDropCanvasData } from "@/editor/blocks/assessment/drag-drop/drag-drop-canvas-shared";
import { parseDragDropAuthoredQuestion } from "@/editor/blocks/assessment/drag-drop/node";
import { assessmentControlDefinition } from "@/editor/assessment/shared/model/assessment-control-definition";
import {
  cloneJsonNodeWithoutContent,
  readAttrs,
  readContent,
  readStringAttr,
} from "@/editor/assessment/shared/publication/projection";
import { SurfaceSettingsSchema } from "@/schemas/course-document";
import { createSurfaceAssessmentTargets } from "../../assessment/surface-assessment-target";
import { SURFACE_DRAG_DROP_QUESTION_NODE_TYPE } from "../../assessment/surface-drag-drop-question-node";
import { matchFixedSurfaceChildrenFromJSON } from "../../policies/surface-fixed-structure";
import { createSurfaceDocumentSemantics } from "../../surface-document-semantics";
import { DEFAULT_SURFACE_SETTINGS } from "../../surface-settings";
import type { FixedSurfaceChild, SurfaceVariantDefinition } from "../../surface-variant-definition";

export const DEFAULT_SLIDE_DRAG_DROP_QUESTION_SURFACE_SETTINGS =
  SurfaceSettingsSchema.parse(DEFAULT_SURFACE_SETTINGS);

const SLIDE_DRAG_DROP_QUESTION_VARIANT_ID = "slide-drag-drop-question";
const SLIDE_DRAG_DROP_QUESTION_FIXED_CHILDREN = [
  { type: SURFACE_DRAG_DROP_QUESTION_NODE_TYPE },
] as const satisfies readonly FixedSurfaceChild[];

function projectSurfaceDragDropTargets(surface: JSONContent) {
  const question = resolveDragDropQuestion(surface);
  const assessmentTargetId = readStringAttr(question, "id");
  if (!assessmentTargetId) {
    throw new Error(
      `Surface "${SLIDE_DRAG_DROP_QUESTION_VARIANT_ID}" question is missing its assessment target id.`,
    );
  }
  const settings = DragDropSettingsSchema.parse(readAttrs(question)["settings"] ?? {});
  return createSurfaceAssessmentTargets([
    AssessmentTargetContractSchema.parse({
      schemaVersion: SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
      targetId: assessmentTargetId,
      blockId: assessmentTargetId,
      blockType: "drag_drop",
      interaction: projectDragDropInteraction(question),
      assessment: projectDragDropAssessment(question),
      settings: {
        feedbackMode: settings.feedbackMode,
        isGraded: settings.isGraded,
        showAnswer: settings.showAnswer,
        points: settings.points,
        maxAttempts: settings.maxAttempts,
        ...projectDragDropSettings(settings),
      },
    }),
  ]);
}

function projectLearnerDragDropSurface(surface: JSONContent): JSONContent {
  const question = resolveDragDropQuestion(surface);
  if (!parseDragDropAuthoredQuestion(question).ready) {
    throw new Error("Drag and Drop question is not learner-ready.");
  }
  return {
    ...cloneJsonNodeWithoutContent(surface),
    ...(surface.content
      ? {
          content: readContent(surface).map((child) =>
            child === question ? projectDragDropLearnerNode(child) : child,
          ),
        }
      : {}),
  };
}

function resolveDragDropQuestion(surface: JSONContent): JSONContent {
  const result = matchFixedSurfaceChildrenFromJSON(
    surface,
    SLIDE_DRAG_DROP_QUESTION_FIXED_CHILDREN,
  );
  if (!result.exact) {
    throw new Error(
      `Surface "${SLIDE_DRAG_DROP_QUESTION_VARIANT_ID}" must contain exactly one Drag and Drop question.`,
    );
  }
  return result.children[0]!;
}

export const slideDragDropQuestionSurfaceDefinition = {
  id: SLIDE_DRAG_DROP_QUESTION_VARIANT_ID,
  modes: ["slideshow"],
  title: "Drag and Drop Question",
  description: "Full-slide question for placing named markers on an image.",
  catalogue: {
    section: "assessment",
    order: 75,
    preview: {
      kind: "row",
      proportions: [2, 1],
      gap: "small",
      children: [
        { kind: "slot", role: "image" },
        { kind: "slot", role: "panel" },
      ],
    },
  },
  settingsSchema: SurfaceSettingsSchema,
  documentSemantics: createSurfaceDocumentSemantics({
    contentRootNodeTypes: [SURFACE_DRAG_DROP_QUESTION_NODE_TYPE],
  }),
  control: assessmentControlDefinition,
  structurePolicy: {
    fixedChildren: SLIDE_DRAG_DROP_QUESTION_FIXED_CHILDREN,
    allowRootInsertion: false,
  },
  assessmentTargets: {
    projectTargets: projectSurfaceDragDropTargets,
    projectLearnerSurface: projectLearnerDragDropSurface,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: {
      id: surfaceId,
      variant: SLIDE_DRAG_DROP_QUESTION_VARIANT_ID,
      settings: DEFAULT_SLIDE_DRAG_DROP_QUESTION_SURFACE_SETTINGS,
    },
    content: [
      {
        type: SURFACE_DRAG_DROP_QUESTION_NODE_TYPE,
        attrs: {
          settings: DragDropSettingsSchema.parse({ legend: "Place each marker on the image" }),
          assessment: DragDropPrivateAssessmentSchema.parse({}),
        },
        content: [
          {
            type: "assessment_title",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Drag and Drop" }] }],
          },
          {
            type: "assessment_instructions",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Place each marker on the image" }],
              },
            ],
          },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "drag_drop_canvas",
            attrs: { data: defaultDragDropCanvasData() },
          },
          {
            type: "assessment_actions_group",
            content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
          },
        ],
      },
    ],
  }),
} satisfies SurfaceVariantDefinition;
