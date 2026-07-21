import { describe, expect, it } from "vite-plus/test";

import { regionMenuFloatingControl, surfaceMenuFloatingControl } from "./surface-floating-controls";

describe("surface floating controls", () => {
  it("places top-right owner controls outside their frame with a visible gap", () => {
    expect(surfaceMenuFloatingControl.inlineOffset).toBe(4);
    expect(regionMenuFloatingControl.inlineOffset).toBe(4);
  });
});
