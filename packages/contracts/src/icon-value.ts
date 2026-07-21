import { z } from "zod";

export const CatalogIconValueSchema = z
  .object({
    kind: z.literal("catalog"),
    name: z.string().trim().min(1),
  })
  .strict();
export type CatalogIconValue = z.infer<typeof CatalogIconValueSchema>;

export const EmojiIconValueSchema = z
  .object({
    kind: z.literal("emoji"),
    value: z.string().trim().min(1),
  })
  .strict();
export type EmojiIconValue = z.infer<typeof EmojiIconValueSchema>;

export const MediaIconValueSchema = z
  .object({
    kind: z.literal("media"),
    mediaId: z.string().trim().min(1),
    alt: z.string().trim().min(1).optional(),
  })
  .strict();
export type MediaIconValue = z.infer<typeof MediaIconValueSchema>;

export const IconValueSchema = z.discriminatedUnion("kind", [
  CatalogIconValueSchema,
  EmojiIconValueSchema,
  MediaIconValueSchema,
]);
export type IconValue = z.infer<typeof IconValueSchema>;

export const OptionalIconValueSchema = IconValueSchema.nullable().default(null);
export type OptionalIconValue = z.infer<typeof OptionalIconValueSchema>;
