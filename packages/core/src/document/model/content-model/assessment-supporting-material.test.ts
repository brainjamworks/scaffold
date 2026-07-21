import type { JSONContent } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";

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
  normalizeAssessmentSupportingMaterialDisplaySize,
  validateAssessmentSupportingMaterial,
} from "./index";

const TEST_ASSESSMENT_NODE_TYPE = "mcq";
const TEST_NON_ASSESSMENT_NODE_TYPE = "chart_block";

const supportingMaterialSchema = new Schema({
  nodes: {
    doc: { content: ASSESSMENT_SUPPORTING_MATERIAL_NODE_TYPE },
    text: { group: "inline" },
    paragraph: { content: "inline*", group: "block" },
    hardBreak: { group: "inline", inline: true },
    chart: { atom: true, group: "block" },
    [TEST_ASSESSMENT_NODE_TYPE]: { atom: true, group: "block" },
    [TEST_NON_ASSESSMENT_NODE_TYPE]: { atom: true, group: "block" },
    grid: { content: "cell+", group: "block" },
    cell: { content: "block+" },
    layout: { content: "section+", group: "block" },
    section: { content: "block+" },
    quiz: { atom: true, group: "block" },
    surface: { atom: true, group: "block" },
    region: { atom: true, group: "block" },
    courseDocument: { atom: true, group: "block" },
    [ASSESSMENT_SUPPORTING_MATERIAL_NODE_TYPE]: {
      content: "block+",
      group: "block",
    },
  },
});

describe("assessment supporting material content policy", () => {
  it("defines the canonical node, display-size, and HTML attribute vocabulary", () => {
    expect(ASSESSMENT_SUPPORTING_MATERIAL_NODE_TYPE).toBe("assessment_supporting_material");
    expect(ASSESSMENT_SUPPORTING_MATERIAL_DISPLAY_SIZES).toEqual(["small", "medium", "large"]);
    expect(DEFAULT_ASSESSMENT_SUPPORTING_MATERIAL_DISPLAY_SIZE).toBe("medium");
    expect(ASSESSMENT_SUPPORTING_MATERIAL_SLOT_ATTRIBUTE).toBe("data-slot");
    expect(ASSESSMENT_SUPPORTING_MATERIAL_SLOT).toBe("assessment-supporting-material");
    expect(ASSESSMENT_SUPPORTING_MATERIAL_DISPLAY_SIZE_ATTRIBUTE).toBe("data-display-size");
  });

  it.each(["small", "medium", "large"] as const)(
    "preserves the valid %s display size",
    (displaySize) => {
      expect(normalizeAssessmentSupportingMaterialDisplaySize(displaySize)).toBe(displaySize);
    },
  );

  it.each([undefined, null, "Medium", "large ", "", 0, {}])(
    "normalizes malformed display size %j to medium",
    (displaySize) => {
      expect(normalizeAssessmentSupportingMaterialDisplaySize(displaySize)).toBe("medium");
    },
  );

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

  it("rejects a registered assessment capability in JSON at its exact path", () => {
    expect(
      builtInBlockRegistry.getByNodeType(TEST_ASSESSMENT_NODE_TYPE)?.capabilities?.assessment,
    ).toBeDefined();
    const supportingMaterial = supportingMaterialJSON([{ type: TEST_ASSESSMENT_NODE_TYPE }]);

    expect(validateAssessmentSupportingMaterial(supportingMaterial)).toEqual({
      ok: false,
      code: "forbidden_supporting_material_descendant",
      nodeType: TEST_ASSESSMENT_NODE_TYPE,
      path: ["content", 0],
    });
  });

  it("reads assessment capability from the explicit built-in registry", async () => {
    vi.resetModules();
    vi.doMock("@/editor/blocks/built-in-block-definitions", () => ({
      builtInBlockRegistry: {
        getByNodeType: (nodeType: string) =>
          nodeType === "isolated_assessment" ? { capabilities: { assessment: {} } } : undefined,
      },
    }));

    try {
      const { validateAssessmentSupportingMaterial: validateWithIsolatedRegistry } =
        await import("./assessment-supporting-material");

      expect(
        validateWithIsolatedRegistry(supportingMaterialJSON([{ type: "isolated_assessment" }])),
      ).toEqual({
        ok: false,
        code: "forbidden_supporting_material_descendant",
        nodeType: "isolated_assessment",
        path: ["content", 0],
      });
    } finally {
      vi.doUnmock("@/editor/blocks/built-in-block-definitions");
      vi.resetModules();
    }
  });

  it.each(["quiz", "surface", "region", "courseDocument"])(
    "rejects an explicit %s descendant",
    (nodeType) => {
      expect(
        validateAssessmentSupportingMaterial(supportingMaterialJSON([{ type: nodeType }])),
      ).toEqual({
        ok: false,
        code: "forbidden_supporting_material_descendant",
        nodeType,
        path: ["content", 0],
      });
    },
  );

  it("checks descendants rather than rejecting the root container", () => {
    expect(validateAssessmentSupportingMaterial(createAssessmentSupportingMaterialJSON())).toEqual({
      ok: true,
    });
    expect(
      validateAssessmentSupportingMaterial(
        supportingMaterialJSON([supportingMaterialJSON([{ type: "paragraph" }])]),
      ),
    ).toEqual({
      ok: false,
      code: "forbidden_supporting_material_descendant",
      nodeType: ASSESSMENT_SUPPORTING_MATERIAL_NODE_TYPE,
      path: ["content", 0],
    });
  });

  it("rejects an assessment nested through Grid private children", () => {
    const supportingMaterial = supportingMaterialJSON([
      {
        type: "grid",
        content: [
          {
            type: "cell",
            content: [{ type: TEST_ASSESSMENT_NODE_TYPE }],
          },
        ],
      },
    ]);

    expect(validateAssessmentSupportingMaterial(supportingMaterial)).toEqual({
      ok: false,
      code: "forbidden_supporting_material_descendant",
      nodeType: TEST_ASSESSMENT_NODE_TYPE,
      path: ["content", 0, "content", 0, "content", 0],
    });
  });

  it("rejects an assessment nested through Layout private children", () => {
    const supportingMaterial = supportingMaterialJSON([
      {
        type: "layout",
        content: [
          {
            type: "section",
            content: [{ type: TEST_ASSESSMENT_NODE_TYPE }],
          },
        ],
      },
    ]);

    expect(validateAssessmentSupportingMaterial(supportingMaterial)).toEqual({
      ok: false,
      code: "forbidden_supporting_material_descendant",
      nodeType: TEST_ASSESSMENT_NODE_TYPE,
      path: ["content", 0, "content", 0, "content", 0],
    });
  });

  it("returns the first forbidden descendant in depth-first document order", () => {
    const supportingMaterial = supportingMaterialJSON([
      { type: "paragraph" },
      {
        type: "grid",
        content: [
          {
            type: "cell",
            content: [{ type: TEST_ASSESSMENT_NODE_TYPE }],
          },
        ],
      },
      { type: "quiz" },
    ]);

    expect(validateAssessmentSupportingMaterial(supportingMaterial)).toEqual({
      ok: false,
      code: "forbidden_supporting_material_descendant",
      nodeType: TEST_ASSESSMENT_NODE_TYPE,
      path: ["content", 1, "content", 0, "content", 0],
    });
  });

  it("allows rich text, registered non-assessment blocks, and arrangements", () => {
    const supportingMaterial = supportingMaterialJSON([
      { type: "paragraph", content: [{ type: "text", text: "Reference" }] },
      { type: TEST_NON_ASSESSMENT_NODE_TYPE },
      {
        type: "grid",
        content: [{ type: "cell", content: [{ type: "chart" }] }],
      },
      {
        type: "layout",
        content: [{ type: "section", content: [{ type: "paragraph" }] }],
      },
    ]);

    expect(validateAssessmentSupportingMaterial(supportingMaterial)).toEqual({ ok: true });
  });

  it("validates ProseMirror nodes with the same path semantics", () => {
    const supportingMaterial = proseMirrorSupportingMaterial([
      {
        type: "layout",
        content: [
          {
            type: "section",
            content: [{ type: TEST_ASSESSMENT_NODE_TYPE }],
          },
        ],
      },
    ]);

    expect(validateAssessmentSupportingMaterial(supportingMaterial)).toEqual({
      ok: false,
      code: "forbidden_supporting_material_descendant",
      nodeType: TEST_ASSESSMENT_NODE_TYPE,
      path: ["content", 0, "content", 0, "content", 0],
    });
  });

  it("does not mistake an object-valued JSON type for a ProseMirror node", () => {
    const result = Reflect.apply(validateAssessmentSupportingMaterial, undefined, [
      {
        type: { name: "not-a-prosemirror-node" },
        content: [{ type: "quiz" }],
      },
    ]);

    expect(result).toEqual({
      ok: false,
      code: "forbidden_supporting_material_descendant",
      nodeType: "quiz",
      path: ["content", 0],
    });
  });

  it("skips malformed JSON children and still finds the first forbidden descendant", () => {
    const result = Reflect.apply(validateAssessmentSupportingMaterial, undefined, [
      {
        type: ASSESSMENT_SUPPORTING_MATERIAL_NODE_TYPE,
        content: [null, { content: "not-an-array" }, { type: "quiz" }],
      },
    ]);

    expect(result).toEqual({
      ok: false,
      code: "forbidden_supporting_material_descendant",
      nodeType: "quiz",
      path: ["content", 2],
    });
  });
});

function supportingMaterialJSON(content: JSONContent[]): JSONContent {
  return {
    type: ASSESSMENT_SUPPORTING_MATERIAL_NODE_TYPE,
    attrs: { displaySize: DEFAULT_ASSESSMENT_SUPPORTING_MATERIAL_DISPLAY_SIZE },
    content,
  };
}

function proseMirrorSupportingMaterial(content: JSONContent[]) {
  return supportingMaterialSchema.nodeFromJSON(supportingMaterialJSON(content));
}
