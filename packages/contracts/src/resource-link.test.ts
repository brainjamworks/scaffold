import { describe, expect, it } from "vite-plus/test";

import { ResourceLinkDataSchema, ResourceLinkKindSchema, type ResourceLinkData } from "./index";

describe("resource link content contract", () => {
  it("preserves enum order and the canonical serialized shape", () => {
    expect(ResourceLinkKindSchema.options).toEqual(["article", "video", "pdf", "audio", "link"]);

    const data: ResourceLinkData = {
      type: "resource_link",
      url: "https://example.com/resource",
      kind: "article",
      showDescription: false,
    };

    expect(ResourceLinkDataSchema.parse(data)).toEqual(data);
  });

  it("preserves serialized defaults", () => {
    expect(ResourceLinkDataSchema.parse({})).toEqual({
      type: "resource_link",
      url: "",
      kind: "link",
      showDescription: true,
    });
  });

  it("trims URLs without restricting their scheme or completeness", () => {
    expect(ResourceLinkDataSchema.parse({ url: "  javascript:alert(1)  " }).url).toBe(
      "javascript:alert(1)",
    );
    expect(ResourceLinkDataSchema.parse({ url: "  example.com/resource  " }).url).toBe(
      "example.com/resource",
    );
  });

  it("preserves unknown-key stripping", () => {
    expect(ResourceLinkDataSchema.parse({ selected: true })).not.toHaveProperty("selected");
  });

  it.each([
    { type: "external_resource" },
    { kind: "webinar" },
    { url: 42 },
    { showDescription: "yes" },
  ])("rejects invalid serialized values %#", (value) => {
    expect(ResourceLinkDataSchema.safeParse(value).success).toBe(false);
  });
});
