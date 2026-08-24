import { z } from "zod";

import { OptionalIconValueSchema } from "./icon-value";

export const SidebarHeadingLevelSchema = z.coerce
  .number()
  .int()
  .pipe(z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]));
export type SidebarHeadingLevel = z.infer<typeof SidebarHeadingLevelSchema>;

export const SidebarDataSchema = z.object({
  type: z.literal("sidebar").default("sidebar"),
  icon: OptionalIconValueSchema,
  headingLevel: SidebarHeadingLevelSchema.default(2),
});
export type SidebarData = z.infer<typeof SidebarDataSchema>;
