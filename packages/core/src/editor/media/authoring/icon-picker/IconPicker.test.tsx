// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { setIconCatalogForTests } from "@/ui/icons/catalog";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import type { MediaPort } from "@/host/ports/media";
import { catalogIconValue, mediaIconValue } from "@/schemas/media/icon";
import {
  AUTHORING_CHROME_ATTR,
  AuthoringChromeKind,
} from "@/editor/interactions/dom/authoring-chrome";

import { IconPicker } from "./IconPicker";

describe("IconPicker", () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() =>
      DOMRect.fromRect({
        height: 32,
        width: 96,
        x: 48,
        y: 48,
      }),
    );
    vi.spyOn(Element.prototype, "getClientRects").mockImplementation(
      function mockClientRects(this: Element) {
        return [this.getBoundingClientRect()] as unknown as DOMRectList;
      },
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
      function clientWidth(this: HTMLElement) {
        return this === document.documentElement || this === document.body ? 1024 : 96;
      },
    );
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
      function clientHeight(this: HTMLElement) {
        return this === document.documentElement || this === document.body ? 768 : 32;
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
      function scrollWidth(this: HTMLElement) {
        return this.clientWidth;
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function scrollHeight(this: HTMLElement) {
        return this.clientHeight;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    setIconCatalogForTests(null);
  });

  it("loads the lazy icon and emoji catalog when opened", async () => {
    const onValueChange = vi.fn();
    render(
      <IconPicker
        value={null}
        fallbackValue={catalogIconValue("info")}
        onValueChange={onValueChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /default icon/i }));

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: /search icons/i }));
    });

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /select .+ icon/i }).length).toBeGreaterThan(0);
    });

    const firstIconButton = screen.getAllByRole("button", {
      name: /select .+ icon/i,
    })[0] as HTMLElement;
    const iconName = firstIconButton.getAttribute("title");
    expect(iconName).not.toBeNull();
    await userEvent.click(firstIconButton);
    expect(onValueChange).toHaveBeenCalledWith(catalogIconValue(iconName!));

    await userEvent.click(screen.getByRole("button", { name: /default icon/i }));

    await userEvent.click(screen.getByRole("tab", { name: /emoji/i }));
    expect(
      await screen.findAllByRole("button", { name: /select grinning face/i }),
    ).not.toHaveLength(0);
  });

  it("marks the picker content as editor floating authoring chrome", async () => {
    render(
      <IconPicker value={null} fallbackValue={catalogIconValue("info")} onValueChange={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /default icon/i }));

    const searchInput = await screen.findByRole("searchbox", { name: /search icons/i });
    const popoverContent = searchInput.closest(`[${AUTHORING_CHROME_ATTR}]`);

    expect(popoverContent?.getAttribute(AUTHORING_CHROME_ATTR)).toBe(AuthoringChromeKind.Popover);
    expect(popoverContent?.classList.contains("sc-icon-emoji-picker-content")).toBe(true);
  });

  it("selects image icons from managed media", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const media: MediaPort = {
      resolve: async () => "https://example.com/logo.png",
      upload: async () => {
        throw new Error("not used");
      },
      list: async () => [
        {
          id: "logo-media-id",
          url: "https://example.com/logo.png",
          mediaType: "image",
          fileName: "logo.png",
          mimeType: "image/png",
          size: 1234,
        },
      ],
    };

    render(
      <ScaffoldServicesProvider ports={{ media }}>
        <IconPicker
          value={null}
          fallbackValue={catalogIconValue("info")}
          onValueChange={onValueChange}
        />
      </ScaffoldServicesProvider>,
    );

    await user.click(screen.getByRole("button", { name: /default icon/i }));
    await user.click(screen.getByRole("button", { name: "Image" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Choose image icon",
    });
    expect(within(dialog).queryByText("Audio")).toBeNull();
    expect(within(dialog).queryByText("Video")).toBeNull();

    await user.click(
      await within(dialog).findByRole("button", {
        name: "Choose image: logo.png",
      }),
    );

    expect(onValueChange).toHaveBeenCalledWith(mediaIconValue("logo-media-id"));
  });
});
