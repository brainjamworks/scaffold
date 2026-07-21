import { TextWrapImageDataSchema, type TextWrapImageData } from "@scaffold/contracts";

export const TEXT_WRAP_IMAGE_NODE = "text_wrap_image";
export const TEXT_WRAP_IMAGE_BODY_NODE = "text_wrap_image_body";

export function emptyTextWrapImageData(
  overrides: Partial<TextWrapImageData> = {},
): TextWrapImageData {
  return TextWrapImageDataSchema.parse(overrides);
}
