import {
  SelectionIcon as Selection,
  TabsIcon as Tabs,
  TextUnderlineIcon as TextUnderline,
} from "@phosphor-icons/react";
import { z } from "zod";

import { defineConfiguration } from "@/editor/configuration/definition";
import { PRESENTATION_VISUAL_ACTION_IDS } from "@/document/model/document-tree/definition";

import type { LayoutDefinition } from "../model/layout-definition";
import { hiddenLayoutSectionDocumentTree } from "../shared/model/layout-semantic-publication";
import { createTabSection, createTabsContent } from "./tabs-content";

const TabsLayoutOptionsSchema = z.object({
  variant: z.enum(["default", "pills", "underline"]).default("default"),
  label: z.string().default("Tabs"),
});

const TabsSectionOptionsSchema = z.object({
  label: z.string().default(""),
});

export const tabsLayoutDefinition = {
  id: "tabs",
  title: "Tabs",
  description: "Group related content behind selectable panels",
  icon: Tabs,
  boundedPlacement: "fill",
  keywords: ["tabs", "panels", "sections", "switcher"],
  documentTree: hiddenLayoutSectionDocumentTree,
  control: {
    semanticChildren: {
      section: {
        events: [{ type: "selected", label: "Selected" }],
        states: [
          {
            key: "selected",
            label: "Selected",
            valueType: { kind: "boolean" },
          },
        ],
        commands: [{ type: "select", label: "Select" }],
      },
    },
  },
  configuration: defineConfiguration({
    attr: "options",
    schema: TabsLayoutOptionsSchema,
    sheet: {
      title: "Tabs settings",
      sections: [{ id: "tabs", title: "Tabs" }],
      defaultOpenSections: ["tabs"],
    },
    controls: [
      {
        kind: "select",
        name: "variant",
        label: "Style",
        options: [
          { value: "default", label: "Default", icon: Tabs },
          { value: "pills", label: "Pills", icon: Selection },
          { value: "underline", label: "Underline", icon: TextUnderline },
        ],
        placement: {
          quickMenu: { presentation: "segmented" },
          sheet: { section: "tabs" },
        },
      },
      {
        kind: "text",
        name: "label",
        label: "Accessible label",
        placement: { sheet: { section: "tabs" } },
      },
    ],
  }),
  section: {
    label: "Tab",
    addLabel: "Add tab",
    documentTree: {
      presentation: {
        actionIds: PRESENTATION_VISUAL_ACTION_IDS,
        // Selection names the complete target state, so seek can replay it after baseline restore.
        reconstructableCommandTypes: ["select"],
      },
    },
    create: ({ index }) => createTabSection(index, `Tab ${index + 1}`),
    configuration: defineConfiguration({
      attr: "options",
      schema: TabsSectionOptionsSchema,
      sheet: {
        title: "Tab settings",
        sections: [{ id: "tab", title: "Tab" }],
        defaultOpenSections: ["tab"],
      },
      controls: [
        {
          kind: "text",
          name: "label",
          label: "Label",
          placement: { sheet: { section: "tab" } },
        },
      ],
    }),
  },
  createContent: (input) => createTabsContent(input?.options),
} satisfies LayoutDefinition;
