import { describe, expect, it } from "vite-plus/test";

import { MarginaliaDataSchema, MarginaliaPositionSchema, type MarginaliaData } from "./index";

describe("marginalia content contract", () => {
  it("preserves the canonical serialized data shape", () => {
    const data: MarginaliaData = {
      type: "marginalia",
      position: "left",
    };

    expect(MarginaliaDataSchema.parse(data)).toEqual(data);
  });

  it("preserves the supported position values", () => {
    expect(MarginaliaPositionSchema.options).toEqual(["left", "right"]);
  });

  it("preserves the serialized defaults", () => {
    expect(MarginaliaDataSchema.parse({})).toEqual({
      type: "marginalia",
      position: "right",
    });
  });

  it("preserves unknown-key stripping", () => {
    expect(
      MarginaliaDataSchema.parse({
        type: "marginalia",
        position: "left",
        width: "wide",
      }),
    ).toEqual({
      type: "marginalia",
      position: "left",
    });
  });

  it("rejects invalid serialized values", () => {
    expect(MarginaliaDataSchema.safeParse({ type: "margin_note", position: "left" }).success).toBe(
      false,
    );
    expect(MarginaliaDataSchema.safeParse({ type: "marginalia", position: "center" }).success).toBe(
      false,
    );
  });
});
