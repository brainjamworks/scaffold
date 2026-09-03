import { describe, expect, it } from "vite-plus/test";

import type { BlockDefinition } from "@/editor/blocks/block-definition";
import { categoriseBlockDefinition } from "@/editor/blocks/assessment/categorise/categorise-definition";
import { dropdownBlockDefinition } from "@/editor/blocks/assessment/dropdown/dropdown-definition";
import { fillBlanksBlockDefinition } from "@/editor/blocks/assessment/fill-blanks/fill-blanks-definition";
import { imageHotspotBlockDefinition } from "@/editor/blocks/assessment/image-hotspot/image-hotspot-definition";
import { matchingBlockDefinition } from "@/editor/blocks/assessment/matching/matching-definition";
import { mcqBlockDefinition } from "@/editor/blocks/assessment/mcq/mcq-definition";
import { multiselectBlockDefinition } from "@/editor/blocks/assessment/multiselect/multiselect-definition";
import { quizBlockDefinition } from "@/editor/blocks/assessment/quiz/quiz-definition";
import { sequencingBlockDefinition } from "@/editor/blocks/assessment/sequencing/sequencing-definition";

const expectedControl = {
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
} as const;

describe("standalone Assessment Control Definition", () => {
  it("advertises one shared root-only read/event contract on exactly the eight approved Blocks", () => {
    const approved = [
      categoriseBlockDefinition,
      dropdownBlockDefinition,
      fillBlanksBlockDefinition,
      imageHotspotBlockDefinition,
      matchingBlockDefinition,
      mcqBlockDefinition,
      multiselectBlockDefinition,
      sequencingBlockDefinition,
    ] satisfies readonly BlockDefinition[];

    for (const definition of approved) {
      expect(definition.control, definition.nodeType).toEqual(expectedControl);
      expect(definition.control?.owner?.commands, definition.nodeType).toBeUndefined();
      expect(definition.control?.semanticChildren, definition.nodeType).toBeUndefined();
    }

    expect(quizBlockDefinition.control).not.toEqual(expectedControl);
  });
});
