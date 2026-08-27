import {
  AssessmentTargetContractSchema,
  ImageHotspotCanvasDataSchema,
  ImageHotspotPrivateAssessmentSchema,
  ImageHotspotSettingsSchema,
  SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
} from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import { assessmentControlDefinition } from "@/editor/blocks/assessment/shared/model/assessment-control-definition";
import {
  projectImageHotspotAssessment,
  projectImageHotspotInteraction,
  projectImageHotspotLearnerNode,
  projectImageHotspotSettings,
} from "@/editor/blocks/assessment/image-hotspot/assessment";
import {
  cloneJsonNodeWithoutContent,
  readAttrs,
  readContent,
  readStringAttr,
} from "@/editor/blocks/assessment/shared/publication/projection";
import { SurfaceSettingsSchema } from "@/schemas/course-document";
import { createSurfaceAssessmentTargets } from "../../assessment/surface-assessment-target";
import { SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE } from "../../assessment/surface-image-hotspot-question-node";
import { createSurfaceDocumentSemantics } from "../../surface-document-semantics";
import { DEFAULT_SURFACE_SETTINGS } from "../../surface-settings";
import type { SurfaceVariantDefinition } from "../../surface-variant-definition";

export const DEFAULT_SLIDE_IMAGE_HOTSPOT_QUESTION_SURFACE_SETTINGS =
  SurfaceSettingsSchema.parse(DEFAULT_SURFACE_SETTINGS);

const SLIDE_IMAGE_HOTSPOT_QUESTION_VARIANT_ID = "slide-image-hotspot-question";

function projectSurfaceImageHotspotTargets(surface: JSONContent) {
  const content = readContent(surface);
  const questions = content.filter(
    (child) => child.type === SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE,
  );
  const question = content.length === 1 && questions.length === 1 ? questions[0] : undefined;
  if (!question) {
    throw new Error(
      `Surface "${SLIDE_IMAGE_HOTSPOT_QUESTION_VARIANT_ID}" must contain exactly one image-hotspot question.`,
    );
  }

  const assessmentTargetId = readStringAttr(question, "id");
  if (!assessmentTargetId) {
    throw new Error(
      `Surface "${SLIDE_IMAGE_HOTSPOT_QUESTION_VARIANT_ID}" question is missing its assessment target id.`,
    );
  }

  const settings = ImageHotspotSettingsSchema.parse(readAttrs(question)["settings"] ?? {});
  const target = AssessmentTargetContractSchema.parse({
    schemaVersion: SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
    targetId: assessmentTargetId,
    blockId: assessmentTargetId,
    blockType: "image_hotspot",
    interaction: projectImageHotspotInteraction(question),
    assessment: projectImageHotspotAssessment(question),
    settings: {
      feedbackMode: settings.feedbackMode,
      isGraded: settings.isGraded,
      showAnswer: settings.showAnswer,
      points: settings.points,
      maxAttempts: settings.maxAttempts,
      ...projectImageHotspotSettings(settings),
    },
  });
  return createSurfaceAssessmentTargets([target]);
}

function projectLearnerImageHotspotSurface(surface: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(surface),
    ...(surface.content
      ? {
          content: readContent(surface).map((child) =>
            child.type === SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE
              ? projectImageHotspotLearnerNode(child)
              : child,
          ),
        }
      : {}),
  };
}

export const slideImageHotspotQuestionSurfaceDefinition = {
  id: SLIDE_IMAGE_HOTSPOT_QUESTION_VARIANT_ID,
  modes: ["slideshow"],
  title: "Image Hotspot Question",
  description: "Full-slide question for selecting regions on an image.",
  catalogue: {
    section: "assessment",
    order: 40,
    preview: {
      kind: "overlay",
      placement: "centre",
      base: { kind: "slot", role: "image" },
      overlay: { kind: "slot", role: "panel" },
    },
  },
  settingsSchema: SurfaceSettingsSchema,
  documentSemantics: createSurfaceDocumentSemantics({
    contentRootNodeTypes: [SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE],
  }),
  control: assessmentControlDefinition,
  structurePolicy: {
    fixedChildren: [{ type: SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE }],
    allowRootInsertion: false,
  },
  assessmentTargets: {
    projectTargets: projectSurfaceImageHotspotTargets,
    projectLearnerSurface: projectLearnerImageHotspotSurface,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: {
      id: surfaceId,
      variant: SLIDE_IMAGE_HOTSPOT_QUESTION_VARIANT_ID,
      settings: DEFAULT_SLIDE_IMAGE_HOTSPOT_QUESTION_SURFACE_SETTINGS,
    },
    content: [
      {
        type: SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE,
        attrs: {
          settings: ImageHotspotSettingsSchema.parse({ legend: "Select regions" }),
          assessment: ImageHotspotPrivateAssessmentSchema.parse({}),
        },
        content: [
          {
            type: "assessment_title",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Image hotspot" }] }],
          },
          {
            type: "assessment_instructions",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Select the correct regions" }],
              },
            ],
          },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "image_hotspot_canvas",
            attrs: { data: ImageHotspotCanvasDataSchema.parse({}) },
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
