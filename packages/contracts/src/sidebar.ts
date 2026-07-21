import { z } from "zod";

import { OptionalIconValueSchema } from "./icon-value";

export const SidebarDataSchema = z.object({
  type: z.literal("sidebar").default("sidebar"),
  icon: OptionalIconValueSchema,
});
export type SidebarData = z.infer<typeof SidebarDataSchema>;
