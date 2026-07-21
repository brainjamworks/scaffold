import { z } from "zod";

export const StatHighlightAlignSchema = z.enum(["left", "center"]);
export type StatHighlightAlign = z.infer<typeof StatHighlightAlignSchema>;

export const StatHighlightDataSchema = z.object({
  type: z.literal("stat_highlight").default("stat_highlight"),
  align: StatHighlightAlignSchema.default("left"),
});
export type StatHighlightData = z.infer<typeof StatHighlightDataSchema>;
