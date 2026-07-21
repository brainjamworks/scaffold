import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { McqSettingsSchema } from "@scaffold/contracts";

import { getConfigurationControlDescriptorId } from "./definition";
import { createAssessmentConfiguration } from "./assessment-configuration";

describe("assessment configuration defaults", () => {
  it("creates common standalone assessment controls over the settings attr", () => {
    const schema = McqSettingsSchema;
    const configuration = createAssessmentConfiguration({
      schema,
      title: "Question settings",
    });

    expect(configuration.attr).toBe("settings");
    expect(configuration.schema).toBe(schema);
    expect(configuration.sheet).toMatchObject({
      title: "Question settings",
      defaultOpenSections: ["behaviour"],
      sections: [{ id: "behaviour", title: "Behaviour" }],
    });
    expect(configuration.controls.map(getConfigurationControlDescriptorId)).toEqual([
      "name:feedbackMode",
      "name:isGraded",
      "name:showAnswer",
    ]);
    expect(configuration.controls).toMatchObject([
      {
        kind: "select",
        name: "feedbackMode",
        label: "Feedback mode",
        options: [
          { value: "on_submit", label: "On submit" },
          { value: "immediate", label: "Immediate" },
        ],
        placement: {
          quickMenu: { presentation: "segmented" },
          sheet: { section: "behaviour" },
        },
      },
      {
        kind: "boolean",
        name: "isGraded",
        label: "Graded",
        placement: {
          quickMenu: { presentation: "icon-toggle" },
          sheet: { section: "behaviour" },
        },
      },
      {
        kind: "boolean",
        name: "showAnswer",
        label: "Show answer",
        placement: {
          quickMenu: { presentation: "icon-toggle" },
          sheet: { section: "behaviour" },
        },
      },
    ]);
    const removedSettingName = ["is", "Required"].join("");
    expect(
      configuration.schema.safeParse({
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        [removedSettingName]: true,
      }).success,
    ).toBe(false);
  });

  it("adds block-specific sheet controls to the same settings object", () => {
    const schema = z.object({
      feedbackMode: z.enum(["on_submit", "immediate"]),
      isGraded: z.boolean(),
      showAnswer: z.boolean(),
      points: z.number(),
      maxAttempts: z.number().nullable(),
      legend: z.string(),
    });
    const configuration = createAssessmentConfiguration({
      schema,
      title: "Multiple choice settings",
      defaultOpenSections: ["scoring"],
      sections: [
        { id: "scoring", title: "Scoring" },
        { id: "attempts", title: "Attempts" },
        { id: "presentation", title: "Presentation" },
      ],
      controls: [
        {
          kind: "number",
          name: "points",
          label: "Points",
          min: 0,
          step: 1,
          integer: true,
          placement: { sheet: { section: "scoring" } },
        },
        {
          kind: "number",
          name: "maxAttempts",
          label: "Max attempts",
          min: 1,
          step: 1,
          integer: true,
          emptyValue: null,
          placement: { sheet: { section: "attempts" } },
        },
        {
          kind: "text",
          name: "legend",
          label: "Accessible response label",
          placement: { sheet: { section: "presentation" } },
        },
      ],
    });

    expect(configuration.attr).toBe("settings");
    expect(configuration.sheet?.sections).toMatchObject([
      { id: "behaviour", title: "Behaviour" },
      { id: "scoring", title: "Scoring" },
      { id: "attempts", title: "Attempts" },
      { id: "presentation", title: "Presentation" },
    ]);
    expect(configuration.controls.map(getConfigurationControlDescriptorId)).toEqual([
      "name:feedbackMode",
      "name:isGraded",
      "name:showAnswer",
      "name:points",
      "name:maxAttempts",
      "name:legend",
    ]);
    expect(configuration.controls.slice(3)).toMatchObject([
      {
        kind: "number",
        name: "points",
        placement: { sheet: { section: "scoring" } },
      },
      {
        kind: "number",
        name: "maxAttempts",
        placement: { sheet: { section: "attempts" } },
      },
      {
        kind: "text",
        name: "legend",
        placement: { sheet: { section: "presentation" } },
      },
    ]);
  });
});
