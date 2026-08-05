import { z } from "zod";

const EMBEDDED_ID_PATTERN = /^[0-9A-Z_a-z-]{12}$/;

export const EmbeddedIdSchema = z.string().regex(EMBEDDED_ID_PATTERN).brand<"EmbeddedId">();
export type EmbeddedId = z.infer<typeof EmbeddedIdSchema>;

export const EmbeddedNodeIdSchema = EmbeddedIdSchema.brand<"EmbeddedNodeId">();
export type EmbeddedNodeId = z.infer<typeof EmbeddedNodeIdSchema>;

export const EmbeddedDataIdSchema = EmbeddedIdSchema.brand<"EmbeddedDataId">();
export type EmbeddedDataId = z.infer<typeof EmbeddedDataIdSchema>;

export function isEmbeddedId(value: unknown): value is EmbeddedId {
  return EmbeddedIdSchema.safeParse(value).success;
}
