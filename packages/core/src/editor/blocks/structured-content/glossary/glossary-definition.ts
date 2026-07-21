import { BookOpenIcon as BookOpen } from "@phosphor-icons/react";

import { createStableId } from "@/document/model/identity/stable-ids";
import { defineBlock } from "@/editor/blocks/block-definition";

import {
  GLOSSARY_DEFINITION_NODE,
  GLOSSARY_ENTRY_NODE,
  GLOSSARY_NODE,
  GLOSSARY_TERM_NODE,
  emptyGlossaryData,
  glossaryEntryContent,
} from "./content";

export const GLOSSARY_BLOCK_ID = "glossary";

const DEFAULT_ENTRIES = [
  {
    term: "Hypothesis",
    definition: "A testable explanation for an observation, framed before evidence is gathered.",
  },
  {
    term: "Variable",
    definition:
      "A factor that can change in an experiment, deliberately or in response to another factor.",
  },
  {
    term: "Replication",
    definition: "Repeating a study to test whether its findings hold up under similar conditions.",
  },
] as const;

export const glossaryBlockDefinition = defineBlock({
  nodeType: GLOSSARY_NODE,
  identity: {
    stableChildNodeTypes: [GLOSSARY_ENTRY_NODE],
  },
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  placeholders: {
    [GLOSSARY_DEFINITION_NODE]: "Definition",
    [GLOSSARY_TERM_NODE]: "Term",
  },
  insert: {
    id: GLOSSARY_BLOCK_ID,
    category: "content",
    title: "Glossary",
    description: "A list of terms and definitions",
    icon: BookOpen,
    keywords: ["glossary", "terms", "definitions", "vocabulary", "dictionary"],
    content: () => ({
      type: GLOSSARY_NODE,
      attrs: {
        id: createStableId(),
        data: emptyGlossaryData(),
      },
      content: DEFAULT_ENTRIES.map(({ term, definition }) => ({
        type: GLOSSARY_ENTRY_NODE,
        attrs: { id: createStableId() },
        content: glossaryEntryContent(term, definition),
      })),
    }),
  },
});
