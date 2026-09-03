import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";

import { slideCategoriseQuestionSurfaceDefinition } from "./slide-categorise-question";
import { slideDropdownQuestionSurfaceDefinition } from "./slide-dropdown-question";
import { slideDragDropQuestionSurfaceDefinition } from "./slide-drag-drop-question";
import { slideFillBlanksQuestionSurfaceDefinition } from "./slide-fill-blanks-question";
import { slideImageHotspotQuestionSurfaceDefinition } from "./slide-image-hotspot-question";
import { slideMatchingQuestionSurfaceDefinition } from "./slide-matching-question";
import { slideMultipleChoiceQuestionSurfaceDefinition } from "./slide-multiple-choice-question";
import { slideMultiselectQuestionSurfaceDefinition } from "./slide-multiselect-question";
import { slideSequencingQuestionSurfaceDefinition } from "./slide-sequencing-question";

const ASSESSMENT_SURFACES = [
  {
    definition: slideCategoriseQuestionSurfaceDefinition,
    questionType: "surface_categorise_question",
  },
  {
    definition: slideDropdownQuestionSurfaceDefinition,
    questionType: "surface_dropdown_question",
  },
  {
    definition: slideDragDropQuestionSurfaceDefinition,
    questionType: "surface_drag_drop_question",
  },
  {
    definition: slideFillBlanksQuestionSurfaceDefinition,
    questionType: "surface_fill_blanks_question",
  },
  {
    definition: slideImageHotspotQuestionSurfaceDefinition,
    questionType: "surface_image_hotspot_question",
  },
  {
    definition: slideMatchingQuestionSurfaceDefinition,
    questionType: "surface_matching_question",
  },
  {
    definition: slideMultipleChoiceQuestionSurfaceDefinition,
    questionType: "surface_multiple_choice_question",
  },
  {
    definition: slideMultiselectQuestionSurfaceDefinition,
    questionType: "surface_multiselect_question",
  },
  {
    definition: slideSequencingQuestionSurfaceDefinition,
    questionType: "surface_sequencing_question",
  },
] as const;

describe("assessment Surface publication boundaries", () => {
  it.each(ASSESSMENT_SURFACES)(
    "$definition.id allows optional header and footer boundaries",
    ({ definition, questionType }) => {
      const { question, surface, targetId } = createAuthoredSurface(definition, questionType);
      const header = boundary("surface_header");
      const footer = boundary("surface_footer");

      for (const content of [
        [question],
        [header, question],
        [question, footer],
        [header, question, footer],
      ]) {
        const targets = definition.assessmentTargets.projectTargets({ ...surface, content });

        expect(targets).toHaveLength(1);
        expect(targets[0]).toMatchObject({ targetId, blockId: targetId });
        expect(targets[0]?.assessment).toBeDefined();
      }

      const learnerSurface = definition.assessmentTargets.projectLearnerSurface({
        ...surface,
        content: [header, question, footer],
      });

      expect(learnerSurface.content?.map((child) => child.type)).toEqual([
        "surface_header",
        questionType,
        "surface_footer",
      ]);
      expect(learnerSurface.content?.[0]).toEqual(header);
      expect(learnerSurface.content?.at(-1)).toEqual(footer);
      expect(learnerSurface.content?.[1]?.attrs).not.toHaveProperty("assessment");
    },
  );

  it.each(ASSESSMENT_SURFACES)(
    "$definition.id keeps malformed fixed structure observable as an invariant failure",
    ({ definition, questionType }) => {
      const { question, surface } = createAuthoredSurface(definition, questionType);
      const header = boundary("surface_header");
      const footer = boundary("surface_footer");

      for (const content of [
        [header, header, question, footer],
        [header, question, header, footer],
        [header, footer],
        [header, question, { type: "paragraph" }, footer],
        [header, { type: "paragraph" }, footer],
      ]) {
        const malformedSurface = { ...surface, content };

        expect(() => definition.assessmentTargets.projectTargets(malformedSurface)).toThrow(
          /must contain exactly one/u,
        );
        expect(() => definition.assessmentTargets.projectLearnerSurface(malformedSurface)).toThrow(
          /must contain exactly one/u,
        );
      }
    },
  );
});

function createAuthoredSurface(
  definition: (typeof ASSESSMENT_SURFACES)[number]["definition"],
  questionType: string,
) {
  const surface = definition.createSurface({ surfaceId: createEmbeddedNodeId() });
  const question = surface.content?.find((child) => child.type === questionType);
  if (!question) throw new Error(`Expected ${definition.id} fixed question child.`);

  const targetId = createEmbeddedNodeId();
  const identifiedQuestion = {
    ...question,
    attrs: { ...question.attrs, id: targetId },
    content: (question.content ?? []).map((child) =>
      child.type === "drag_drop_canvas"
        ? {
            ...child,
            attrs: {
              ...("attrs" in child ? child.attrs : {}),
              id: createEmbeddedNodeId(),
            },
          }
        : child,
    ),
  };
  return {
    question:
      questionType === "surface_drag_drop_question"
        ? completeDragDropQuestion(identifiedQuestion)
        : identifiedQuestion,
    surface,
    targetId,
  };
}

function completeDragDropQuestion(question: JSONContent): JSONContent {
  return {
    ...question,
    attrs: {
      ...question.attrs,
      assessment: {
        correctPlacements: [
          {
            markerId: "marker000001",
            geometry: { kind: "circle", centerX: 50, centerY: 50, radius: 5 },
          },
        ],
        feedbackByMarkerId: {},
        summaryFeedback: null,
      },
    },
    content: (question.content ?? []).map((child) =>
      child.type === "drag_drop_canvas"
        ? {
            ...child,
            attrs: {
              ...child.attrs,
              data: {
                image: { mode: "managed", mediaId: "media0000001", alt: "Map" },
                imageAspectRatio: 2,
                defaultMarkerVisual: { kind: "preset", preset: "dot" },
                markers: [{ id: "marker000001", label: "London", visualOverride: null }],
              },
            },
          }
        : child,
    ),
  };
}

function boundary(type: "surface_header" | "surface_footer"): JSONContent {
  return {
    type,
    attrs: { id: createEmbeddedNodeId() },
    content: [
      {
        type: "surface_header_footer_slot",
        attrs: { id: createEmbeddedNodeId(), position: "center" },
        content: [{ type: "paragraph" }],
      },
    ],
  };
}
