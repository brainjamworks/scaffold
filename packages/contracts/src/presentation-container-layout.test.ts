import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import {
  PresentationContentLayout,
  PresentationContentLayoutSchema,
  type PresentationContentLayout as PresentationContentLayoutType,
} from "./presentation-container-layout";
import {
  PresentationContentLayout as BarrelPresentationContentLayout,
  PresentationContentLayoutSchema as BarrelPresentationContentLayoutSchema,
  type PresentationContentLayout as BarrelPresentationContentLayoutType,
} from "./index";

describe("presentation content layout contract", () => {
  it("accepts exactly Flow and Sequence and exposes the inferred union type", () => {
    expect(PresentationContentLayout).toStrictEqual({
      Flow: "flow",
      Sequence: "sequence",
    });
    expect(PresentationContentLayoutSchema.parse(PresentationContentLayout.Flow)).toBe("flow");
    expect(PresentationContentLayoutSchema.parse(PresentationContentLayout.Sequence)).toBe(
      "sequence",
    );

    expect(BarrelPresentationContentLayout).toBe(PresentationContentLayout);
    expect(BarrelPresentationContentLayoutSchema).toBe(PresentationContentLayoutSchema);
    expectTypeOf<PresentationContentLayoutType>().toEqualTypeOf<"flow" | "sequence">();
    expectTypeOf<BarrelPresentationContentLayoutType>().toEqualTypeOf<
      PresentationContentLayoutType
    >();
    expectTypeOf(PresentationContentLayoutSchema.parse("flow")).toEqualTypeOf<
      PresentationContentLayoutType
    >();
  });

  it("rejects missing, differently cased, aliased, and unknown values", () => {
    for (const value of [undefined, "Flow", "Sequence", "FLOW", "SEQUENCE"]) {
      expect(PresentationContentLayoutSchema.safeParse(value).success).toBe(false);
    }

    for (const value of ["linear", "carousel"]) {
      expect(PresentationContentLayoutSchema.safeParse(value).success).toBe(false);
    }

    for (const value of ["grid", "stack", "", null, 1, {}, []]) {
      expect(PresentationContentLayoutSchema.safeParse(value).success).toBe(false);
    }
  });
});
