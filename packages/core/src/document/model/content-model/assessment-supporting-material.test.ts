import type { JSONContent } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import {
  ASSESSMENT_SUPPORTING_MATERIAL_DISPLAY_SIZE_ATTRIBUTE,
  ASSESSMENT_SUPPORTING_MATERIAL_DISPLAY_SIZES,
  ASSESSMENT_SUPPORTING_MATERIAL_NODE_TYPE,
  ASSESSMENT_SUPPORTING_MATERIAL_SLOT,
  ASSESSMENT_SUPPORTING_MATERIAL_SLOT_ATTRIBUTE,
  DEFAULT_ASSESSMENT_SUPPORTING_MATERIAL_DISPLAY_SIZE,
  createAssessmentActionsGroupJSON,
  createAssessmentSupportingMaterialJSON,
  isAssessmentSupportingMaterialEmpty,
} from "./index";

const supportingMaterialSchema = new Schema({
  nodes: {
    doc: { content: ASSESSMENT_SUPPORTING_MATERIAL_NODE_TYPE },
    text: { group: "inline" },
    paragraph: { content: "inline*", group: "block" },
    hardBreak: { group: "inline", inline: true },
    chart: { atom: true, group: "block" },
    grid: { content: "cell+", group: "block" },
    cell: { content: "block+" },
    layout: { content: "section+", group: "block" },
    section: { content: "block+" },
    [ASSESSMENT_SUPPORTING_MATERIAL_NODE_TYPE]: {
      content: "block+",
      group: "block",
    },
  },
});

describe("assessment supporting material content", () => {
  it("defines the canonical node, display-size, and HTML attribute vocabulary", () => {
    expect(ASSESSMENT_SUPPORTING_MATERIAL_NODE_TYPE).toBe("assessment_supporting_material");
    expect(ASSESSMENT_SUPPORTING_MATERIAL_DISPLAY_SIZES).toEqual(["small", "medium", "large"]);
    expect(DEFAULT_ASSESSMENT_SUPPORTING_MATERIAL_DISPLAY_SIZE).toBe("medium");
    expect(ASSESSMENT_SUPPORTING_MATERIAL_SLOT_ATTRIBUTE).toBe("data-slot");
    expect(ASSESSMENT_SUPPORTING_MATERIAL_SLOT).toBe("assessment-supporting-material");
    expect(ASSESSMENT_SUPPORTING_MATERIAL_DISPLAY_SIZE_ATTRIBUTE).toBe("data-display-size");
  });

  it("creates canonical empty supporting-material JSON without an id", () => {
    expect(createAssessmentSupportingMaterialJSON()).toEqual({
      type: "assessment_supporting_material",
      attrs: { displaySize: "medium" },
      content: [{ type: "paragraph" }],
    });
  });

  it("creates the canonical ordered assessment actions group", () => {
    expect(createAssessmentActionsGroupJSON()).toEqual({
      type: "assessment_actions_group",
      content: [
        { type: "assessment_hints_group" },
        {
          type: "assessment_supporting_material",
          attrs: { displaySize: "medium" },
          content: [{ type: "paragraph" }],
        },
        { type: "assessment_summary_feedback" },
      ],
    });
  });

  it("creates a fully independent actions group on every call", () => {
    const first = createAssessmentActionsGroupJSON();
    const second = createAssessmentActionsGroupJSON();
    const firstSupportingMaterial = first.content?.[1];
    const secondSupportingMaterial = second.content?.[1];

    expect(first).not.toBe(second);
    expect(first.content).not.toBe(second.content);
    expect(firstSupportingMaterial).not.toBe(secondSupportingMaterial);
    expect(firstSupportingMaterial?.attrs).not.toBe(secondSupportingMaterial?.attrs);
    expect(firstSupportingMaterial?.content).not.toBe(secondSupportingMaterial?.content);
    expect(firstSupportingMaterial?.content?.[0]).not.toBe(secondSupportingMaterial?.content?.[0]);
  });

  it.each([
    ["empty paragraph", [{ type: "paragraph" }]],
    ["whitespace text", [{ type: "paragraph", content: [{ type: "text", text: " \n\t " }] }]],
    ["hard break", [{ type: "paragraph", content: [{ type: "hardBreak" }] }]],
    [
      "arrangement-only containers",
      [
        {
          type: "grid",
          content: [
            {
              type: "cell",
              content: [
                {
                  type: "layout",
                  content: [{ type: "section", content: [{ type: "paragraph" }] }],
                },
              ],
            },
          ],
        },
      ],
    ],
  ])("treats %s as semantically empty", (_name, content) => {
    expect(isAssessmentSupportingMaterialEmpty(proseMirrorSupportingMaterial(content))).toBe(true);
  });

  it.each([
    ["text", [{ type: "paragraph", content: [{ type: "text", text: "Reference" }] }]],
    ["a chart leaf", [{ type: "chart" }]],
  ])("treats %s as meaningful content", (_name, content) => {
    expect(isAssessmentSupportingMaterialEmpty(proseMirrorSupportingMaterial(content))).toBe(false);
  });
});

function proseMirrorSupportingMaterial(content: JSONContent[]) {
  return supportingMaterialSchema.nodeFromJSON({
    type: ASSESSMENT_SUPPORTING_MATERIAL_NODE_TYPE,
    attrs: { displaySize: DEFAULT_ASSESSMENT_SUPPORTING_MATERIAL_DISPLAY_SIZE },
    content,
  });
}
