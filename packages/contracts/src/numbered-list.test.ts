import { describe, expect, it } from "vite-plus/test";

import {
  NumberedListAttrsSchema,
  NumberedListDataSchema,
  NumberedListMarkerStateSchema,
  type NumberedListAttrs,
  type NumberedListData,
} from "./index";

describe("numbered list content contract", () => {
  it("preserves enum order and the canonical serialized shape", () => {
    expect(NumberedListMarkerStateSchema.options).toEqual(["neutral", "inProgress", "complete"]);

    const data: NumberedListData = {
      type: "numbered_list",
      showTitle: false,
      showIcon: false,
      icon: { kind: "emoji", value: "1️⃣" },
    };
    const attrs: NumberedListAttrs = { data };

    expect(NumberedListDataSchema.parse(data)).toEqual(data);
    expect(NumberedListAttrsSchema.parse(attrs)).toEqual(attrs);
  });

  it("preserves data and attrs defaults", () => {
    const defaults = {
      type: "numbered_list",
      showTitle: true,
      showIcon: true,
      icon: null,
    };

    expect(NumberedListDataSchema.parse({})).toEqual(defaults);
    expect(NumberedListAttrsSchema.parse({})).toEqual({ data: defaults });
  });

  it("preserves unknown-key stripping", () => {
    expect(NumberedListDataSchema.parse({ currentItem: 2 })).not.toHaveProperty("currentItem");
  });

  it("rejects invalid marker states", () => {
    expect(NumberedListMarkerStateSchema.safeParse("paused").success).toBe(false);
  });

  it.each([{ type: "ordered_list" }, { showTitle: "yes" }, { showIcon: "yes" }])(
    "rejects invalid serialized values %#",
    (value) => {
      expect(NumberedListDataSchema.safeParse(value).success).toBe(false);
    },
  );
});
