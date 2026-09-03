import {
  AssessmentTargetContractSchema,
  FillBlanksPrivateAssessmentSchema,
  FillBlanksSettingsSchema,
  SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
} from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import { createFillBlankAssessmentEntry } from "@/editor/blocks/assessment/fill-blanks/commands";
import {
  projectFillBlanksAssessment,
  projectFillBlanksInteraction,
  projectFillBlanksLearnerNode,
  projectFillBlanksSettings,
} from "@/editor/assessment/fill-blanks/assessment";
import { assessmentControlDefinition } from "@/editor/assessment/shared/model/assessment-control-definition";
import {
  cloneJsonNodeWithoutContent,
  readAttrs,
  readContent,
  readStringAttr,
} from "@/editor/assessment/shared/publication/projection";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { SurfaceSettingsSchema } from "@/schemas/course-document";

import { createSurfaceAssessmentTargets } from "../../assessment/surface-assessment-target";
import { SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE } from "../../assessment/surface-fill-blanks-question-node";
import { matchFixedSurfaceChildrenFromJSON } from "../../policies/surface-fixed-structure";
import { createSurfaceDocumentSemantics } from "../../surface-document-semantics";
import { DEFAULT_SURFACE_SETTINGS } from "../../surface-settings";
import type { FixedSurfaceChild, SurfaceVariantDefinition } from "../../surface-variant-definition";

export const DEFAULT_SLIDE_FILL_BLANKS_QUESTION_SURFACE_SETTINGS =
  SurfaceSettingsSchema.parse(DEFAULT_SURFACE_SETTINGS);

const SLIDE_FILL_BLANKS_QUESTION_VARIANT_ID = "slide-fill-blanks-question";
const SLIDE_FILL_BLANKS_QUESTION_FIXED_CHILDREN = [
  { type: SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE },
] as const satisfies readonly FixedSurfaceChild[];

function projectSurfaceFillBlanksTargets(surface: JSONContent) {
  const question = resolveFillBlanksQuestion(surface);

  const assessmentTargetId = readStringAttr(question, "id");
  if (!assessmentTargetId) {
    throw new Error(
      `Surface "${SLIDE_FILL_BLANKS_QUESTION_VARIANT_ID}" question is missing its assessment target id.`,
    );
  }

  const settings = FillBlanksSettingsSchema.parse(readAttrs(question)["settings"] ?? {});
  const target = AssessmentTargetContractSchema.parse({
    schemaVersion: SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
    targetId: assessmentTargetId,
    blockId: assessmentTargetId,
    blockType: "fill_blanks",
    interaction: projectFillBlanksInteraction(question),
    assessment: projectFillBlanksAssessment(question),
    settings: {
      feedbackMode: settings.feedbackMode,
      isGraded: settings.isGraded,
      showAnswer: settings.showAnswer,
      points: settings.points,
      maxAttempts: settings.maxAttempts,
      ...projectFillBlanksSettings(settings),
    },
  });
  return createSurfaceAssessmentTargets([target]);
}

function projectLearnerFillBlanksSurface(surface: JSONContent): JSONContent {
  const question = resolveFillBlanksQuestion(surface);
  return {
    ...cloneJsonNodeWithoutContent(surface),
    ...(surface.content
      ? {
          content: readContent(surface).map((child) =>
            child === question ? projectFillBlanksLearnerNode(child) : child,
          ),
        }
      : {}),
  };
}

function resolveFillBlanksQuestion(surface: JSONContent): JSONContent {
  const result = matchFixedSurfaceChildrenFromJSON(
    surface,
    SLIDE_FILL_BLANKS_QUESTION_FIXED_CHILDREN,
  );
  if (!result.exact) {
    throw new Error(
      `Surface "${SLIDE_FILL_BLANKS_QUESTION_VARIANT_ID}" must contain exactly one Fill in Blanks question.`,
    );
  }
  return result.children[0]!;
}

export const slideFillBlanksQuestionSurfaceDefinition = {
  id: SLIDE_FILL_BLANKS_QUESTION_VARIANT_ID,
  modes: ["slideshow"],
  title: "Fill in the Blanks",
  description: "Full-slide question with answers embedded in a passage.",
  catalogue: {
    section: "assessment",
    order: 80,
    preview: {
      kind: "column",
      children: [
        { kind: "slot", role: "title" },
        { kind: "slot", role: "content" },
      ],
      proportions: [1, 3],
    },
  },
  settingsSchema: SurfaceSettingsSchema,
  documentSemantics: createSurfaceDocumentSemantics({
    contentRootNodeTypes: [SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE],
  }),
  control: assessmentControlDefinition,
  structurePolicy: {
    fixedChildren: SLIDE_FILL_BLANKS_QUESTION_FIXED_CHILDREN,
    allowRootInsertion: false,
  },
  assessmentTargets: {
    projectTargets: projectSurfaceFillBlanksTargets,
    projectLearnerSurface: projectLearnerFillBlanksSurface,
  },
  createSurface: ({ surfaceId }) => {
    const blanks = [
      createBlank("third", "third"),
      createBlank("365 days", "365 days"),
      createBlank("Moon", "Moon"),
    ];
    return {
      type: "surface",
      attrs: {
        id: surfaceId,
        variant: SLIDE_FILL_BLANKS_QUESTION_VARIANT_ID,
        settings: DEFAULT_SLIDE_FILL_BLANKS_QUESTION_SURFACE_SETTINGS,
      },
      content: [
        {
          type: SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE,
          attrs: {
            settings: FillBlanksSettingsSchema.parse({}),
            assessment: FillBlanksPrivateAssessmentSchema.parse({
              blanksById: Object.fromEntries(
                blanks.map((blank) => [blank.id, blank.assessmentEntry]),
              ),
            }),
          },
          content: [
            {
              type: "assessment_title",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Fill in the blanks" }] },
              ],
            },
            {
              type: "assessment_instructions",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Complete each gap" }] },
              ],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "fill_blanks_body",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Earth is the " },
                    blankNode(blanks[0]!),
                    { type: "text", text: " planet from the Sun. It completes one orbit in " },
                    blankNode(blanks[1]!),
                    { type: "text", text: " and has one natural satellite, the " },
                    blankNode(blanks[2]!),
                    { type: "text", text: "." },
                  ],
                },
              ],
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

function createBlank(answer: string, placeholder: string) {
  return {
    id: createEmbeddedNodeId(),
    placeholder,
    assessmentEntry: createFillBlankAssessmentEntry(answer),
  };
}

function blankNode(blank: ReturnType<typeof createBlank>): JSONContent {
  return {
    type: "fill_blank",
    attrs: { id: blank.id, placeholder: blank.placeholder },
  };
}
