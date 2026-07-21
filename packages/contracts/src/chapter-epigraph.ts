import { z } from "zod";

export const ChapterEpigraphAlignSchema = z.enum(["left", "center"]);
export type ChapterEpigraphAlign = z.infer<typeof ChapterEpigraphAlignSchema>;

export const ChapterEpigraphDataSchema = z.object({
  type: z.literal("chapter_epigraph").default("chapter_epigraph"),
  align: ChapterEpigraphAlignSchema.default("center"),
});
export type ChapterEpigraphData = z.infer<typeof ChapterEpigraphDataSchema>;
