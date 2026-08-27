import { describe, expect, it } from "vite-plus/test";

import type { BlockDefinition } from "../../../block-definition";
import { categoriseBlockDefinition } from "../../categorise/categorise-definition";
import { dropdownBlockDefinition } from "../../dropdown/dropdown-definition";
import { fillBlanksBlockDefinition } from "../../fill-blanks/fill-blanks-definition";
import { imageHotspotBlockDefinition } from "../../image-hotspot/image-hotspot-definition";
import { matchingBlockDefinition } from "../../matching/matching-definition";
import { mcqBlockDefinition } from "../../mcq/mcq-definition";
import { multiselectBlockDefinition } from "../../multiselect/multiselect-definition";
import { quizBlockDefinition } from "../../quiz/quiz-definition";
import { sequencingBlockDefinition } from "../../sequencing/sequencing-definition";

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
