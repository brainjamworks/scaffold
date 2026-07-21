import { z } from "zod";

export const ComparisonDataSchema = z.object({
  type: z.literal("comparison").default("comparison"),
  leftLabel: z.string().default("Option A"),
  rightLabel: z.string().default("Option B"),
});
export type ComparisonData = z.infer<typeof ComparisonDataSchema>;
