import { describe, expect, it } from "vite-plus/test";

import {
  CalloutAttrsSchema,
  CalloutDataSchema,
  CalloutHeadingLevelSchema,
  CalloutVariantSchema,
  type CalloutAttrs,
  type CalloutData,
} from "./index";

describe("callout content contract", () => {
  it("preserves enum order and the canonical serialized shape", () => {
    expect(CalloutVariantSchema.options).toEqual([
      "info",
      "warning",
      "success",
      "error",
      "tip",
      "note",
    ]);

    const data: CalloutData = {
      type: "callout",
      variant: "warning",
      showIcon: false,
      icon: { kind: "catalog", name: "alert-triangle" },
      headingLevel: 3,
    };
    const attrs: CalloutAttrs = { data };

    expect(CalloutDataSchema.parse(data)).toEqual(data);
    expect(CalloutAttrsSchema.parse(attrs)).toEqual(attrs);
  });

  it("preserves data and attrs defaults", () => {
    const defaults = {
      type: "callout",
      variant: "info",
      showIcon: true,
      icon: null,
      headingLevel: 4,
    };

    expect(CalloutDataSchema.parse({})).toEqual(defaults);
    expect(CalloutAttrsSchema.parse({})).toEqual({ data: defaults });
  });

  it("preserves heading coercion", () => {
    expect(CalloutHeadingLevelSchema.parse("3")).toBe(3);
    expect(CalloutDataSchema.parse({ headingLevel: "5" }).headingLevel).toBe(5);
  });

  it("preserves unknown-key stripping", () => {
    expect(CalloutDataSchema.parse({ editorSelection: true })).not.toHaveProperty(
      "editorSelection",
    );
  });

  it.each([
    { variant: "celebration" },
    { showIcon: "yes" },
    { headingLevel: 2 },
    { headingLevel: 3.5 },
  ])("rejects invalid serialized values %#", (value) => {
    expect(CalloutDataSchema.safeParse(value).success).toBe(false);
  });
});
