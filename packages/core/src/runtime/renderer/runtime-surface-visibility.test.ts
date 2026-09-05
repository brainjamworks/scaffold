import { describe, expect, it } from "vite-plus/test";

import {
  assertSingleRuntimeSurfaceAuthority,
  describeRuntimeSurfaceState,
  getRuntimeSurfaceAttributes,
} from "./runtime-surface-visibility";

describe("runtime Surface visibility", () => {
  it("separates paint eligibility from runtime authority", () => {
    expect(describeRuntimeSurfaceState("current")).toEqual({
      paints: true,
      authority: true,
      inert: false,
    });
    expect(describeRuntimeSurfaceState("incoming")).toEqual({
      paints: true,
      authority: true,
      inert: true,
    });
    expect(describeRuntimeSurfaceState("outgoing")).toEqual({
      paints: true,
      authority: false,
      inert: true,
    });
    for (const state of ["previous", "next", "hidden"] as const) {
      expect(describeRuntimeSurfaceState(state)).toEqual({
        paints: false,
        authority: false,
        inert: true,
      });
    }
  });

  it("keeps the current Surface interactive and exposed to accessibility", () => {
    expect(getRuntimeSurfaceAttributes("current")).toEqual({
      "data-runtime-surface-state": "current",
      "data-runtime-surface-visible": "true",
    });
  });

  it("paints transition layers as inert, accessibility-hidden content", () => {
    for (const state of ["outgoing", "incoming"] as const) {
      const attributes = getRuntimeSurfaceAttributes(state);
      expect(attributes).toEqual({
        "aria-hidden": "true",
        "data-runtime-surface-state": state,
        "data-runtime-surface-transition-layer": state,
        "data-runtime-surface-visible": "true",
        inert: "",
      });
      expect(attributes).not.toHaveProperty("hidden");
    }
  });

  it("hides neighbours entirely", () => {
    for (const state of ["previous", "next", "hidden"] as const) {
      expect(getRuntimeSurfaceAttributes(state)).toEqual({
        "aria-hidden": "true",
        "data-runtime-surface-hidden": "true",
        "data-runtime-surface-state": state,
        hidden: "",
      });
    }
  });

  it("refuses two runtime authorities or an unpaired transition layer", () => {
    expect(() => assertSingleRuntimeSurfaceAuthority({ a: "current", b: "incoming" })).toThrow(
      /authority to 2 Surfaces/,
    );
    expect(() => assertSingleRuntimeSurfaceAuthority({ a: "outgoing", b: "hidden" })).toThrow(
      /exactly one outgoing with one incoming/,
    );
    expect(() => assertSingleRuntimeSurfaceAuthority({ a: "outgoing", b: "incoming", c: "hidden" }))
      .not.toThrow();
    expect(() => assertSingleRuntimeSurfaceAuthority({ a: "current", b: "next" })).not.toThrow();
  });
});
