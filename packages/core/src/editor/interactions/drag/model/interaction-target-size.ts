export const PREFERRED_CLIENT_TARGET_PX = 44;
export const STANDARD_PRESENTATION_SCALE_FLOOR = 0.8;
export const MAX_COMPENSATED_LOCAL_TARGET_PX =
  PREFERRED_CLIENT_TARGET_PX / STANDARD_PRESENTATION_SCALE_FLOOR;

export interface TargetSizeInput {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly safeLocalWidth: number;
  readonly safeLocalHeight: number;
}

export interface TargetSizeResult {
  readonly minimumLocalWidth: number;
  readonly minimumLocalHeight: number;
  readonly guaranteesPreferredClientWidth: boolean;
  readonly guaranteesPreferredClientHeight: boolean;
}

export function resolveInteractionTargetSize(input: TargetSizeInput): TargetSizeResult | null {
  if (
    !isPositiveFinite(input.scaleX) ||
    !isPositiveFinite(input.scaleY) ||
    !isPositiveFinite(input.safeLocalWidth) ||
    !isPositiveFinite(input.safeLocalHeight)
  ) {
    return null;
  }

  const minimumLocalWidth = Math.min(
    requestedLocalMinimum(input.scaleX),
    input.safeLocalWidth,
  );
  const minimumLocalHeight = Math.min(
    requestedLocalMinimum(input.scaleY),
    input.safeLocalHeight,
  );

  return Object.freeze({
    minimumLocalWidth,
    minimumLocalHeight,
    guaranteesPreferredClientWidth:
      minimumLocalWidth * input.scaleX >= PREFERRED_CLIENT_TARGET_PX,
    guaranteesPreferredClientHeight:
      minimumLocalHeight * input.scaleY >= PREFERRED_CLIENT_TARGET_PX,
  });
}

function requestedLocalMinimum(scale: number): number {
  return Math.min(
    PREFERRED_CLIENT_TARGET_PX / Math.max(scale, STANDARD_PRESENTATION_SCALE_FLOOR),
    MAX_COMPENSATED_LOCAL_TARGET_PX,
  );
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
