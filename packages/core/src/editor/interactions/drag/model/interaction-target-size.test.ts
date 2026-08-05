import { describe, expect, it } from "vite-plus/test";

import {
  MAX_COMPENSATED_LOCAL_TARGET_PX,
  PREFERRED_CLIENT_TARGET_PX,
  STANDARD_PRESENTATION_SCALE_FLOOR,
  resolveInteractionTargetSize,
} from "./interaction-target-size";

describe("resolveInteractionTargetSize", () => {
  it.each([
    { scale: 0.5, expectedLocal: 55, guarantees: false },
    { scale: 0.8, expectedLocal: 55, guarantees: true },
    { scale: 0.83, expectedLocal: 44 / 0.83, guarantees: true },
    { scale: 1, expectedLocal: 44, guarantees: true },
    { scale: 2, expectedLocal: 22, guarantees: true },
  ])(
    "resolves the approved minimum at scale $scale",
    ({ scale, expectedLocal, guarantees }) => {
      const result = resolveInteractionTargetSize({
        scaleX: scale,
        scaleY: scale,
        safeLocalWidth: 200,
        safeLocalHeight: 200,
      });

      expect(result?.minimumLocalWidth).toBeCloseTo(expectedLocal);
      expect(result?.minimumLocalHeight).toBeCloseTo(expectedLocal);
      expect(result?.guaranteesPreferredClientWidth).toBe(guarantees);
      expect(result?.guaranteesPreferredClientHeight).toBe(guarantees);
    },
  );

  it("resolves each axis independently and clips to safe local extents", () => {
    const result = resolveInteractionTargetSize({
      scaleX: 2,
      scaleY: 0.5,
      safeLocalWidth: 18,
      safeLocalHeight: 40,
    });

    expect(result).toEqual({
      minimumLocalWidth: 18,
      minimumLocalHeight: 40,
      guaranteesPreferredClientWidth: false,
      guaranteesPreferredClientHeight: false,
    });
  });

  it("rejects non-finite, zero, and negative inputs", () => {
    for (const input of [
      { scaleX: 0, scaleY: 1, safeLocalWidth: 100, safeLocalHeight: 100 },
      { scaleX: 1, scaleY: -1, safeLocalWidth: 100, safeLocalHeight: 100 },
      { scaleX: 1, scaleY: 1, safeLocalWidth: 0, safeLocalHeight: 100 },
      { scaleX: 1, scaleY: 1, safeLocalWidth: 100, safeLocalHeight: Number.NaN },
    ]) {
      expect(resolveInteractionTargetSize(input)).toBeNull();
    }
  });

  it("publishes the approved policy constants", () => {
    expect(PREFERRED_CLIENT_TARGET_PX).toBe(44);
    expect(STANDARD_PRESENTATION_SCALE_FLOOR).toBe(0.8);
    expect(MAX_COMPENSATED_LOCAL_TARGET_PX).toBe(55);
  });
});
