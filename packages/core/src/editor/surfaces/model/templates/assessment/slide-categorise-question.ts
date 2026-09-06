import {
  AssessmentTargetContractSchema,
  CategorisePrivateAssessmentSchema,
  CategoriseSettingsSchema,
  SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
} from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { assessmentControlDefinition } from "@/editor/assessment/shared/model/assessment-control-definition";
import {
  projectCategoriseAssessment,
  projectCategoriseInteraction,
  projectCategoriseLearnerNode,
  projectCategoriseSettings,
} from "@/editor/assessment/categorise/assessment";
import {
  cloneJsonNodeWithoutContent,
  readAttrs,
  readContent,
  readStringAttr,
} from "@/editor/assessment/shared/publication/projection";
import { SurfaceSettingsSchema } from "@/schemas/course-document";
import { createSurfaceAssessmentTargets } from "../../assessment/surface-assessment-target";
import { SURFACE_CATEGORISE_QUESTION_NODE_TYPE } from "../../assessment/surface-categorise-question-node";
import { matchFixedSurfaceChildrenFromJSON } from "../../policies/surface-fixed-structure";
import { createSurfaceDocumentTree } from "../../surface-document-tree";
import { DEFAULT_SURFACE_SETTINGS } from "../../surface-settings";
import type { FixedSurfaceChild, SurfaceVariantDefinition } from "../../surface-variant-definition";

export const DEFAULT_SLIDE_CATEGORISE_QUESTION_SURFACE_SETTINGS =
  SurfaceSettingsSchema.parse(DEFAULT_SURFACE_SETTINGS);

const SLIDE_CATEGORISE_QUESTION_VARIANT_ID = "slide-categorise-question";
const SLIDE_CATEGORISE_QUESTION_FIXED_CHILDREN = [
  { type: SURFACE_CATEGORISE_QUESTION_NODE_TYPE },
] as const satisfies readonly FixedSurfaceChild[];

function projectSurfaceCategoriseTargets(surface: JSONContent) {
  const question = resolveCategoriseQuestion(surface);

  const assessmentTargetId = readStringAttr(question, "id");
  if (!assessmentTargetId) {
    throw new Error(
      `Surface "${SLIDE_CATEGORISE_QUESTION_VARIANT_ID}" question is missing its assessment target id.`,
    );
  }

  const settings = CategoriseSettingsSchema.parse(readAttrs(question)["settings"] ?? {});
  const target = AssessmentTargetContractSchema.parse({
    schemaVersion: SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
    targetId: assessmentTargetId,
    blockId: assessmentTargetId,
    blockType: "categorise",
    interaction: projectCategoriseInteraction(question),
    assessment: projectCategoriseAssessment(question),
    settings: {
      feedbackMode: settings.feedbackMode,
      isGraded: settings.isGraded,
      showAnswer: settings.showAnswer,
      points: settings.points,
      maxAttempts: settings.maxAttempts,
      ...projectCategoriseSettings(settings),
    },
  });

  return createSurfaceAssessmentTargets([target]);
}

function projectLearnerCategoriseSurface(surface: JSONContent): JSONContent {
  const question = resolveCategoriseQuestion(surface);
  return {
    ...cloneJsonNodeWithoutContent(surface),
    ...(surface.content
      ? {
          content: readContent(surface).map((child) =>
            child === question ? projectCategoriseLearnerNode(child) : child,
          ),
        }
      : {}),
  };
}

function resolveCategoriseQuestion(surface: JSONContent): JSONContent {
  const result = matchFixedSurfaceChildrenFromJSON(
    surface,
    SLIDE_CATEGORISE_QUESTION_FIXED_CHILDREN,
  );
  if (!result.exact) {
    throw new Error(
      `Surface "${SLIDE_CATEGORISE_QUESTION_VARIANT_ID}" must contain exactly one categorise question.`,
    );
  }
  return result.children[0]!;
}

function createCategoriseItem() {
  return {
    type: "categorise_item",
    attrs: { id: createEmbeddedNodeId() },
    content: [{ type: "categorise_item_body", content: [{ type: "paragraph" }] }],
  };
}

function createCategoriseBin() {
  return {
    type: "categorise_bin",
    attrs: { id: createEmbeddedNodeId() },
    content: [
      { type: "categorise_bin_title", content: [{ type: "paragraph" }] },
      {
        type: "categorise_items_group",
        content: [createCategoriseItem(), createCategoriseItem()],
      },
    ],
  };
}

export const slideCategoriseQuestionSurfaceDefinition = {
  id: SLIDE_CATEGORISE_QUESTION_VARIANT_ID,
  modes: ["slideshow"],
  title: "Categorise Question",
  description: "Full-slide question for sorting items into categories.",
  catalogue: {
    section: "assessment",
    order: 10,
    preview: {
      kind: "column",
      gap: "small",
      proportions: [1, 2],
      children: [
        { kind: "slot", role: "title", emphasis: "strong" },
        {
          kind: "row",
          gap: "small",
          children: [
            { kind: "slot", role: "panel" },
            { kind: "slot", role: "panel" },
          ],
        },
      ],
    },
  },
  settingsSchema: SurfaceSettingsSchema,
  documentTree: createSurfaceDocumentTree({
    contentRootNodeTypes: [SURFACE_CATEGORISE_QUESTION_NODE_TYPE],
  }),
  control: assessmentControlDefinition,
  structurePolicy: {
    fixedChildren: SLIDE_CATEGORISE_QUESTION_FIXED_CHILDREN,
    allowRootInsertion: false,
  },
  assessmentTargets: {
    projectTargets: projectSurfaceCategoriseTargets,
    projectLearnerSurface: projectLearnerCategoriseSurface,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: {
      id: surfaceId,
      variant: SLIDE_CATEGORISE_QUESTION_VARIANT_ID,
      settings: DEFAULT_SLIDE_CATEGORISE_QUESTION_SURFACE_SETTINGS,
    },
    content: [
      {
        type: SURFACE_CATEGORISE_QUESTION_NODE_TYPE,
        attrs: {
          settings: CategoriseSettingsSchema.parse({}),
          assessment: CategorisePrivateAssessmentSchema.parse({}),
        },
        content: [
          {
            type: "assessment_title",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Categorise" }] }],
          },
          {
            type: "assessment_instructions",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Sort into categories" }] },
            ],
          },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "categorise_content",
            content: [
              {
                type: "categorise_bins_group",
                content: [createCategoriseBin(), createCategoriseBin()],
              },
            ],
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
