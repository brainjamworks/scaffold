import { PdfEmbedDataSchema, type PdfEmbedData } from "@scaffold/contracts";

export function emptyPdfEmbedData(overrides: Partial<PdfEmbedData> = {}): PdfEmbedData {
  return PdfEmbedDataSchema.parse(overrides);
}
