import { describe, expect, it } from "vite-plus/test";

import { assessmentControlDefinition } from "@/editor/blocks/assessment/shared/model/assessment-control-definition";

import { slideCategoriseQuestionSurfaceDefinition } from "./slide-categorise-question";
import { slideDropdownQuestionSurfaceDefinition } from "./slide-dropdown-question";
import { slideFillBlanksQuestionSurfaceDefinition } from "./slide-fill-blanks-question";
import { slideImageHotspotQuestionSurfaceDefinition } from "./slide-image-hotspot-question";
import { slideMatchingQuestionSurfaceDefinition } from "./slide-matching-question";
import { slideMultipleChoiceQuestionSurfaceDefinition } from "./slide-multiple-choice-question";
import { slideMultiselectQuestionSurfaceDefinition } from "./slide-multiselect-question";
import { slideSequencingQuestionSurfaceDefinition } from "./slide-sequencing-question";

const definitions = [
  slideMultipleChoiceQuestionSurfaceDefinition,
  slideMultiselectQuestionSurfaceDefinition,
  slideDropdownQuestionSurfaceDefinition,
  slideFillBlanksQuestionSurfaceDefinition,
  slideCategoriseQuestionSurfaceDefinition,
  slideSequencingQuestionSurfaceDefinition,
  slideMatchingQuestionSurfaceDefinition,
  slideImageHotspotQuestionSurfaceDefinition,
] as const;

describe("assessment Surface Control Definitions", () => {
  it("shares the exact root-only assessment vocabulary across all eight variants", () => {
    expect(definitions.map((definition) => definition.id)).toEqual([
      "slide-multiple-choice-question",
      "slide-multiselect-question",
      "slide-dropdown-question",
      "slide-fill-blanks-question",
      "slide-categorise-question",
      "slide-sequencing-question",
      "slide-matching-question",
      "slide-image-hotspot-question",
    ]);

    for (const definition of definitions) {
      expect(definition.control).toBe(assessmentControlDefinition);
      expect(definition.control).toEqual({
        owner: {
          events: [
            { type: "evaluated", label: "Answer evaluated" },
            { type: "submitted", label: "Answer submitted" },
          ],
          states: [
            {
              key: "phase",
              label: "Phase",
              valueType: {
                kind: "enum",
                options: [
                  { value: "unanswered", label: "Unanswered" },
                  { value: "ready", label: "Ready" },
                  { value: "evaluated", label: "Evaluated" },
                  { value: "submitted", label: "Submitted" },
                ],
              },
            },
            {
              key: "result",
              label: "Result",
              valueType: {
                kind: "enum",
                options: [
                  { value: "ungraded", label: "Ungraded" },
                  { value: "correct", label: "Correct" },
                  { value: "incorrect", label: "Incorrect" },
                ],
              },
            },
          ],
        },
      });
      expect(definition.control?.owner?.commands).toBeUndefined();
      expect(definition.control?.semanticChildren).toBeUndefined();
    }
  });
});
