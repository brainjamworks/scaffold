import { CheckSquareIcon as CheckSquare } from "@phosphor-icons/react";
import { ChecklistDataSchema } from "@scaffold/contracts";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import {
  CHECKLIST_ITEM_NODE,
  CHECKLIST_NODE,
  checklistItemContent,
  emptyChecklistData,
} from "./content";
import { checklistDocumentTree } from "./checklist-document-tree";

export const CHECKLIST_BLOCK_ID = "checklist";

const DEFAULT_ITEMS = [
  "Read the assigned chapter",
  "Watch the intro video",
  "Bring questions to the next session",
] as const;

export const checklistBlockDefinition = defineBlock({
  nodeType: CHECKLIST_NODE,
  title: "Checklist",
  documentTree: checklistDocumentTree,
  control: {
    owner: {
      events: [{ type: "completed", label: "Completed" }],
      states: [
        {
          key: "completed",
          label: "Completed",
          valueType: { kind: "boolean" },
        },
      ],
    },
    semanticChildren: {
      [CHECKLIST_ITEM_NODE]: {
        events: [
          { type: "checked", label: "Checked" },
          { type: "unchecked", label: "Unchecked" },
        ],
        states: [
          {
            key: "checked",
            label: "Checked",
            valueType: { kind: "boolean" },
          },
        ],
      },
    },
  },
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
        id: createEmbeddedNodeId(),
        data: emptyChecklistData(),
      },
      content: DEFAULT_ITEMS.map((body) => ({
        type: CHECKLIST_ITEM_NODE,
        attrs: { id: createEmbeddedNodeId() },
        content: checklistItemContent(body),
      })),
    }),
  },
});
