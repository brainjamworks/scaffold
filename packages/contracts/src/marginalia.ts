import { z } from "zod";

export const MarginaliaPositionSchema = z.enum(["left", "right"]);
export type MarginaliaPosition = z.infer<typeof MarginaliaPositionSchema>;

export const MarginaliaDataSchema = z.object({
  type: z.literal("marginalia").default("marginalia"),
  position: MarginaliaPositionSchema.default("right"),
});
export type MarginaliaData = z.infer<typeof MarginaliaDataSchema>;
