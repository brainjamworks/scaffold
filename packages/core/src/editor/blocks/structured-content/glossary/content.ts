import type { JSONContent } from "@tiptap/core";
import { GlossaryDataSchema, type GlossaryData } from "@scaffold/contracts";
import { z } from "zod";

export const GlossaryAttrsSchema = z.object({
  data: GlossaryDataSchema.default({}),
});
export type GlossaryAttrs = z.infer<typeof GlossaryAttrsSchema>;

export function emptyGlossaryData(overrides: Partial<GlossaryData> = {}): GlossaryData {
  return GlossaryDataSchema.parse(overrides);
}

export const GLOSSARY_NODE = "glossary";
export const GLOSSARY_ENTRY_NODE = "glossary_entry";
export const GLOSSARY_TERM_NODE = "glossary_term";
export const GLOSSARY_DEFINITION_NODE = "glossary_definition";

export function glossaryTermContent(text?: string): JSONContent[] {
  return [
    {
      type: "paragraph",
      ...(text ? { content: [{ type: "text", text }] } : {}),
    },
  ];
}

export function glossaryDefinitionContent(text?: string): JSONContent[] {
  return [
    {
      type: "paragraph",
      ...(text ? { content: [{ type: "text", text }] } : {}),
    },
  ];
}

export function glossaryEntryContent(term?: string, definition?: string): JSONContent[] {
  return [
    {
      type: GLOSSARY_TERM_NODE,
      content: glossaryTermContent(term),
    },
    {
      type: GLOSSARY_DEFINITION_NODE,
      content: glossaryDefinitionContent(definition),
    },
  ];
}
