import { isOverlayTargetOwnedBy } from "./overlay-ownership";

export function shouldDismissEphemeralInteractionTarget(
  ownerRoot: Element,
  target: EventTarget | null,
): boolean {
  return !isOverlayTargetOwnedBy(ownerRoot, target);
}

export function isUnconsumedOverlayDismissKey(
  event: Pick<KeyboardEvent, "defaultPrevented" | "key"> | null | undefined,
): boolean {
  return event?.key === "Escape" && !event.defaultPrevented;
}
