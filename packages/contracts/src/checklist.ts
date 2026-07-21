import { z } from "zod";

export const ChecklistDataSchema = z.object({
  type: z.literal("checklist").default("checklist"),
  /** Show "X of Y complete" progress chrome above the items. */
  showProgress: z.boolean().default(true),
  /** Show a "Reset" action in the chrome. */
  showReset: z.boolean().default(true),
});
export type ChecklistData = z.infer<typeof ChecklistDataSchema>;
