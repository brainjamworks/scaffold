import { z } from "zod";

/**
 * Attrs schema for the shared `selectable_choice` Tiptap node.
 *
 * Used by choice-style nodes whose visible label lives in child field
 * content. Correctness and gated feedback are private data owned by the
 * ancestor assessment block, not by this visible choice node.
 */
export const SelectableChoiceAttrsSchema = z.object({
  id: z.string(),
});

export type SelectableChoiceAttrs = z.infer<typeof SelectableChoiceAttrsSchema>;
