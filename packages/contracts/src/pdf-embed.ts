import { z } from "zod";

import { ExternalMediaSourceSchema, ManagedMediaSourceSchema } from "./media";

export const PdfEmbedSourceSchema = z.union([
  ExternalMediaSourceSchema,
  ManagedMediaSourceSchema,
  z.null(),
]);
export type PdfEmbedSource = z.infer<typeof PdfEmbedSourceSchema>;

export const PdfEmbedDataSchema = z.object({
  type: z.literal("pdf_embed").default("pdf_embed"),
  source: PdfEmbedSourceSchema.default(null),
  initialPage: z.number().int().min(1).default(1),
  title: z.string().default(""),
});
export type PdfEmbedData = z.infer<typeof PdfEmbedDataSchema>;
