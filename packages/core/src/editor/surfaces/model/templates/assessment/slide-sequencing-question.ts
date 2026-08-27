import {
  AssessmentTargetContractSchema,
  SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
  SequencingPrivateAssessmentSchema,
  SequencingSettingsSchema,
} from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { assessmentControlDefinition } from "@/editor/blocks/assessment/shared/model/assessment-control-definition";
import {
  projectSequencingAssessment,
  projectSequencingInteraction,
  projectSequencingLearnerNode,
  projectSequencingSettings,
} from "@/editor/blocks/assessment/sequencing/assessment";
import {
  cloneJsonNodeWithoutContent,
  readAttrs,
  readContent,
  readStringAttr,
} from "@/editor/blocks/assessment/shared/publication/projection";
import { SurfaceSettingsSchema } from "@/schemas/course-document";
import { createSurfaceAssessmentTargets } from "../../assessment/surface-assessment-target";
import { SURFACE_SEQUENCING_QUESTION_NODE_TYPE } from "../../assessment/surface-sequencing-question-node";
import { createSurfaceDocumentSemantics } from "../../surface-document-semantics";
import { DEFAULT_SURFACE_SETTINGS } from "../../surface-settings";
import type { SurfaceVariantDefinition } from "../../surface-variant-definition";

export const DEFAULT_SLIDE_SEQUENCING_QUESTION_SURFACE_SETTINGS =
  SurfaceSettingsSchema.parse(DEFAULT_SURFACE_SETTINGS);

const SLIDE_SEQUENCING_QUESTION_VARIANT_ID = "slide-sequencing-question";

function projectSurfaceSequencingTargets(surface: JSONContent) {
  const surfaceContent = readContent(surface);
  const questions = surfaceContent.filter(
    (child) => child.type === SURFACE_SEQUENCING_QUESTION_NODE_TYPE,
  );
  const question = surfaceContent.length === 1 && questions.length === 1 ? questions[0] : undefined;
  if (!question) {
    throw new Error(
      `Surface "${SLIDE_SEQUENCING_QUESTION_VARIANT_ID}" must contain exactly one sequencing question.`,
    );
  }

  const assessmentTargetId = readStringAttr(question, "id");
  if (!assessmentTargetId) {
    throw new Error(
      `Surface "${SLIDE_SEQUENCING_QUESTION_VARIANT_ID}" question is missing its assessment target id.`,
    );
  }

  const settings = SequencingSettingsSchema.parse(readAttrs(question)["settings"] ?? {});
  const target = AssessmentTargetContractSchema.parse({
    schemaVersion: SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
    targetId: assessmentTargetId,
    blockId: assessmentTargetId,
    blockType: "sequencing",
    interaction: projectSequencingInteraction(question),
    assessment: projectSequencingAssessment(question),
    settings: {
      feedbackMode: settings.feedbackMode,
      isGraded: settings.isGraded,
      showAnswer: settings.showAnswer,
      points: settings.points,
      maxAttempts: settings.maxAttempts,
      ...projectSequencingSettings(settings),
    },
  });

  return createSurfaceAssessmentTargets([target]);
}

function projectLearnerSequencingSurface(surface: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(surface),
    ...(surface.content
      ? {
          content: readContent(surface).map((child) =>
            child.type === SURFACE_SEQUENCING_QUESTION_NODE_TYPE
              ? projectSequencingLearnerNode(child)
              : child,
          ),
        }
      : {}),
  };
}

function createSequencingItem(id: string) {
  return {
    type: "sequencing_item",
    attrs: { id },
    content: [{ type: "paragraph" }],
  };
}

export const slideSequencingQuestionSurfaceDefinition = {
  id: SLIDE_SEQUENCING_QUESTION_VARIANT_ID,
  modes: ["slideshow"],
  title: "Sequencing Question",
  description: "Full-slide question for arranging items in order.",
  catalogue: {
    section: "assessment",
    order: 20,
    preview: {
      kind: "column",
      gap: "small",
      children: [
        { kind: "slot", role: "title", emphasis: "strong" },
        { kind: "slot", role: "panel" },
        { kind: "slot", role: "panel" },
        { kind: "slot", role: "panel" },
      ],
    },
  },
  settingsSchema: SurfaceSettingsSchema,
  documentSemantics: createSurfaceDocumentSemantics({
    contentRootNodeTypes: [SURFACE_SEQUENCING_QUESTION_NODE_TYPE],
  }),
  control: assessmentControlDefinition,
  structurePolicy: {
    fixedChildren: [{ type: SURFACE_SEQUENCING_QUESTION_NODE_TYPE }],
    allowRootInsertion: false,
  },
  assessmentTargets: {
    projectTargets: projectSurfaceSequencingTargets,
    projectLearnerSurface: projectLearnerSequencingSurface,
  },
  createSurface: ({ surfaceId }) => {
    const itemIds = [createEmbeddedNodeId(), createEmbeddedNodeId(), createEmbeddedNodeId()];

    return {
      type: "surface",
      attrs: {
        id: surfaceId,
        variant: SLIDE_SEQUENCING_QUESTION_VARIANT_ID,
        settings: DEFAULT_SLIDE_SEQUENCING_QUESTION_SURFACE_SETTINGS,
      },
      content: [
        {
          type: SURFACE_SEQUENCING_QUESTION_NODE_TYPE,
          attrs: {
            settings: SequencingSettingsSchema.parse({}),
            assessment: SequencingPrivateAssessmentSchema.parse({
              correctOrder: itemIds,
            }),
          },
          content: [
            {
              type: "assessment_title",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Sequencing" }] }],
            },
            {
              type: "assessment_instructions",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Drag to reorder" }] },
              ],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "sequencing_items_group",
              content: itemIds.map(createSequencingItem),
            },
            {
              type: "assessment_actions_group",
              content: [
                { type: "assessment_hints_group" },
                { type: "assessment_summary_feedback" },
              ],
            },
          ],
        },
      ],
    };
  },
} satisfies SurfaceVariantDefinition;
