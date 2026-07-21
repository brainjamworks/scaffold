import { z } from "zod";

import {
  ScaffoldRichTextDocumentSchema,
  type ScaffoldRichTextDocument,
} from "./assessment-feedback";
import { ImageBlockAttrsSchema } from "./media";

const EmptyGalleryRichTextDocument: ScaffoldRichTextDocument = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export const GalleryLayoutSchema = z.enum(["carousel", "grid"]);
export type GalleryLayout = z.infer<typeof GalleryLayoutSchema>;

export const GalleryItemDataSchema = z.object({
  image: ImageBlockAttrsSchema.nullable().default(null),
  caption: ScaffoldRichTextDocumentSchema.default(EmptyGalleryRichTextDocument),
});
export type GalleryItemData = z.infer<typeof GalleryItemDataSchema>;

export const GalleryDataSchema = z.object({
  type: z.literal("gallery").default("gallery"),
  layout: GalleryLayoutSchema.default("carousel"),
  caption: ScaffoldRichTextDocumentSchema.default(EmptyGalleryRichTextDocument),
});
export type GalleryData = z.infer<typeof GalleryDataSchema>;
