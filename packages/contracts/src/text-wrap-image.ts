import { z } from "zod";

import { ExternalMediaSourceSchema, ManagedMediaSourceSchema } from "./media";

export const TextWrapImageSourceSchema = z.union([
  ExternalMediaSourceSchema,
  ManagedMediaSourceSchema,
  z.null(),
]);
export type TextWrapImageSource = z.infer<typeof TextWrapImageSourceSchema>;

export const TextWrapImagePositionSchema = z.enum(["left", "right"]);
export type TextWrapImagePosition = z.infer<typeof TextWrapImagePositionSchema>;

export const TextWrapImageSizeSchema = z.enum(["sm", "md", "lg"]);
export type TextWrapImageSize = z.infer<typeof TextWrapImageSizeSchema>;

export const TextWrapImageShapeSchema = z.enum(["square", "rounded", "circle"]);
export type TextWrapImageShape = z.infer<typeof TextWrapImageShapeSchema>;

export const TextWrapImageDataSchema = z.object({
  type: z.literal("text_wrap_image").default("text_wrap_image"),
  source: TextWrapImageSourceSchema.default(null),
  alt: z.string().default(""),
  position: TextWrapImagePositionSchema.default("left"),
  size: TextWrapImageSizeSchema.default("md"),
  shape: TextWrapImageShapeSchema.default("square"),
});
export type TextWrapImageData = z.infer<typeof TextWrapImageDataSchema>;
