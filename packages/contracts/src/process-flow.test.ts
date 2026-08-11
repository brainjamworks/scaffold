import { describe, expect, it } from "vite-plus/test";

import { ProcessFlowDataSchema } from "./index";

describe("Process Flow contract", () => {
  it("normalizes Course presentation defaults", () => {
    expect(ProcessFlowDataSchema.parse({})).toEqual({
      type: "process_flow",
      orientation: "horizontal",
      showNumbers: true,
      showConnectors: true,
    });
  });

  it("accepts authored presentation options and rejects invalid orientations", () => {
    expect(
      ProcessFlowDataSchema.parse({
        orientation: "vertical",
        showNumbers: false,
        showConnectors: false,
      }),
    ).toEqual({
      type: "process_flow",
      orientation: "vertical",
      showNumbers: false,
      showConnectors: false,
    });
    expect(ProcessFlowDataSchema.safeParse({ orientation: "diagonal" }).success).toBe(false);
  });
});
