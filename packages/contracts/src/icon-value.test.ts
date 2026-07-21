import { describe, expect, it } from "vite-plus/test";

import {
  CatalogIconValueSchema,
  EmojiIconValueSchema,
  IconValueSchema,
  MediaIconValueSchema,
  OptionalIconValueSchema,
  type CatalogIconValue,
  type EmojiIconValue,
  type IconValue,
  type MediaIconValue,
  type OptionalIconValue,
} from "./index";

describe("icon value contract", () => {
  it("preserves all three serialized branches and trimming", () => {
    const catalog: CatalogIconValue = { kind: "catalog", name: " info " };
    const emoji: EmojiIconValue = { kind: "emoji", value: " 💡 " };
    const media: MediaIconValue = {
      kind: "media",
      mediaId: " media-1 ",
      alt: " University logo ",
    };
    const values: IconValue[] = [catalog, emoji, media];

    expect(values.map((value) => IconValueSchema.parse(value))).toEqual([
      { kind: "catalog", name: "info" },
      { kind: "emoji", value: "💡" },
      { kind: "media", mediaId: "media-1", alt: "University logo" },
    ]);
  });

  it("preserves optional media alt behavior", () => {
    expect(MediaIconValueSchema.parse({ kind: "media", mediaId: "media-1" })).toEqual({
      kind: "media",
      mediaId: "media-1",
    });
    expect(
      MediaIconValueSchema.safeParse({ kind: "media", mediaId: "media-1", alt: " " }).success,
    ).toBe(false);
  });

  it.each([
    [CatalogIconValueSchema, { kind: "catalog", name: " " }],
    [EmojiIconValueSchema, { kind: "emoji", value: " " }],
    [MediaIconValueSchema, { kind: "media", mediaId: " " }],
  ])("rejects empty required strings %#", (schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it.each([
    [CatalogIconValueSchema, { kind: "catalog", name: "info", value: "extra" }],
    [EmojiIconValueSchema, { kind: "emoji", value: "💡", name: "extra" }],
    [MediaIconValueSchema, { kind: "media", mediaId: "media-1", src: "extra" }],
  ])("rejects extra branch keys %#", (schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it("preserves the nullable default", () => {
    const defaultValue: OptionalIconValue = OptionalIconValueSchema.parse(undefined);
    const explicitNull: OptionalIconValue = OptionalIconValueSchema.parse(null);

    expect(defaultValue).toBeNull();
    expect(explicitNull).toBeNull();
  });
});
