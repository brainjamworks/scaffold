import {
  DEFAULT_IMAGE_POSITION,
  ImagePositionSchema,
  type ImagePosition,
} from "@/schemas/course-document";

const IMAGE_POSITION_CSS = {
  "top-left": "left top",
  "top-center": "center top",
  "top-right": "right top",
  "center-left": "left center",
  center: "center center",
  "center-right": "right center",
  "bottom-left": "left bottom",
  "bottom-center": "center bottom",
  "bottom-right": "right bottom",
} as const satisfies Record<ImagePosition, string>;

export function imagePositionToCss(value: unknown): string {
  const parsed = ImagePositionSchema.safeParse(value);
  const position = parsed.success ? parsed.data : DEFAULT_IMAGE_POSITION;
  return IMAGE_POSITION_CSS[position];
}
