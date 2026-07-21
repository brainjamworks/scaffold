// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  handleInteractionBubbleToolbarKeyDown,
  interactionBubbleRootA11yAttributes,
} from "./interaction-bubble-toolbar";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("interaction bubble toolbar helpers", () => {
  it("exposes the interaction bubble root as a labelled toolbar", () => {
    expect(interactionBubbleRootA11yAttributes()).toEqual({
      role: "toolbar",
      "aria-label": "Block actions",
      "aria-orientation": "horizontal",
    });
  });

  it("moves focus through enabled interaction bubble controls with arrow, home, and end keys", () => {
    render(
      <div
        {...interactionBubbleRootA11yAttributes()}
        onKeyDown={handleInteractionBubbleToolbarKeyDown}
      >
        <button type="button">Duplicate block</button>
        <button type="button" disabled>
          Disabled action
        </button>
        <button type="button">Delete block</button>
        <button type="button">Open block settings</button>
      </div>,
    );

    const toolbar = screen.getByRole("toolbar", { name: "Block actions" });
    const duplicate = within(toolbar).getByRole("button", {
      name: "Duplicate block",
    });
    const disabled = within(toolbar).getByRole("button", {
      name: "Disabled action",
    });
    const deleteButton = within(toolbar).getByRole("button", {
      name: "Delete block",
    });
    const settings = within(toolbar).getByRole("button", {
      name: "Open block settings",
    });
    const revealSettings = vi.fn();
    settings.scrollIntoView = revealSettings;
    Object.defineProperties(toolbar, {
      clientLeft: { configurable: true, value: 0 },
      clientWidth: { configurable: true, value: 160 },
      scrollLeft: { configurable: true, value: 0, writable: true },
    });
    toolbar.getBoundingClientRect = () => new DOMRect(100, 20, 160, 40);
    duplicate.getBoundingClientRect = () => new DOMRect(108, 20, 32, 32);
    deleteButton.getBoundingClientRect = () => new DOMRect(148, 20, 32, 32);
    settings.getBoundingClientRect = () => new DOMRect(248, 20, 48, 32);
    expect(disabled).toHaveProperty("disabled", true);

    duplicate.focus();
    fireEvent.keyDown(duplicate, { key: "ArrowRight" });
    expect(document.activeElement).toBe(deleteButton);

    fireEvent.keyDown(deleteButton, { key: "End" });
    expect(document.activeElement).toBe(settings);
    expect(toolbar.scrollLeft).toBe(36);
    expect(revealSettings).not.toHaveBeenCalled();

    fireEvent.keyDown(settings, { key: "Home" });
    expect(document.activeElement).toBe(duplicate);

    fireEvent.keyDown(duplicate, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(settings);
  });
});
