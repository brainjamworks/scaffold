import { z } from "zod";

export const EmbedAspectRatioSchema = z.enum(["16/9", "4/3", "1/1", "9/16"]);
export type EmbedAspectRatio = z.infer<typeof EmbedAspectRatioSchema>;

export const EmbedSizingModeSchema = z.enum(["provider", "aspect-ratio"]);
export type EmbedSizingMode = z.infer<typeof EmbedSizingModeSchema>;

export const EmbedDataSchema = z.object({
  type: z.literal("embed").default("embed"),
  url: z.string().default(""),
  provider: z.string().default("generic"),
  aspectRatio: EmbedAspectRatioSchema.default("16/9"),
  sizingMode: EmbedSizingModeSchema.optional(),
  caption: z.string().default(""),
});
export type EmbedData = z.infer<typeof EmbedDataSchema>;
