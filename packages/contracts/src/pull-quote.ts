import { z } from "zod";

export const PullQuoteAlignSchema = z.enum(["left", "center"]);
export type PullQuoteAlign = z.infer<typeof PullQuoteAlignSchema>;

export const PullQuoteDataSchema = z.object({
  type: z.literal("pull_quote").default("pull_quote"),
  align: PullQuoteAlignSchema.default("left"),
});
export type PullQuoteData = z.infer<typeof PullQuoteDataSchema>;
