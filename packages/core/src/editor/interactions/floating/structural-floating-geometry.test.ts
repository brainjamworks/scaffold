// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import {
  resolveStructuralFloatingPointRect,
  resolveStructuralFloatingTriggerRect,
  structuralFloatingTransformForAlignment,
} from "./structural-floating-geometry";

describe("structural floating geometry", () => {
  it("centers grid menu chrome across the grid left outline", () => {
    const geometry = {
      alignment: "centered-on-point",
      placement: "middle-left",
    } as const;

    expect(resolveStructuralFloatingPointRect(frameRect(), geometry)).toMatchObject({
      left: 100,
      top: 260,
    });
    expect(
      resolveStructuralFloatingTriggerRect({
        frameRect: frameRect(),
        geometry,
        size: { height: 36, width: 20 },
      }),
    ).toMatchObject({
      height: 36,
      left: 90,
      top: 242,
      width: 20,
    });
  });

  it("centers cell menu chrome across the cell top outline", () => {
    const geometry = {
      alignment: "centered-on-point",
      placement: "top-center",
    } as const;

    expect(
      resolveStructuralFloatingTriggerRect({
        frameRect: frameRect(),
        geometry,
        size: { height: 20, width: 36 },
      }),
    ).toMatchObject({
      height: 20,
      left: 292,
      top: 110,
      width: 36,
    });
  });

  it("keeps layout menu chrome inset from the right while straddling the top outline", () => {
    const geometry = {
      alignment: "end-before-point",
      inlineOffset: -12,
      placement: "top-right",
    } as const;

    expect(
      resolveStructuralFloatingTriggerRect({
        frameRect: frameRect(),
        geometry,
        size: { height: 20, width: 36 },
      }),
    ).toMatchObject({
      height: 20,
      left: 472,
      top: 110,
      width: 36,
    });
  });

  it("maps explicit structural alignment to visual transforms", () => {
    expect(structuralFloatingTransformForAlignment("centered-on-point")).toBe(
      "translate(-50%, -50%)",
    );
    expect(structuralFloatingTransformForAlignment("end-before-point")).toBe(
      "translate(-100%, -50%)",
    );
    expect(structuralFloatingTransformForAlignment("point")).toBeUndefined();
  });
});

function frameRect(): DOMRectReadOnly {
  return new DOMRect(100, 120, 420, 280);
}
