// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";

import { emptyEmbedData, normalizeEmbedSettingsUpdate, updateEmbedDataUrl } from "./embed-data";
import { EmbedSurface } from "./EmbedSurface";
import {
  DEFAULT_EMBED_SANDBOX,
  getEmbedProvider,
  normalizeUrl,
  resolveEmbedFrame,
  resolveEmbedUrl,
} from "./embed-registry";
import "./embed-definition";

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "embed",
  catalogId: "embed",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

describe("embed data normalization", () => {
  it("detects YouTube URLs and stores the provider with its aspect ratio", () => {
    const data = updateEmbedDataUrl(
      emptyEmbedData(),
      "www.youtube.com/watch?v=aKllbvCaWvo&themeRefresh=1",
    );

    expect(data).toEqual(
      expect.objectContaining({
        url: "https://www.youtube.com/watch?v=aKllbvCaWvo&themeRefresh=1",
        provider: "youtube",
        aspectRatio: "16/9",
        sizingMode: "provider",
      }),
    );
  });

  it("uses Spotify subtype geometry without changing authored URLs", () => {
    const track = updateEmbedDataUrl(
      emptyEmbedData(),
      "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
    );
    const episode = updateEmbedDataUrl(
      emptyEmbedData(),
      "https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5",
    );

    expect(track).toMatchObject({
      provider: "spotify",
      aspectRatio: "16/9",
      sizingMode: "provider",
    });
    expect(track.url).toBe("https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b");
    expect(resolveEmbedFrame(track)).toEqual({ kind: "fixed-height", height: 80 });
    expect(resolveEmbedFrame(episode)).toEqual({ kind: "fixed-height", height: 152 });
  });

  it("uses the generic provider for unsupported URLs", () => {
    const data = updateEmbedDataUrl(
      emptyEmbedData({ provider: "youtube", aspectRatio: "16/9" }),
      "example.com/resource",
    );

    expect(data).toEqual(
      expect.objectContaining({
        url: "https://example.com/resource",
        provider: "generic",
        aspectRatio: "4/3",
      }),
    );
  });

  it("does not resolve unsupported URLs to arbitrary iframe sources", () => {
    const data = updateEmbedDataUrl(emptyEmbedData(), "example.com/resource");

    expect(data.provider).toBe("generic");
    expect(resolveEmbedUrl(data.provider, data.url)).toBeNull();
  });

  it("does not trust a persisted provider id for an unrelated hostname", () => {
    expect(resolveEmbedUrl("wikipedia", "https://example.com/resource")).toBeNull();
    expect(
      resolveEmbedUrl("wikipedia", "https://en.wikipedia.org/wiki/Instructional_scaffolding"),
    ).toBe("https://en.wikipedia.org/wiki/Instructional_scaffolding");
  });

  it("rejects non-http iframe protocols during normalization", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBe("");
    expect(normalizeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
    expect(normalizeUrl("mailto:person@example.com")).toBe("");
  });

  it("defines a default sandbox for provider iframes", () => {
    expect(DEFAULT_EMBED_SANDBOX).toContain("allow-scripts");
    expect(DEFAULT_EMBED_SANDBOX).not.toContain("allow-top-navigation");
    expect(getEmbedProvider("youtube")?.sandbox ?? DEFAULT_EMBED_SANDBOX).toBe(
      DEFAULT_EMBED_SANDBOX,
    );
  });

  it("normalizes provider metadata when settings change the URL", () => {
    const data = normalizeEmbedSettingsUpdate({
      current: emptyEmbedData(),
      next: emptyEmbedData({
        url: "www.youtube.com/watch?v=aKllbvCaWvo",
        aspectRatio: "4/3",
      }),
    });

    expect(data).toMatchObject({
      url: "https://www.youtube.com/watch?v=aKllbvCaWvo",
      provider: "youtube",
      aspectRatio: "16/9",
    });
  });

  it("preserves manual aspect ratio changes when settings keep the same URL", () => {
    const current = updateEmbedDataUrl(emptyEmbedData(), "https://example.com/resource");
    const data = normalizeEmbedSettingsUpdate({
      current,
      next: {
        ...current,
        aspectRatio: "1/1",
      },
    });

    expect(data).toMatchObject({
      url: "https://example.com/resource",
      provider: "generic",
      aspectRatio: "1/1",
      sizingMode: "aspect-ratio",
    });
  });

  it("preserves a detectable legacy manual ratio while migrating the old provider default", () => {
    const legacySpotify = emptyEmbedData({
      url: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
      provider: "spotify",
      aspectRatio: "16/9",
    });
    const legacyManualSpotify = { ...legacySpotify, aspectRatio: "4/3" as const };

    expect(resolveEmbedFrame(legacySpotify)).toEqual({ kind: "fixed-height", height: 80 });
    expect(resolveEmbedFrame(legacyManualSpotify)).toEqual({
      kind: "aspect-ratio",
      aspectRatio: "4/3",
    });
  });
});

describe("EmbedSurface accessibility", () => {
  it("preserves the full compact Spotify viewport inside the themed frame", () => {
    render(
      createElement(EmbedSurface, {
        data: updateEmbedDataUrl(
          emptyEmbedData(),
          "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
        ),
        editable: false,
      }),
    );

    const iframe = screen.getByTitle("Spotify embed");
    expect(iframe.style.height).toBe("80px");
    expect(iframe.getAttribute("scrolling")).toBeNull();
    expect(iframe.closest(".sc-course-embed__frame")?.getAttribute("style")).toBeNull();
  });

  it("uses one fullscreen permission mechanism for YouTube embeds", () => {
    render(
      createElement(EmbedSurface, {
        data: updateEmbedDataUrl(emptyEmbedData(), "https://www.youtube.com/watch?v=aKllbvCaWvo"),
        editable: false,
      }),
    );

    const iframe = screen.getByTitle("YouTube embed");
    expect(iframe.getAttribute("allow")).toContain("fullscreen");
    expect(iframe.hasAttribute("allowfullscreen")).toBe(false);
  });

  it("uses a meaningful caption as the iframe name and Course-owned learner classes", () => {
    const { container } = render(
      createElement(EmbedSurface, {
        data: {
          ...updateEmbedDataUrl(
            emptyEmbedData(),
            "https://www.youtube.com/watch?v=aKllbvCaWvo",
          ),
          caption: "How scaffolded practice works",
        },
        editable: false,
      }),
    );

    expect(screen.getByTitle("How scaffolded practice works")).not.toBeNull();
    expect(container.querySelector(".sc-course-embed__figure")).not.toBeNull();
    expect(container.querySelector('[class*="sc-app-embed"]')).toBeNull();
    expect(container.querySelector('[class*="sc-embed"]')).toBeNull();
  });

  it("keeps author URL controls App-owned without stealing initial focus", () => {
    const { container } = render(
      createElement(EmbedSurface, {
        data: emptyEmbedData(),
        editable: true,
        onSubmit: () => undefined,
      }),
    );

    const input = screen.getByRole("textbox", { name: "Embed URL" });
    expect(input.hasAttribute("autofocus")).toBe(false);
    expect(container.querySelector(".sc-app-embed__form")).not.toBeNull();
    expect(container.querySelector(".sc-course-embed__empty")).not.toBeNull();
  });

  it("exposes missing runtime embeds as a passive status", () => {
    render(
      createElement(EmbedSurface, {
        data: emptyEmbedData(),
        editable: false,
      }),
    );

    expect(screen.getByRole("status").textContent).toContain("No embed");
    expect(screen.queryByRole("textbox", { name: "Embed URL" })).toBeNull();
    expect(screen.queryByTitle("Supported URL embed")).toBeNull();
  });

  it("exposes unsupported runtime embed URLs as alerts", () => {
    render(
      createElement(EmbedSurface, {
        data: updateEmbedDataUrl(emptyEmbedData(), "example.com/resource"),
        editable: false,
      }),
    );

    expect(screen.getByRole("alert").textContent).toContain("Embed unavailable");
    expect(screen.queryByRole("textbox", { name: "Embed URL" })).toBeNull();
    expect(screen.queryByTitle("Supported URL embed")).toBeNull();
  });
});
