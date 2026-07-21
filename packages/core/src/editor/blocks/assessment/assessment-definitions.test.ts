import { describe, expect, it } from "vite-plus/test";

import { categoriseBlockDefinition } from "./categorise/categorise-definition";
import { dropdownBlockDefinition } from "./dropdown/dropdown-definition";
import { fillBlanksBlockDefinition } from "./fill-blanks/fill-blanks-definition";
import { imageHotspotBlockDefinition } from "./image-hotspot/image-hotspot-definition";
import { matchingBlockDefinition } from "./matching/matching-definition";
import { mcqBlockDefinition } from "./mcq/mcq-definition";
import { multiselectBlockDefinition } from "./multiselect/multiselect-definition";
import { sequencingBlockDefinition } from "./sequencing/sequencing-definition";

const assessmentDefinitions = [
  {
    definition: categoriseBlockDefinition,
    title: "Categorise",
    instructions: "Sort into categories",
  },
  {
    definition: dropdownBlockDefinition,
    title: "Dropdown",
    instructions: "Select from the dropdown",
  },
  {
    definition: fillBlanksBlockDefinition,
    title: "Fill in the blanks",
    instructions: "Complete each blank",
  },
  {
    definition: imageHotspotBlockDefinition,
    title: "Image hotspot",
    instructions: "Click the correct region",
  },
  {
    definition: matchingBlockDefinition,
    title: "Matching",
    instructions: "Match each item",
  },
  {
    definition: mcqBlockDefinition,
    title: "Multiple choice",
    instructions: "Choose one",
  },
  {
    definition: multiselectBlockDefinition,
    title: "Multiselect",
    instructions: "Choose all that apply",
  },
  {
    definition: sequencingBlockDefinition,
    title: "Sequencing",
    instructions: "Drag to reorder",
  },
];

describe("assessment block definitions", () => {
  it("registers a required settings schema and bidirectional response codec for every assessment block", () => {
    for (const { definition } of assessmentDefinitions) {
      expect(definition.configuration?.schema).toEqual(expect.any(Object));

      const response = definition.capabilities?.assessment?.response;

      expect(response).toEqual(
        expect.objectContaining({
          schema: expect.any(Object),
          toContractResponse: expect.any(Function),
          fromContractResponse: expect.any(Function),
          hasResponse: expect.any(Function),
        }),
      );
      expect(response).not.toHaveProperty("project");
    }
  });

  it.each(assessmentDefinitions)(
    "$definition.nodeType declares every main-document assessment placeholder",
    ({ definition }) => {
      expect(definition.placeholders).toEqual(
        expect.objectContaining({
          assessment_title: "Enter your question title",
          assessment_instructions: "Enter your instructions",
          assessment_prompt: "Ask your question",
          assessment_hint: "Enter your hint",
          assessment_summary_feedback: "Enter your feedback",
        }),
      );
    },
  );

  it.each(assessmentDefinitions)(
    "$definition.nodeType persists editable title and instruction defaults on insertion",
    ({ definition, title, instructions }) => {
      const inserted = definition.insert?.content();

      expect(inserted).toEqual(
        expect.objectContaining({
          content: expect.arrayContaining([
            {
              type: "assessment_title",
              content: [{ type: "paragraph", content: [{ type: "text", text: title }] }],
            },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph", content: [{ type: "text", text: instructions }] }],
            },
          ]),
        }),
      );
      expect(definition.capabilities?.assessment).not.toHaveProperty("defaults");
    },
  );
});
