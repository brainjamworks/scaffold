import { CheckSquareIcon as CheckSquare } from "@phosphor-icons/react";
import { ChecklistDataSchema } from "@scaffold/contracts";

import { createStableId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import {
  CHECKLIST_ITEM_NODE,
  CHECKLIST_NODE,
  checklistItemContent,
  emptyChecklistData,
} from "./content";

export const CHECKLIST_BLOCK_ID = "checklist";

const DEFAULT_ITEMS = [
  "Read the assigned chapter",
  "Watch the intro video",
  "Bring questions to the next session",
] as const;

export const checklistBlockDefinition = defineBlock({
  nodeType: CHECKLIST_NODE,
  configuration: defineConfiguration({
    attr: "data",
    schema: ChecklistDataSchema,
    sheet: {
      title: "Checklist settings",
      defaultOpenSections: ["presentation"],
      sections: [{ id: "presentation", title: "Presentation" }],
    },
    controls: [
      {
        kind: "boolean",
        name: "showProgress",
        label: "Show progress",
        presentation: "switch",
        placement: { sheet: { section: "presentation" } },
      },
      {
        kind: "boolean",
        name: "showReset",
        label: "Show reset",
        presentation: "switch",
        placement: { sheet: { section: "presentation" } },
      },
    ],
  }),
  identity: {
    stableChildNodeTypes: [CHECKLIST_ITEM_NODE],
  },
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  placeholders: {
    [CHECKLIST_ITEM_NODE]: "Write a checklist item",
  },
  insert: {
    id: CHECKLIST_BLOCK_ID,
    category: "activity",
    title: "Checklist",
    description: "Per-learner checked items with runtime progress",
    icon: CheckSquare,
    keywords: ["checklist", "todo", "tasks", "tracking", "progress"],
    content: () => ({
      type: CHECKLIST_NODE,
      attrs: {
        id: createStableId(),
        data: emptyChecklistData(),
      },
      content: DEFAULT_ITEMS.map((body) => ({
        type: CHECKLIST_ITEM_NODE,
        attrs: { id: createStableId() },
        content: checklistItemContent(body),
      })),
    }),
  },
});
