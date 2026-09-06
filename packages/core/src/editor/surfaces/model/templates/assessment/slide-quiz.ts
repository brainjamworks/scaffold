import type { JSONContent } from "@tiptap/core";
import { QuizSettingsSchema } from "@scaffold/contracts";

import { quizControlDefinition } from "@/editor/blocks/assessment/quiz/quiz-control-definition";
import {
  cloneJsonNodeWithoutContent,
  readContent,
  readStringAttr,
} from "@/editor/assessment/shared/publication/projection";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { SurfaceSettingsSchema } from "@/schemas/course-document";

import { SURFACE_CATEGORISE_QUESTION_NODE_TYPE } from "../../assessment/surface-categorise-question-node";
import { SURFACE_DROPDOWN_QUESTION_NODE_TYPE } from "../../assessment/surface-dropdown-question-node";
import { SURFACE_DRAG_DROP_QUESTION_NODE_TYPE } from "../../assessment/surface-drag-drop-question-node";
import { SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE } from "../../assessment/surface-fill-blanks-question-node";
import { SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE } from "../../assessment/surface-image-hotspot-question-node";
import { SURFACE_MATCHING_QUESTION_NODE_TYPE } from "../../assessment/surface-matching-question-node";
import { SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE } from "../../assessment/surface-multiple-choice-question-node";
import { SURFACE_MULTISELECT_QUESTION_NODE_TYPE } from "../../assessment/surface-multiselect-question-node";
import { SURFACE_QUIZ_NODE_TYPE } from "../../assessment/surface-quiz-node";
import { SURFACE_SEQUENCING_QUESTION_NODE_TYPE } from "../../assessment/surface-sequencing-question-node";
import { matchFixedSurfaceChildrenFromJSON } from "../../policies/surface-fixed-structure";
import { createSurfaceDocumentTree } from "../../surface-document-tree";
import { DEFAULT_SURFACE_SETTINGS } from "../../surface-settings";
import type { FixedSurfaceChild, SurfaceVariantDefinition } from "../../surface-variant-definition";
import { slideCategoriseQuestionSurfaceDefinition } from "./slide-categorise-question";
import { slideDropdownQuestionSurfaceDefinition } from "./slide-dropdown-question";
import { slideDragDropQuestionSurfaceDefinition } from "./slide-drag-drop-question";
import { slideFillBlanksQuestionSurfaceDefinition } from "./slide-fill-blanks-question";
import { slideImageHotspotQuestionSurfaceDefinition } from "./slide-image-hotspot-question";
import { slideMatchingQuestionSurfaceDefinition } from "./slide-matching-question";
import { slideMultipleChoiceQuestionSurfaceDefinition } from "./slide-multiple-choice-question";
import { slideMultiselectQuestionSurfaceDefinition } from "./slide-multiselect-question";
import { slideSequencingQuestionSurfaceDefinition } from "./slide-sequencing-question";

export const SLIDE_QUIZ_VARIANT_ID = "slide-quiz";

export const DEFAULT_SLIDE_QUIZ_SURFACE_SETTINGS =
  SurfaceSettingsSchema.parse(DEFAULT_SURFACE_SETTINGS);

const SLIDE_QUIZ_FIXED_CHILDREN = [
  { type: SURFACE_QUIZ_NODE_TYPE },
] as const satisfies readonly FixedSurfaceChild[];

const QUESTION_SURFACE_DEFINITIONS: ReadonlyMap<string, SurfaceVariantDefinition> = new Map<
  string,
  SurfaceVariantDefinition
>([
  [SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE, slideMultipleChoiceQuestionSurfaceDefinition],
  [SURFACE_MULTISELECT_QUESTION_NODE_TYPE, slideMultiselectQuestionSurfaceDefinition],
  [SURFACE_DROPDOWN_QUESTION_NODE_TYPE, slideDropdownQuestionSurfaceDefinition],
  [SURFACE_DRAG_DROP_QUESTION_NODE_TYPE, slideDragDropQuestionSurfaceDefinition],
  [SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE, slideFillBlanksQuestionSurfaceDefinition],
  [SURFACE_CATEGORISE_QUESTION_NODE_TYPE, slideCategoriseQuestionSurfaceDefinition],
  [SURFACE_SEQUENCING_QUESTION_NODE_TYPE, slideSequencingQuestionSurfaceDefinition],
  [SURFACE_MATCHING_QUESTION_NODE_TYPE, slideMatchingQuestionSurfaceDefinition],
  [SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE, slideImageHotspotQuestionSurfaceDefinition],
] as const);

export const slideQuizSurfaceDefinition = {
  id: SLIDE_QUIZ_VARIANT_ID,
  modes: ["slideshow"],
  title: "Quiz",
  description: "A full-slide quiz with internally navigated questions.",
  catalogue: {
    section: "assessment",
    order: 90,
    preview: {
      kind: "column",
      children: [
        { kind: "slot", role: "title" },
        { kind: "slot", role: "content" },
        { kind: "slot", role: "content" },
      ],
      proportions: [1, 3, 1],
    },
  },
  settingsSchema: SurfaceSettingsSchema,
  documentTree: createSurfaceDocumentTree({
    contentRootNodeTypes: [SURFACE_QUIZ_NODE_TYPE],
  }),
  control: quizControlDefinition,
  structurePolicy: {
    fixedChildren: SLIDE_QUIZ_FIXED_CHILDREN,
    allowRootInsertion: false,
  },
  assessmentTargets: {
    projectTargets: (surface) => {
      const quiz = resolveSurfaceQuiz(surface);
      return readContent(quiz).flatMap((question) => {
        const definition = requireQuestionSurfaceDefinition(question.type);
        const capability = definition.assessmentTargets;
        if (!capability) {
          throw new Error(`Quiz question Surface "${definition.id}" cannot project targets.`);
        }
        return capability.projectTargets(wrapQuestionAsSurface(question, definition));
      });
    },
    projectLearnerSurface: (surface) => {
      const quiz = resolveSurfaceQuiz(surface);
      const learnerQuiz = {
        ...cloneJsonNodeWithoutContent(quiz),
        content: readContent(quiz).map((question) => {
          const definition = requireQuestionSurfaceDefinition(question.type);
          const capability = definition.assessmentTargets;
          if (!capability) {
            throw new Error(`Quiz question Surface "${definition.id}" cannot redact learners.`);
          }
          const projected = capability.projectLearnerSurface(
            wrapQuestionAsSurface(question, definition),
          );
          const learnerQuestion = readContent(projected)[0];
          if (!learnerQuestion || learnerQuestion.type !== question.type) {
            throw new Error(`Quiz question Surface "${definition.id}" returned invalid content.`);
          }
          return learnerQuestion;
        }),
      };
      return {
        ...cloneJsonNodeWithoutContent(surface),
        content: readContent(surface).map((child) => (child === quiz ? learnerQuiz : child)),
      };
    },
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: {
      id: surfaceId,
      variant: SLIDE_QUIZ_VARIANT_ID,
      settings: DEFAULT_SLIDE_QUIZ_SURFACE_SETTINGS,
    },
    content: [createInitialQuiz()],
  }),
} satisfies SurfaceVariantDefinition;

function createInitialQuiz(): JSONContent {
  return {
    type: SURFACE_QUIZ_NODE_TYPE,
    attrs: {
      id: createEmbeddedNodeId(),
      settings: QuizSettingsSchema.parse({}),
    },
    content: [createQuizQuestion(SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE)],
  };
}

export function createQuizQuestion(nodeType: string): JSONContent {
  const definition = requireQuestionSurfaceDefinition(nodeType);
  const source = definition.createSurface({ surfaceId: createEmbeddedNodeId() }).content?.[0];
  if (!source || source.type !== nodeType) {
    throw new Error(`Quiz question Surface "${definition.id}" created invalid content.`);
  }
  return {
    ...source,
    attrs: { ...source.attrs, id: createEmbeddedNodeId() },
  };
}

function resolveSurfaceQuiz(surface: JSONContent): JSONContent {
  const result = matchFixedSurfaceChildrenFromJSON(surface, SLIDE_QUIZ_FIXED_CHILDREN);
  if (!result.exact) {
    throw new Error(`Surface "${SLIDE_QUIZ_VARIANT_ID}" must contain one private Quiz.`);
  }
  return result.children[0]!;
}

function requireQuestionSurfaceDefinition(nodeType: string | undefined) {
  const definition = nodeType ? QUESTION_SURFACE_DEFINITIONS.get(nodeType) : undefined;
  if (!definition) {
    throw new Error(`Surface Quiz contains unsupported question type "${String(nodeType)}".`);
  }
  return definition;
}

function wrapQuestionAsSurface(
  question: JSONContent,
  definition: SurfaceVariantDefinition,
): JSONContent {
  return {
    type: "surface",
    attrs: {
      id: readStringAttr(question, "id") || createEmbeddedNodeId(),
      variant: definition.id,
      settings: SurfaceSettingsSchema.parse(DEFAULT_SURFACE_SETTINGS),
    },
    content: [question],
  };
}
