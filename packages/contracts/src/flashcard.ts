import { z } from "zod";

export const FlashcardDataSchema = z.object({
  type: z.literal("flashcard").default("flashcard"),
  shuffle: z.boolean().default(false),
});
export type FlashcardData = z.infer<typeof FlashcardDataSchema>;
