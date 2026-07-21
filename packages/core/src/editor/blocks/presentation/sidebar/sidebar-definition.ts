import { NoteBlankIcon as NoteBlank } from "@phosphor-icons/react";

import { defineBlock } from "@/editor/blocks/block-definition";

import { SIDEBAR_BLOCK_ID, SIDEBAR_NODE, createSidebarContent } from "./content";

export const sidebarBlockDefinition = defineBlock({
  nodeType: SIDEBAR_NODE,
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
