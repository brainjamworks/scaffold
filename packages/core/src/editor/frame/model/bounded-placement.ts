export const BOUNDED_PLACEMENT_ATTR = "data-bounded-placement";

export type BoundedPlacement = "fill";

export function boundedPlacementAttributes(
  value: BoundedPlacement | undefined,
): Record<string, string> {
  return value ? { [BOUNDED_PLACEMENT_ATTR]: value } : {};
}
