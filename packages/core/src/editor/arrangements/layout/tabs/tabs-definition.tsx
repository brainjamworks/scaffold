import {
  SelectionIcon as Selection,
  TabsIcon as Tabs,
  TextUnderlineIcon as TextUnderline,
} from "@phosphor-icons/react";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { z } from "zod";

import type {
  DocumentSemanticsDefinition,
  PublishedSemanticChild,
  SemanticChildProjectionInput,
} from "@/document/model/semantic-document";
import { defineConfiguration } from "@/editor/configuration/definition";

import type { LayoutDefinition } from "../model/layout-definition";
import { createTabSection, createTabsContent } from "./tabs-content";

const TabsLayoutOptionsSchema = z.object({
  variant: z.enum(["default", "pills", "underline"]).default("default"),
  label: z.string().default("Tabs"),
});

const TabsSectionOptionsSchema = z.object({
  label: z.string().default(""),
});

const tabsDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: ({ owner, ownerId }: SemanticChildProjectionInput) => {
    const sections: PublishedSemanticChild[] = [];
    let offset = 0;
    owner.forEach((node) => {
      if (node.type.name === "section") {
        const sectionId = EmbeddedNodeIdSchema.safeParse(node.attrs["id"]);
        if (sectionId.success) {
          sections.push(
            Object.freeze({
              relativePos: offset,
              activation: Object.freeze([
                Object.freeze({
                  ownerId,
                  childId: sectionId.data,
                  ownerKind: "layout" as const,
                }),
              ]),
            }),
          );
        }
      }
      offset += node.nodeSize;
    });
    return Object.freeze(sections);
  },
});

export const tabsLayoutDefinition = {
  id: "tabs",
  title: "Tabs",
  description: "Group related content behind selectable panels",
  icon: Tabs,
  boundedPlacement: "fill",
  keywords: ["tabs", "panels", "sections", "switcher"],
  documentSemantics: tabsDocumentSemantics,
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
