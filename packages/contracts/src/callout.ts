import { z } from "zod";

import { OptionalIconValueSchema } from "./icon-value";

export const CalloutVariantSchema = z.enum(["info", "warning", "success", "error", "tip", "note"]);
export type CalloutVariant = z.infer<typeof CalloutVariantSchema>;

export const CalloutHeadingLevelSchema = z.coerce
  .number()
  .int()
  .pipe(z.union([z.literal(3), z.literal(4), z.literal(5)]));
export type CalloutHeadingLevel = z.infer<typeof CalloutHeadingLevelSchema>;

export const CalloutDataSchema = z.object({
  type: z.literal("callout").default("callout"),
  variant: CalloutVariantSchema.default("info"),
  showIcon: z.boolean().default(true),
  icon: OptionalIconValueSchema,
  headingLevel: CalloutHeadingLevelSchema.default(4),
});
export type CalloutData = z.infer<typeof CalloutDataSchema>;

export const CalloutAttrsSchema = z.object({
  data: CalloutDataSchema.default({}),
});
export type CalloutAttrs = z.infer<typeof CalloutAttrsSchema>;
