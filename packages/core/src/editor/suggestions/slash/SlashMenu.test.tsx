// @vitest-environment happy-dom

import { ImageSquareIcon, SelectionBackgroundIcon } from "@phosphor-icons/react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { SlashItem } from "../insert/items";
import { SlashMenu, type SlashMenuHandle } from "./SlashMenu";

const items = [
  {
    id: "gallery",
    title: "Gallery",
    description: "Add an image gallery.",
    category: "media",
    icon: ImageSquareIcon,
    keywords: ["images"],
    nodeType: "gallery",
    content: () => ({ type: "gallery" }),
  },
  {
    id: "image-hotspot",
    title: "Image hotspot",
    description: "Ask learners to identify regions on an image.",
    category: "assessment",
    icon: SelectionBackgroundIcon,
    keywords: ["image", "assessment"],
    nodeType: "imageHotspot",
    content: () => ({ type: "imageHotspot" }),
  },
] satisfies SlashItem[];

describe("SlashMenu", () => {
  it("exposes slash insert results as a labelled listbox with selected options", () => {
    render(<SlashMenu items={items} command={vi.fn()} />);

    const listbox = screen.getByRole("listbox", { name: "Insert block" });
    const gallery = screen.getByRole("option", { name: "Gallery" });
    const hotspot = screen.getByRole("option", { name: "Image hotspot" });

    expect(listbox.getAttribute("aria-activedescendant")).toBe(gallery.id);
    expect(gallery.getAttribute("aria-selected")).toBe("true");
    expect(hotspot.getAttribute("aria-selected")).toBe("false");
    expect(gallery.getAttribute("aria-describedby")).toBe("slash-menu-option-gallery-description");
    expect(document.getElementById("slash-menu-option-gallery-description")?.textContent).toBe(
      "Add an image gallery.",
    );
  });

  it("updates the active option through the suggestion keyboard bridge", () => {
    const ref = createRef<SlashMenuHandle>();
    const command = vi.fn();

    render(<SlashMenu ref={ref} items={items} command={command} />);

    act(() => {
      ref.current?.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    });

    const listbox = screen.getByRole("listbox", { name: "Insert block" });
    const hotspot = screen.getByRole("option", { name: "Image hotspot" });

    expect(listbox.getAttribute("aria-activedescendant")).toBe(hotspot.id);
    expect(hotspot.getAttribute("aria-selected")).toBe("true");

    act(() => {
      ref.current?.onKeyDown(new KeyboardEvent("keydown", { key: "Enter" }));
    });

    expect(command).toHaveBeenLastCalledWith(items[1]);
  });

  it("moves to the first and last option with Home and End", () => {
    const ref = createRef<SlashMenuHandle>();

    render(<SlashMenu ref={ref} items={items} command={vi.fn()} />);

    act(() => {
      ref.current?.onKeyDown(new KeyboardEvent("keydown", { key: "End" }));
    });

    const listbox = screen.getByRole("listbox", { name: "Insert block" });
    const gallery = screen.getByRole("option", { name: "Gallery" });
    const hotspot = screen.getByRole("option", { name: "Image hotspot" });

    expect(listbox.getAttribute("aria-activedescendant")).toBe(hotspot.id);
    expect(hotspot.getAttribute("aria-selected")).toBe("true");

    act(() => {
      ref.current?.onKeyDown(new KeyboardEvent("keydown", { key: "Home" }));
    });

    expect(listbox.getAttribute("aria-activedescendant")).toBe(gallery.id);
    expect(gallery.getAttribute("aria-selected")).toBe("true");
  });

  it("announces empty slash searches as a polite status", () => {
    render(<SlashMenu items={[]} command={vi.fn()} />);

    const status = screen.getByRole("status");

    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("No block matches");
  });

  it("selects hovered options without requiring keyboard focus", async () => {
    render(<SlashMenu items={items} command={vi.fn()} />);

    await userEvent.hover(screen.getByRole("option", { name: "Image hotspot" }));

    expect(
      screen.getByRole("listbox", { name: "Insert block" }).getAttribute("aria-activedescendant"),
    ).toBe("slash-menu-option-image-hotspot");
  });
});
