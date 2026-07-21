// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { setIconCatalogForTests, type IconCatalog, type IconNode } from "@/ui/icons/catalog";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import type { MediaPort } from "@/host/ports/media";
import { catalogIconValue, emojiIconValue, mediaIconValue } from "@/schemas/media/icon";

import { IconRenderer } from "./IconRenderer";

describe("IconRenderer", () => {
  afterEach(() => {
    cleanup();
    setIconCatalogForTests(null);
  });

  it("renders an essential Lucide fallback without loading the catalog", () => {
    render(<IconRenderer value={catalogIconValue("info")} decorative={false} label="Info icon" />);

    const icon = screen.getByRole("img", { name: "Info icon" });
    expect(icon.tagName.toLowerCase()).toBe("svg");
    expect(icon.querySelector("circle")).not.toBeNull();
  });

  it("renders emoji values as text glyphs", () => {
    render(<IconRenderer value={emojiIconValue("💡")} decorative={false} label="Light bulb" />);

    expect(screen.getByRole("img", { name: "Light bulb" }).textContent).toBe("💡");
  });

  it("drops unsupported SVG tags and unsafe attributes from catalog data", () => {
    const unsafeCatalog: IconCatalog = {
      icons: {
        icons: {
          unsafe: [
            ["script", { href: "bad" }] as unknown as IconNode,
            ["path", { d: "M1 1h2", onclick: "bad" } as unknown as IconNode[1]],
          ],
        },
        categories: {},
      },
      emojis: { groups: [] },
    };
    setIconCatalogForTests(unsafeCatalog);

    render(
      <IconRenderer value={catalogIconValue("unsafe")} decorative={false} label="Unsafe icon" />,
    );

    const icon = screen.getByRole("img", { name: "Unsafe icon" });
    expect(icon.querySelector("script")).toBeNull();
    expect(icon.querySelector("path")).not.toBeNull();
    expect(icon.querySelector("path")?.getAttribute("onclick")).toBeNull();
  });

  it("resolves managed media icon values through the media port", async () => {
    const media: MediaPort = {
      resolve: async () => "https://example.com/logo.png",
      upload: async () => {
        throw new Error("not used");
      },
    };

    render(
      <ScaffoldServicesProvider ports={{ media }}>
        <IconRenderer
          value={mediaIconValue("logo-media-id", "University logo")}
          decorative={false}
        />
      </ScaffoldServicesProvider>,
    );

    await waitFor(() => {
      const image = screen.getByRole("img", { name: "University logo" });
      expect(image.tagName.toLowerCase()).toBe("img");
      expect(image.getAttribute("src")).toBe("https://example.com/logo.png");
    });
  });
});
