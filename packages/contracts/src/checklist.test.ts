import { describe, expect, it } from "vite-plus/test";

import { ChecklistDataSchema, type ChecklistData } from "./index";

describe("checklist content contract", () => {
  it("preserves the canonical serialized data shape", () => {
    const data: ChecklistData = {
      type: "checklist",
      showProgress: false,
      showReset: false,
    };

    expect(ChecklistDataSchema.parse(data)).toEqual(data);
  });

  it("preserves the serialized defaults", () => {
    expect(ChecklistDataSchema.parse({})).toEqual({
      type: "checklist",
      showProgress: true,
      showReset: true,
    });
  });

  it("preserves unknown-key stripping", () => {
    expect(
      ChecklistDataSchema.parse({
        type: "checklist",
        showProgress: false,
        showReset: true,
        checkedItemIds: ["item-1"],
      }),
    ).toEqual({
      type: "checklist",
      showProgress: false,
      showReset: true,
    });
  });

  it("rejects invalid serialized values", () => {
    expect(
      ChecklistDataSchema.safeParse({
        type: "task_list",
        showProgress: true,
        showReset: true,
      }).success,
    ).toBe(false);
    expect(
      ChecklistDataSchema.safeParse({
        type: "checklist",
        showProgress: "yes",
        showReset: true,
      }).success,
    ).toBe(false);
  });
});
