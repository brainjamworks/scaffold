import { describe, expect, it } from "vite-plus/test";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import {
  categoriseBlockDefinition,
  categoriseConfiguration,
} from "./categorise/categorise-definition";
import { dropdownBlockDefinition, dropdownConfiguration } from "./dropdown/dropdown-definition";
import {
  fillBlanksBlockDefinition,
  fillBlanksConfiguration,
} from "./fill-blanks/fill-blanks-definition";
import {
  imageHotspotBlockDefinition,
  imageHotspotConfiguration,
} from "./image-hotspot/image-hotspot-definition";
import { matchingBlockDefinition, matchingConfiguration } from "./matching/matching-definition";
import { mcqBlockDefinition, mcqConfiguration } from "./mcq/mcq-definition";
import {
  multiselectBlockDefinition,
  multiselectConfiguration,
} from "./multiselect/multiselect-definition";
import { quizBlockDefinition } from "./quiz/quiz-definition";
import {
  sequencingBlockDefinition,
  sequencingConfiguration,
} from "./sequencing/sequencing-definition";

const COMMON_QUICK_CONTROL_NAMES = ["feedbackMode", "isGraded", "showAnswer"];

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

const variants = [
  {
    label: "Categorise",
    configuration: categoriseConfiguration,
    blockDefinition: categoriseBlockDefinition,
    sheetOnlyNames: ["points", "maxAttempts", "legend"],
  },
  {
    label: "Sequencing",
    configuration: sequencingConfiguration,
    blockDefinition: sequencingBlockDefinition,
    sheetOnlyNames: ["points", "maxAttempts", "legend"],
  },
  {
    label: "Matching",
    configuration: matchingConfiguration,
    blockDefinition: matchingBlockDefinition,
    sheetOnlyNames: ["points", "maxAttempts", "legend"],
  },
  {
    label: "Image hotspot",
    configuration: imageHotspotConfiguration,
    blockDefinition: imageHotspotBlockDefinition,
    sheetOnlyNames: ["points", "maxAttempts", "legend"],
  },
  {
    label: "Multiple choice",
    configuration: mcqConfiguration,
    blockDefinition: mcqBlockDefinition,
    sheetOnlyNames: ["points", "maxAttempts", "legend"],
  },
  {
    label: "Multi-select",
    configuration: multiselectConfiguration,
    blockDefinition: multiselectBlockDefinition,
    sheetOnlyNames: ["points", "maxAttempts", "maxSelect", "legend"],
  },
  {
    label: "Dropdown",
    configuration: dropdownConfiguration,
    blockDefinition: dropdownBlockDefinition,
    sheetOnlyNames: ["points", "maxAttempts", "label", "placeholder"],
  },
  {
    label: "Fill in the blanks",
    configuration: fillBlanksConfiguration,
    blockDefinition: fillBlanksBlockDefinition,
    sheetOnlyNames: ["points", "maxAttempts", "legend"],
  },
] as const;

describe("assessment block definitions", () => {
  const identityRewrites = createScaffoldApplication().capabilities.contentIdentity.rewrites;

  it.each(assessmentDefinitions)(
    "$definition.nodeType registers private identity repair on its mounted capability",
    ({ definition }) => {
      expect(identityRewrites.getByNodeType(definition.nodeType)).toEqual(expect.any(Function));
      expect(definition).not.toHaveProperty("rewriteCopiedContent");
    },
  );

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

describe("canonical assessment configurations", () => {
  it.each(variants)(
    "exports the final $label configuration used by its Block definition",
    ({ blockDefinition, configuration, sheetOnlyNames }) => {
      expect(blockDefinition.configuration).toBe(configuration);
      expect(quickControlNames(configuration)).toEqual(COMMON_QUICK_CONTROL_NAMES);
      expect(sheetOnlyControlNames(configuration)).toEqual(sheetOnlyNames);
    },
  );

  it("exports Multi-select's custom-apply configuration", () => {
    expect(multiselectConfiguration.apply).toEqual(expect.any(Function));
  });

  it("keeps Create blank out of Fill in the Blanks persistent configuration", () => {
    expect(fillBlanksConfiguration.controls.map((control) => control.label)).not.toContain(
      "Create blank",
    );
  });

  it("keeps the existing Quiz Block menu free of Surface-only quick controls", () => {
    expect(quizBlockDefinition.quickMenu).toBeUndefined();
  });
});

function quickControlNames(configuration: typeof mcqConfiguration): string[] {
  return configuration.controls
    .filter((control) => control.placement?.quickMenu)
    .map((control) => control.name);
}

function sheetOnlyControlNames(configuration: typeof mcqConfiguration): string[] {
  return configuration.controls
    .filter((control) => control.placement?.sheet && !control.placement.quickMenu)
    .map((control) => control.name);
}
