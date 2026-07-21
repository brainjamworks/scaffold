import { ChartBarIcon as ChartBar } from "@phosphor-icons/react";

import { updateNodeSettingsChecked } from "@/document/model/commands/settings";
import { defineConfiguration } from "@/editor/configuration/definition";
import type { SettingsSheetApplyInput } from "@/editor/configuration/settings-sheet";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createStableId } from "@/document/model/identity/stable-ids";
import type { InsertAction } from "@/editor/insertion/insert-action";
import { ChartBlockDataSchema } from "@/schemas/shared";

import {
  chartDataToSettingsDraft,
  chartSettingsDraftToData,
  ChartSettingsDraftSchema,
  createDefaultChartSettingsDraft,
  createDefaultChartData,
  getChartCatalogVariants,
} from "./chart-model";
import { chartTypeOptions } from "./chart-types";

export const CHART_BLOCK_ID = "chart";

const chartTypeSelectOptions = chartTypeOptions.map(({ label, value }) => ({
  label,
  value,
}));
const tableColumnsOptionSource = {
  kind: "dataGridColumns",
  name: "table",
} as const;
const numericTableColumnsOptionSource = {
  kind: "dataGridColumns",
  name: "table",
  columnTypes: ["number"],
} as const;
const textTableColumnsOptionSource = {
  kind: "dataGridColumns",
  name: "table",
  columnTypes: ["text"],
} as const;

export const chartBlockDefinition = defineBlock({
  nodeType: "chart_block",
  frame: {
    resizable: true,
    resizeMode: "freeform",
  },
  configuration: defineConfiguration({
    attr: "data",
    schema: ChartBlockDataSchema,
    editSchema: ChartSettingsDraftSchema,
    createInitialDraft: createDefaultChartSettingsDraft,
    toDraft: chartPersistedDataToSettingsDraft,
    apply: applyChartSettings,
    sheet: {
      title: "Chart settings",
      defaultOpenSections: ["type", "data", "mapping", "appearance"],
      sections: [
        {
          id: "type",
          title: "Chart type",
        },
        {
          id: "data",
          title: "Data",
        },
        {
          id: "mapping",
          title: "Mapping",
        },
        {
          id: "appearance",
          title: "Appearance",
        },
      ],
    },
    controls: [
      {
        kind: "select",
        name: "chartType",
        label: "Chart type",
        options: chartTypeSelectOptions,
        placement: { sheet: { section: "type" } },
      },
      {
        kind: "dataGrid",
        name: "table",
        label: "Data table",
        ariaLabel: "Chart data table",
        placement: { sheet: { section: "data" } },
      },
      {
        kind: "select",
        name: "mapping.category",
        label: "Category",
        optionsSource: tableColumnsOptionSource,
        placeholder: "Choose a category column",
        visibleWhen: {
          name: "chartType",
          oneOf: ["bar", "combo", "line", "area"],
        },
        placement: { sheet: { section: "mapping" } },
      },
      {
        kind: "multiSelect",
        name: "mapping.values",
        label: "Value series",
        optionsSource: numericTableColumnsOptionSource,
        visibleWhen: { name: "chartType", oneOf: ["bar", "line", "area"] },
        placement: { sheet: { section: "mapping" } },
      },
      {
        kind: "multiSelect",
        name: "mapping.bars",
        label: "Bar series",
        optionsSource: numericTableColumnsOptionSource,
        visibleWhen: { name: "chartType", equals: "combo" },
        placement: { sheet: { section: "mapping" } },
      },
      {
        kind: "multiSelect",
        name: "mapping.lines",
        label: "Line series",
        optionsSource: numericTableColumnsOptionSource,
        visibleWhen: { name: "chartType", equals: "combo" },
        placement: { sheet: { section: "mapping" } },
      },
      {
        kind: "select",
        name: "mapping.label",
        label: "Label",
        optionsSource: tableColumnsOptionSource,
        placeholder: "Choose a label column",
        visibleWhen: { name: "chartType", oneOf: ["pie", "donut"] },
        placement: { sheet: { section: "mapping" } },
      },
      {
        kind: "select",
        name: "mapping.value",
        label: "Value",
        optionsSource: numericTableColumnsOptionSource,
        placeholder: "Choose a value column",
        visibleWhen: {
          name: "chartType",
          oneOf: ["pie", "donut", "heatmap", "histogram"],
        },
        placement: { sheet: { section: "mapping" } },
      },
      {
        kind: "select",
        name: "mapping.xValue",
        label: "X value",
        optionsSource: numericTableColumnsOptionSource,
        placeholder: "Choose an X column",
        visibleWhen: { name: "chartType", equals: "scatter" },
        placement: { sheet: { section: "mapping" } },
      },
      {
        kind: "select",
        name: "mapping.yValue",
        label: "Y value",
        optionsSource: numericTableColumnsOptionSource,
        placeholder: "Choose a Y column",
        visibleWhen: { name: "chartType", equals: "scatter" },
        placement: { sheet: { section: "mapping" } },
      },
      {
        kind: "select",
        name: "mapping.xCategory",
        label: "X category",
        optionsSource: textTableColumnsOptionSource,
        placeholder: "Choose an X category",
        visibleWhen: { name: "chartType", equals: "heatmap" },
        placement: { sheet: { section: "mapping" } },
      },
      {
        kind: "select",
        name: "mapping.yCategory",
        label: "Y category",
        optionsSource: textTableColumnsOptionSource,
        placeholder: "Choose a Y category",
        visibleWhen: { name: "chartType", equals: "heatmap" },
        placement: { sheet: { section: "mapping" } },
      },
      {
        kind: "text",
        name: "title",
        label: "Title",
        placement: { sheet: { section: "appearance" } },
      },
      {
        kind: "text",
        name: "subtitle",
        label: "Subtitle",
        placement: { sheet: { section: "appearance" } },
      },
      {
        kind: "text",
        name: "caption",
        label: "Caption",
        placement: { sheet: { section: "appearance" } },
      },
      {
        kind: "boolean",
        name: "showLegend",
        label: "Show legend",
        placement: { sheet: { section: "appearance" } },
      },
      {
        kind: "boolean",
        name: "showAxisNames",
        label: "Show axis names",
        placement: { sheet: { section: "appearance" } },
      },
      {
        kind: "boolean",
        name: "showAxisLabels",
        label: "Show axis labels",
        placement: { sheet: { section: "appearance" } },
      },
    ],
  }),
  insert: {
    id: CHART_BLOCK_ID,
    category: "data",
    title: "Chart",
    description: "A data chart with an accessible table",
    icon: ChartBar,
    keywords: [
      "graph",
      "bar",
      "combo",
      "line",
      "area",
      "pie",
      "donut",
      "scatter",
      "heatmap",
      "histogram",
      "echarts",
    ],
    content: () => ({
      type: "chart_block",
      attrs: { id: createStableId(), data: createDefaultChartData() },
    }),
  },
});

function applyChartSettings({ tr, target, attr, value }: SettingsSheetApplyInput) {
  if (attr !== "data") {
    return {
      ok: false as const,
      issue: { code: "invalid_chart_settings_attr", message: "Chart settings must write to data." },
    };
  }

  const draft = ChartSettingsDraftSchema.safeParse(value);
  if (!draft.success) {
    return {
      ok: false as const,
      issue: { code: "invalid_chart_settings_draft", message: draft.error.message },
    };
  }

  const data = chartSettingsDraftToData(draft.data);
  const nodeId = target.node.attrs["id"];
  if (typeof nodeId !== "string") {
    return {
      ok: false as const,
      issue: { code: "missing_chart_target_id", message: "The chart target has no stable id." },
    };
  }
  const checked = updateNodeSettingsChecked({
    tr,
    nodeId,
    nodeType: target.node.type.name,
    attr,
    schema: ChartBlockDataSchema,
    value: data,
  });
  return checked;
}

function chartPersistedDataToSettingsDraft(raw: unknown) {
  const parsed = ChartBlockDataSchema.safeParse(raw);
  return parsed.success ? chartDataToSettingsDraft(parsed.data) : raw;
}

export const chartInsertActions: readonly InsertAction[] = Object.freeze(
  getChartCatalogVariants().map(
    (variant): InsertAction => ({
      id: variant.id,
      nodeType: variant.nodeType,
      variantOf: variant.variantOf,
      category: "data",
      title: variant.title,
      description: variant.description,
      icon: ChartBar,
      keywords: variant.keywords,
      content: variant.content,
    }),
  ),
);
