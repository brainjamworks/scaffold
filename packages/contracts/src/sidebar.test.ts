import { describe, expect, it } from "vite-plus/test";

import { SidebarDataSchema, type SidebarData } from "./index";

describe("sidebar content contract", () => {
  it("preserves the canonical serialized shape", () => {
    const data: SidebarData = {
      type: "sidebar",
      icon: { kind: "media", mediaId: "media-1", alt: "Reference" },
    };

    expect(SidebarDataSchema.parse(data)).toEqual(data);
  });

  it("preserves serialized defaults", () => {
    expect(SidebarDataSchema.parse({})).toEqual({
      type: "sidebar",
      icon: null,
    });
  });

  it("preserves unknown-key stripping", () => {
    expect(SidebarDataSchema.parse({ width: "wide" })).not.toHaveProperty("width");
  });

  it.each([
    { type: "side_note" },
    { icon: { kind: "catalog", name: "" } },
    { icon: { kind: "emoji", value: "💡", color: "yellow" } },
  ])("rejects invalid serialized values %#", (value) => {
    expect(SidebarDataSchema.safeParse(value).success).toBe(false);
  });
});
