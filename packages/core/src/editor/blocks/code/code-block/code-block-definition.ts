import { CodeIcon as Code } from "@phosphor-icons/react";
import {
  CODE_BLOCK_LANGUAGE_LABELS,
  CodeBlockDataSchema,
  CodeBlockLanguageSchema,
} from "@scaffold/contracts";

import { createStableId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import { CODE_BLOCK_BODY_NODE, CODE_BLOCK_NODE, emptyCodeBlockData } from "./content";

export const CODE_BLOCK_ID = "code-block";

export const codeBlockDefinition = defineBlock({
  nodeType: CODE_BLOCK_NODE,
  configuration: defineConfiguration({
    attr: "data",
    schema: CodeBlockDataSchema,
    sheet: {
      title: "Code block settings",
      defaultOpenSections: ["presentation"],
      sections: [{ id: "presentation", title: "Presentation" }],
    },
    controls: [
      {
        kind: "select",
        name: "language",
        label: "Language",
        options: CodeBlockLanguageSchema.options.map((value) => ({
          value,
          label: CODE_BLOCK_LANGUAGE_LABELS[value],
        })),
        placement: { sheet: { section: "presentation" } },
      },
      {
        kind: "boolean",
        name: "showCopyButton",
        label: "Show copy button",
        presentation: "switch",
        placement: { sheet: { section: "presentation" } },
      },
    ],
  }),
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: CODE_BLOCK_ID,
    category: "data",
    title: "Code block",
    description: "Syntax-highlighted code with copy",
    icon: Code,
    keywords: ["code", "snippet", "monospace", "syntax"],
    content: () => ({
      type: CODE_BLOCK_NODE,
      attrs: {
        id: createStableId(),
        data: emptyCodeBlockData(),
      },
      content: [{ type: CODE_BLOCK_BODY_NODE }],
    }),
  },
});
