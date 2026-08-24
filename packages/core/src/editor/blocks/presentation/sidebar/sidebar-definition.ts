import { NoteBlankIcon as NoteBlank } from "@phosphor-icons/react";
import { SidebarDataSchema } from "@scaffold/contracts";

import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import { SIDEBAR_BLOCK_ID, SIDEBAR_NODE, createSidebarContent } from "./content";

const sidebarConfiguration = defineConfiguration({
  attr: "data",
  schema: SidebarDataSchema,
  sheet: {
    title: "Sidebar settings",
    defaultOpenSections: ["presentation"],
    sections: [{ id: "presentation", title: "Presentation" }],
  },
  controls: [
    {
      kind: "select",
      name: "headingLevel",
      label: "Heading level",
      options: [
        { value: "2", label: "H2" },
        { value: "3", label: "H3" },
        { value: "4", label: "H4" },
        { value: "5", label: "H5" },
      ],
      placement: { sheet: { section: "presentation" } },
    },
  ],
});

export const sidebarBlockDefinition = defineBlock({
  nodeType: SIDEBAR_NODE,
  title: "Sidebar",
  configuration: sidebarConfiguration,
  placeholders: {
    sidebar_body: "Write the sidebar body",
    sidebar_label: "Sidebar label",
    sidebar_title: "Sidebar title",
  },
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: SIDEBAR_BLOCK_ID,
    category: "display",
    title: "Sidebar",
    description: "A textbook breakout box — note, case study, or practice tip",
    icon: NoteBlank,
    keywords: ["sidebar", "breakout", "aside", "note", "case study", "tip"],
    content: () => createSidebarContent() as Record<string, unknown>,
  },
});
