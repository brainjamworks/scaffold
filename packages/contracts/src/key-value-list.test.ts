import { describe, expect, it } from "vite-plus/test";

import {
  KeyValueListDataSchema,
  KeyValueListKeyWidthSchema,
  KeyValueListLayoutSchema,
  type KeyValueListData,
} from "./index";

describe("key-value list content contract", () => {
  it("preserves the canonical serialized data shape", () => {
    const data: KeyValueListData = {
      type: "key_value_list",
      layout: "grid",
      keyWidth: "wide",
    };

    expect(KeyValueListDataSchema.parse(data)).toEqual(data);
  });

  it("preserves the supported layout values", () => {
    expect(KeyValueListLayoutSchema.options).toEqual(["stacked", "inline", "grid"]);
  });

  it("preserves the supported key-width values", () => {
    expect(KeyValueListKeyWidthSchema.options).toEqual(["auto", "narrow", "medium", "wide"]);
  });

  it("preserves the serialized defaults", () => {
    expect(KeyValueListDataSchema.parse({})).toEqual({
      type: "key_value_list",
      layout: "stacked",
      keyWidth: "auto",
    });
  });

  it("preserves unknown-key stripping", () => {
    expect(
      KeyValueListDataSchema.parse({
        type: "key_value_list",
        layout: "inline",
        keyWidth: "medium",
        rowCount: 3,
      }),
    ).toEqual({
      type: "key_value_list",
      layout: "inline",
      keyWidth: "medium",
    });
  });

  it("rejects invalid serialized values", () => {
    expect(
      KeyValueListDataSchema.safeParse({
        type: "keyValueList",
        layout: "stacked",
        keyWidth: "auto",
      }).success,
    ).toBe(false);
    expect(
      KeyValueListDataSchema.safeParse({
        type: "key_value_list",
        layout: "columns",
        keyWidth: "auto",
      }).success,
    ).toBe(false);
    expect(
      KeyValueListDataSchema.safeParse({
        type: "key_value_list",
        layout: "stacked",
        keyWidth: "full",
      }).success,
    ).toBe(false);
  });
});
