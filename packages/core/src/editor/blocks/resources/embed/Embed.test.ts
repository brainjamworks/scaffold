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
      }),
    );
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
    });
  });
});

describe("EmbedSurface accessibility", () => {
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
