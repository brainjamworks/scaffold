// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { OverlayBoundary } from "@/ui/components/OverlayBoundary/OverlayBoundary";

import { MenuSelect } from "./MenuSelect";

const options = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium", disabled: true },
  { value: "large", label: "Large" },
] as const;

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("MenuSelect", () => {
  it("opens an accessible owned listbox in the nearest boundary host", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    render(
      <OverlayBoundary container={container} kind="viewport">
        <MenuSelect label="Block size" value="small" options={options} onChange={vi.fn()} />
      </OverlayBoundary>,
    );

    const trigger = screen.getByRole("combobox", { name: "Block size" });
    expect(trigger.textContent).toContain("Small");
    await userEvent.click(trigger);

    const listbox = await screen.findByRole("listbox", { name: "Block size" });
    const host = container.querySelector(":scope > [data-scaffold-overlay-host]");
    expect(host).not.toBeNull();
    expect(listbox.closest("[data-radix-popper-content-wrapper]")?.parentElement).toBe(host);
  });

  it("does not render content while a scoped boundary is pending", async () => {
    render(
      <OverlayBoundary container={null} kind="viewport">
        <MenuSelect label="Block size" value="small" options={options} onChange={vi.fn()} />
      </OverlayBoundary>,
    );

    await userEvent.click(screen.getByRole("combobox", { name: "Block size" }));
    expect(screen.queryByRole("listbox", { name: "Block size" })).toBeNull();
  });

  it("uses Radix arrow and boundary navigation and skips disabled options", async () => {
    const onChange = vi.fn();
    render(<MenuSelect label="Block size" value="small" options={options} onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "Block size" });

    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(await screen.findByRole("listbox", { name: "Block size" })).not.toBeNull();
    await waitFor(() => expect(document.activeElement?.textContent).toContain("Small"));

    await userEvent.keyboard("{End}");
    await waitFor(() => expect(document.activeElement?.textContent).toContain("Large"));
    await userEvent.keyboard("{Home}");
    await waitFor(() => expect(document.activeElement?.textContent).toContain("Small"));
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("large");
    expect(screen.queryByRole("listbox", { name: "Block size" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape, returns focus, and closes on outside interaction", async () => {
    render(
      <>
        <MenuSelect label="Block size" value="small" options={options} onChange={vi.fn()} />
        <button type="button">Outside</button>
      </>,
    );
    const trigger = screen.getByRole("combobox", { name: "Block size" });
    const outside = screen.getByRole("button", { name: "Outside" });

    await userEvent.click(trigger);
    expect(await screen.findByRole("listbox", { name: "Block size" })).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox", { name: "Block size" })).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await userEvent.click(trigger);
    expect(await screen.findByRole("listbox", { name: "Block size" })).not.toBeNull();
    fireEvent.pointerDown(outside);
    await waitFor(() => expect(screen.queryByRole("listbox", { name: "Block size" })).toBeNull());
  });

  it("keeps disabled controls closed and disabled options unavailable", async () => {
    const { rerender } = render(
      <MenuSelect disabled label="Block size" value="small" options={options} onChange={vi.fn()} />,
    );

    const disabledTrigger = screen.getByRole("combobox", { name: "Block size" });
    expect(disabledTrigger.hasAttribute("disabled")).toBe(true);
    await userEvent.click(disabledTrigger);
    expect(screen.queryByRole("listbox", { name: "Block size" })).toBeNull();

    rerender(<MenuSelect label="Block size" value="small" options={options} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Block size" }));
    expect(screen.getByRole("option", { name: "Medium" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });
});
