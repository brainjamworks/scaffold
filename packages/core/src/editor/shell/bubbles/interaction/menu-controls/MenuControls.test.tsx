// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EyeIcon as Eye, LightningIcon as Lightning } from "@phosphor-icons/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  AUTHORING_CHROME_ATTR,
  AuthoringChromeKind,
} from "@/editor/interactions/dom/authoring-chrome";

import { MenuControls } from "./MenuControls";

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
});

describe("MenuControls", () => {
  it("renders icon-toggle controls as icon-only buttons with a full tooltip", async () => {
    const user = userEvent.setup();

    render(
      <MenuControls
        controls={[
          {
            kind: "boolean",
            name: "showAnswer",
            label: "Show answer",
            icon: Eye,
            presentation: "icon-toggle",
          },
        ]}
        value={{ showAnswer: false }}
        onValueChange={() => true}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Show answer (off)" });
    expect(trigger.textContent).toBe("");

    await user.hover(trigger);
    expect((await screen.findByRole("tooltip")).textContent).toBe("Show answer");
  });

  it("names icon-only segmented options with their control and option labels", async () => {
    const user = userEvent.setup();

    render(
      <MenuControls
        controls={[
          {
            kind: "select",
            name: "feedbackMode",
            label: "Feedback mode",
            presentation: "segmented",
            options: [{ value: "immediate", label: "Immediate", icon: Lightning }],
          },
        ]}
        value={{ feedbackMode: "immediate" }}
        onValueChange={() => true}
      />,
    );

    const trigger = screen.getByRole("radio", { name: "Feedback mode: Immediate" });
    expect(trigger.textContent).toBe("");

    await user.hover(trigger);
    expect((await screen.findByRole("tooltip")).textContent).toBe("Feedback mode: Immediate");
  });

  it("routes color controls through editor floating authoring popovers", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <MenuControls
        controls={[
          {
            kind: "color",
            name: "backgroundColor",
            label: "Background colour",
          },
        ]}
        value={{ backgroundColor: "#ffffff" }}
        onValueChange={onValueChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Background colour" }));

    const dialog = screen.getByRole("dialog", { name: "Background colour" });
    expect(dialog.getAttribute(AUTHORING_CHROME_ATTR)).toBe(AuthoringChromeKind.Popover);

    await user.click(screen.getByRole("button", { name: "Navy" }));

    expect(onValueChange).toHaveBeenCalledWith("backgroundColor", "#161D77");
  });

  it("consumes native Escape when a real menu select closes", async () => {
    const user = userEvent.setup();

    render(
      <MenuControls
        controls={[
          {
            kind: "select",
            name: "size",
            label: "Block size",
            options: [
              { value: "small", label: "Small" },
              { value: "large", label: "Large" },
            ],
          },
        ]}
        value={{ size: "small" }}
        onValueChange={() => true}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Block size" });
    await user.click(trigger);
    expect(screen.getByRole("listbox", { name: "Block size" })).not.toBeNull();

    const escape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    fireEvent(trigger, escape);

    expect(escape.defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.queryByRole("listbox", { name: "Block size" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
