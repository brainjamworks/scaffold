import { z } from "zod";

export const KeyValueListLayoutSchema = z.enum(["stacked", "inline", "grid"]);
export type KeyValueListLayout = z.infer<typeof KeyValueListLayoutSchema>;

export const KeyValueListKeyWidthSchema = z.enum(["auto", "narrow", "medium", "wide"]);
export type KeyValueListKeyWidth = z.infer<typeof KeyValueListKeyWidthSchema>;

export const KeyValueListDataSchema = z.object({
  type: z.literal("key_value_list").default("key_value_list"),
  layout: KeyValueListLayoutSchema.default("stacked"),
  keyWidth: KeyValueListKeyWidthSchema.default("auto"),
});
export type KeyValueListData = z.infer<typeof KeyValueListDataSchema>;
