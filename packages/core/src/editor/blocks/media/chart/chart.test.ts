// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createAuthoringNodeTarget } from "@/editor/prosemirror/authoring-target";
import { describeBlockContract } from "@/editor/testing";
import { CHART_TYPES, ChartBlockDataSchema } from "@/schemas/shared";

import { chartDataToSettingsDraft, ChartSettingsDraftSchema } from "./chart-model";
import { ChartNode } from "./chart-node";
import { createChartSample } from "./chart-samples";
import { chartBlockDefinition, chartInsertActions } from "./chart-definition";

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  catalogId: "chart",
  nodeType: "chart_block",
  expectsAuthoringFrame: true,
  expectsConfiguration: true,
  expectsFrame: true,
});

describe("Chart insert variants", () => {
  it("provides one direct insertion intent for every chart type", () => {
    const variants = chartInsertActions;

    expect(variants.map((item) => item.id)).toEqual(
      CHART_TYPES.map((chartType) => `chart-${chartType}`),
    );

    for (const variant of variants) {
      const content = variant.content();
      const data = (content["attrs"] as Record<string, unknown>)["data"];

      expect(variant.nodeType).toBe("chart_block");
      expect(content["type"]).toBe("chart_block");
      expect(ChartBlockDataSchema.safeParse(data).success).toBe(true);
      expect(data).toMatchObject({
        kind: "chart",
        chartType: variant.id.replace("chart-", ""),
        encoding: { chartType: variant.id.replace("chart-", "") },
      });
    }
  });
});

describe("Chart settings apply", () => {
  it("writes chart settings draft values back to persisted chart data attrs", () => {
    const chart = createChartSample("bar");
    const editor = new Editor({
      extensions: [StarterKit.configure({ undoRedo: false }), ChartNode],
      content: {
        type: "doc",
        content: [
          {
            type: "chart_block",
            attrs: {
              id: "chart-settings-test",
              data: chart,
            },
          },
        ],
      },
    });

    const target = createAuthoringNodeTarget(editor, {
      id: "chart-settings-test",
      nodeType: "chart_block",
    }).read();
    if (!target) throw new Error("Expected the chart settings target");
    const result = chartBlockDefinition.configuration?.apply?.({
      tr: editor.state.tr,
      target,
      attr: "data",
      schema: ChartSettingsDraftSchema,
      value: {
        ...chartDataToSettingsDraft(chart),
        chartType: "pie",
        title: "Updated chart",
      },
    });

    expect(result?.ok).toBe(true);
    expect(editor.getJSON().content?.[0]?.attrs?.["data"]).toEqual(chart);
    if (!result?.ok) return;
    editor.view.dispatch(result.tr);
    const node = editor.getJSON().content?.[0];
    const data = node?.attrs?.["data"];
    expect(data).toMatchObject({
      kind: "chart",
      chartType: "pie",
      title: "Updated chart",
      encoding: { chartType: "pie" },
    });
    expect(ChartBlockDataSchema.safeParse(data).success).toBe(true);
    editor.destroy();
  });
});
