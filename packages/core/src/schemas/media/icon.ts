import { IconValueSchema, type IconValue } from "@scaffold/contracts";
import { z } from "zod";

export {
  CatalogIconValueSchema,
  EmojiIconValueSchema,
  MediaIconValueSchema,
  OptionalIconValueSchema,
  type CatalogIconValue,
  type EmojiIconValue,
  type MediaIconValue,
  type OptionalIconValue,
} from "@scaffold/contracts";
export { IconValueSchema, type IconValue };

export const IconSizeSchema = z.enum(["sm", "md", "lg"]).default("sm");
export type IconSize = z.infer<typeof IconSizeSchema>;

export function catalogIconValue(name: string): IconValue {
  return IconValueSchema.parse({ kind: "catalog", name });
}

export function emojiIconValue(value: string): IconValue {
  return IconValueSchema.parse({ kind: "emoji", value });
}

export function mediaIconValue(mediaId: string, alt?: string): IconValue {
  const trimmedAlt = alt?.trim();
  return IconValueSchema.parse({
    kind: "media",
    mediaId,
    ...(trimmedAlt ? { alt: trimmedAlt } : {}),
  });
}
