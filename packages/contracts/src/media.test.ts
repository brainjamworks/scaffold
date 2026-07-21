import { describe, expect, it } from "vite-plus/test";

import {
  AudioBlockAttrsSchema,
  ExternalHttpUrlSchema,
  ImageBlockAttrsSchema,
  MediaSourceSchema,
  OptionalExternalHttpUrlSchema,
  isHttpOrHttpsUrl,
  type AudioBlockAttrs,
  type ExternalHttpUrl,
  type ImageBlockAttrs,
  type MediaSource,
  type OptionalExternalHttpUrl,
} from "./index";

describe("external HTTP URL contract", () => {
  it("accepts and trims HTTP and HTTPS URLs", () => {
    const httpsUrl: ExternalHttpUrl = ExternalHttpUrlSchema.parse(
      "  https://example.com/image.png  ",
    );
    const httpUrl: ExternalHttpUrl = ExternalHttpUrlSchema.parse("http://example.com/audio.mp3");

    expect(httpsUrl).toBe("https://example.com/image.png");
    expect(httpUrl).toBe("http://example.com/audio.mp3");
  });

  it("preserves the optional empty-string behavior", () => {
    const emptyUrl: OptionalExternalHttpUrl = OptionalExternalHttpUrlSchema.parse("   ");
    const presentUrl: OptionalExternalHttpUrl = OptionalExternalHttpUrlSchema.parse(
      "  https://example.com/file.pdf  ",
    );

    expect(emptyUrl).toBe("");
    expect(presentUrl).toBe("https://example.com/file.pdf");
  });

  it.each(["javascript:alert(1)", "data:image/png;base64,abc", "blob:https://example.com/id"])(
    "rejects non-HTTP URL %s with the existing error",
    (value) => {
      expect(() => ExternalHttpUrlSchema.parse(value)).toThrow("URL must use http or https");
      expect(() => OptionalExternalHttpUrlSchema.parse(value)).toThrow(
        "URL must use http or https",
      );
    },
  );

  it("rejects malformed URLs and exposes the protocol predicate", () => {
    expect(ExternalHttpUrlSchema.safeParse("not a URL").success).toBe(false);
    expect(OptionalExternalHttpUrlSchema.safeParse("not a URL").success).toBe(false);
    expect(isHttpOrHttpsUrl("https://example.com")).toBe(true);
    expect(isHttpOrHttpsUrl("ftp://example.com")).toBe(false);
    expect(isHttpOrHttpsUrl("not a URL")).toBe(false);
  });
});

describe("media source contract", () => {
  it("parses external and managed sources without changing managed ids", () => {
    const external: MediaSource = MediaSourceSchema.parse({
      mode: "external",
      src: "  https://example.com/image.png  ",
      ignored: true,
    });
    const managed: MediaSource = MediaSourceSchema.parse({
      mode: "managed",
      mediaId: "  ",
      ignored: true,
    });

    expect(external).toEqual({ mode: "external", src: "https://example.com/image.png" });
    expect(managed).toEqual({ mode: "managed", mediaId: "  " });
  });

  it.each([
    { mode: "external" },
    { mode: "external", src: "javascript:alert(1)" },
    { mode: "managed" },
    { mode: "upload", mediaId: "asset-1" },
  ])("rejects invalid media source %#", (value) => {
    expect(MediaSourceSchema.safeParse(value).success).toBe(false);
  });
});

describe("image and audio attrs contracts", () => {
  it("preserves image source behavior and optional alt text", () => {
    const external: ImageBlockAttrs = ImageBlockAttrsSchema.parse({
      mode: "external",
      src: "  https://example.com/image.png  ",
      alt: "  ",
      ignored: true,
    });
    const managed: ImageBlockAttrs = ImageBlockAttrsSchema.parse({
      mode: "managed",
      mediaId: "",
    });

    expect(external).toEqual({
      mode: "external",
      src: "https://example.com/image.png",
      alt: "  ",
    });
    expect(managed).toEqual({ mode: "managed", mediaId: "" });
  });

  it("preserves audio source behavior and optional title", () => {
    const external: AudioBlockAttrs = AudioBlockAttrsSchema.parse({
      mode: "external",
      src: "https://example.com/audio.mp3",
      title: "",
      ignored: true,
    });
    const managed: AudioBlockAttrs = AudioBlockAttrsSchema.parse({
      mode: "managed",
      mediaId: " asset-1 ",
    });

    expect(external).toEqual({
      mode: "external",
      src: "https://example.com/audio.mp3",
      title: "",
    });
    expect(managed).toEqual({ mode: "managed", mediaId: " asset-1 " });
  });

  it("keeps branch-specific fields optional and strips fields from the other branch", () => {
    expect(
      ImageBlockAttrsSchema.parse({
        mode: "managed",
        mediaId: "asset-1",
        src: "https://example.com/ignored.png",
      }),
    ).toEqual({ mode: "managed", mediaId: "asset-1" });
    expect(
      AudioBlockAttrsSchema.parse({
        mode: "external",
        src: "https://example.com/audio.mp3",
        mediaId: "ignored",
      }),
    ).toEqual({ mode: "external", src: "https://example.com/audio.mp3" });
  });

  it("preserves invalid URL and discriminant errors", () => {
    expect(() =>
      ImageBlockAttrsSchema.parse({ mode: "external", src: "javascript:alert(1)" }),
    ).toThrow("URL must use http or https");
    expect(() =>
      AudioBlockAttrsSchema.parse({ mode: "external", src: "data:audio/mpeg;base64,abc" }),
    ).toThrow("URL must use http or https");
    expect(ImageBlockAttrsSchema.safeParse({ mode: "unknown" }).success).toBe(false);
    expect(AudioBlockAttrsSchema.safeParse({ mode: "unknown" }).success).toBe(false);
  });
});
