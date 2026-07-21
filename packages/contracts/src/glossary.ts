import { z } from "zod";

export const GlossaryDataSchema = z.object({
  type: z.literal("glossary").default("glossary"),
});
export type GlossaryData = z.infer<typeof GlossaryDataSchema>;
