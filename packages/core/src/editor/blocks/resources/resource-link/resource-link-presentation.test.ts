import { describe, expect, it } from "vite-plus/test";

import { emptyResourceLinkData } from "./content";
import { RESOURCE_LINK_KIND_LABELS, readResourceHost } from "./resource-link-presentation";

describe("resource link feature helpers", () => {
  it("constructs serialized defaults and applies overrides", () => {
    expect(emptyResourceLinkData()).toEqual({
      type: "resource_link",
      url: "",
      kind: "link",
      showDescription: true,
    });
    expect(
      emptyResourceLinkData({
        url: "  javascript:alert(1)  ",
        kind: "video",
        showDescription: false,
      }),
    ).toEqual({
      type: "resource_link",
      url: "javascript:alert(1)",
      kind: "video",
      showDescription: false,
    });
  });

  it("preserves labels for each persisted resource kind", () => {
    expect(RESOURCE_LINK_KIND_LABELS).toEqual({
      article: "Article",
      video: "Video",
      pdf: "PDF",
      audio: "Audio",
      link: "Link",
    });
  });

  it("reads display hosts and removes the www prefix", () => {
    expect(readResourceHost("https://www.example.com/resource")).toBe("example.com");
    expect(readResourceHost("https://docs.example.com/resource")).toBe("docs.example.com");
  });

  it("returns an empty display host for empty, incomplete, or malformed input", () => {
    expect(readResourceHost("")).toBe("");
    expect(readResourceHost("example.com/resource")).toBe("");
    expect(readResourceHost("not a url")).toBe("");
  });
});
