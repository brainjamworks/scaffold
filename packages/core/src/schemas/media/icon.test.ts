import { describe, expect, it } from "vite-plus/test";

import {
  IconValueSchema as ContractIconValueSchema,
  OptionalIconValueSchema as ContractOptionalIconValueSchema,
} from "@scaffold/contracts";

import {
  IconValueSchema,
  OptionalIconValueSchema,
  catalogIconValue,
  emojiIconValue,
  mediaIconValue,
} from "./icon";

describe("icon value schema", () => {
  it("re-exports the canonical Contracts schemas", () => {
    expect(IconValueSchema).toBe(ContractIconValueSchema);
    expect(OptionalIconValueSchema).toBe(ContractOptionalIconValueSchema);
  });

  it("parses catalog, emoji, and managed media icon sources", () => {
    expect(ContractIconValueSchema.parse(catalogIconValue("info"))).toEqual({
      kind: "catalog",
      name: "info",
    });
    expect(ContractIconValueSchema.parse(emojiIconValue("💡"))).toEqual({
      kind: "emoji",
      value: "💡",
    });
    expect(ContractIconValueSchema.parse(mediaIconValue("media-1", "University logo"))).toEqual({
      kind: "media",
      mediaId: "media-1",
      alt: "University logo",
    });
  });

  it("preserves media constructor trimming and blank alt omission", () => {
    expect(mediaIconValue(" media-1 ", " University logo ")).toEqual({
      kind: "media",
      mediaId: "media-1",
      alt: "University logo",
    });
    expect(mediaIconValue("media-1", " ")).toEqual({
      kind: "media",
      mediaId: "media-1",
    });
  });
});
