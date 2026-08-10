import { isOverlayTargetOwnedBy } from "./overlay-ownership";
import { isAuthoringInteractionTargetOwnedBy } from "./authoring-root";

export function shouldDismissEphemeralInteractionTarget(
  ownerRoot: Element,
  target: EventTarget | null,
): boolean {
  return !(
    isAuthoringInteractionTargetOwnedBy(ownerRoot, target) ||
    isOverlayTargetOwnedBy(ownerRoot, target)
  );
}

export function isUnconsumedOverlayDismissKey(
  event: Pick<KeyboardEvent, "defaultPrevented" | "key"> | null | undefined,
): boolean {
  return event?.key === "Escape" && !event.defaultPrevented;
}
