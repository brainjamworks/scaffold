import { z } from "zod";

import { OptionalIconValueSchema } from "./icon-value";

export const NumberedListMarkerStateSchema = z.enum(["neutral", "inProgress", "complete"]);
export type NumberedListMarkerState = z.infer<typeof NumberedListMarkerStateSchema>;

export const NumberedListDataSchema = z.object({
  type: z.literal("numbered_list").default("numbered_list"),
  showTitle: z.boolean().default(true),
  showIcon: z.boolean().default(true),
  icon: OptionalIconValueSchema,
});
export type NumberedListData = z.infer<typeof NumberedListDataSchema>;

export const NumberedListAttrsSchema = z.object({
  data: NumberedListDataSchema.default({}),
});
export type NumberedListAttrs = z.infer<typeof NumberedListAttrsSchema>;
