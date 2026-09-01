export const PRESENTATION_VISUAL_TARGET_ID_ATTRIBUTE = "data-presentation-target-id";

export function presentationVisualTargetAttributes(
  targetId: unknown,
): Readonly<Record<typeof PRESENTATION_VISUAL_TARGET_ID_ATTRIBUTE, string>> | Readonly<Record<never, never>> {
  return typeof targetId === "string" && targetId.length > 0
    ? Object.freeze({ [PRESENTATION_VISUAL_TARGET_ID_ATTRIBUTE]: targetId })
    : Object.freeze({});
}
