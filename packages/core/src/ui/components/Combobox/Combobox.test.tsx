// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { Combobox, type ComboboxOption } from "./Combobox";
import * as Dialog from "../Dialog/Dialog";
import { OverlayBoundary } from "../OverlayBoundary/OverlayBoundary";

const languageOptions: ComboboxOption[] = [
  { value: "plain", label: "Plain text" },
  {
    value: "ts",
    label: "TypeScript",
    description: "Typed JavaScript",
  },
  { value: "sql", label: "SQL" },
];

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  document.querySelectorAll("[data-test-portal-host]").forEach((host) => host.remove());
  document.querySelectorAll("iframe[data-test-owner-document]").forEach((frame) => frame.remove());
});

function createOwnerDocumentBoundary() {
  const frame = document.createElement("iframe");
  frame.dataset.testOwnerDocument = "";
  document.body.append(frame);

  const ownerDocument = frame.contentDocument;
  const ownerWindow = frame.contentWindow;
  if (ownerDocument === null || ownerWindow === null) {
    throw new Error("Expected iframe owner document and window");
  }

  const container = ownerDocument.createElement("section");
  const collisionBoundary = ownerDocument.createElement("div");
  const mount = ownerDocument.createElement("div");
  const getCollisionBoundaryRect = vi.fn(() => new DOMRect(0, 0, 180, 120));
  collisionBoundary.getBoundingClientRect = getCollisionBoundaryRect;
  container.append(collisionBoundary, mount);
  ownerDocument.body.append(container);

  return {
    collisionBoundary,
    container,
    getCollisionBoundaryRect,
    mount,
    ownerDocument,
    ownerWindow,
  };
}

function NestedComboboxExample() {
  const [parentOpen, setParentOpen] = useState(false);
  const [value, setValue] = useState("plain");
  const [boundaryContainer, setBoundaryContainer] = useState<HTMLDivElement | null>(null);

  return (
    <Dialog.Root open={parentOpen} onOpenChange={setParentOpen}>
      <Dialog.Trigger asChild>
        <button type="button">Open workspace</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content>
          <Dialog.Title>Workspace dialog</Dialog.Title>
          <Dialog.Description>Parent modal</Dialog.Description>
          <div data-test-portal-host="" ref={setBoundaryContainer} />
          <OverlayBoundary container={boundaryContainer} kind="viewport">
            <Combobox
              aria-label="Code language"
              value={value}
              onChange={setValue}
              options={languageOptions}
              searchPlaceholder="Search languages"
            />
          </OverlayBoundary>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

describe("Combobox", () => {
  it("wires the trigger, combobox input, listbox, and active option with accessible state", async () => {
    render(
      <Combobox
        aria-label="Code language"
        value="ts"
        onChange={vi.fn()}
        options={languageOptions}
        searchPlaceholder="Search languages"
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Code language: TypeScript",
    });

    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBeNull();
    expect(trigger.classList.contains("sc-combobox-trigger")).toBe(true);

    await userEvent.click(trigger);

    const combobox = await screen.findByRole("combobox", {
      name: "Code language search",
    });
    const listbox = screen.getByRole("listbox", {
      name: "Code language options",
    });
    const activeOption = screen.getByRole("option", { name: "TypeScript" });
    const inactiveOption = screen.getByRole("option", { name: "Plain text" });

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(listbox.id);
    expect(combobox.getAttribute("aria-expanded")).toBe("true");
    expect(combobox.getAttribute("aria-controls")).toBe(listbox.id);
    expect(combobox.getAttribute("aria-autocomplete")).toBe("list");
    expect(combobox.getAttribute("aria-activedescendant")).toBe(activeOption.id);
    expect(combobox.classList.contains("sc-combobox-search-input")).toBe(true);
    expect(listbox.classList.contains("sc-combobox-listbox")).toBe(true);
    expect(activeOption.classList.contains("sc-combobox-option")).toBe(true);
    expect(activeOption.getAttribute("data-active")).toBe("true");
    expect(activeOption.getAttribute("aria-selected")).toBe("true");
    expect(inactiveOption.getAttribute("aria-selected")).toBe("false");
    expect(activeOption.getAttribute("aria-describedby")).toBe(`${activeOption.id}-description`);
    expect(document.getElementById(`${activeOption.id}-description`)?.textContent).toBe(
      "Typed JavaScript",
    );
  });

  it("updates the active descendant with keyboard navigation and selects it with Enter", async () => {
    const onChange = vi.fn();

    render(
      <Combobox
        aria-label="Code language"
        value="plain"
        onChange={onChange}
        options={languageOptions}
        searchPlaceholder="Search languages"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Code language: Plain text" }));

    const combobox = await screen.findByRole("combobox", {
      name: "Code language search",
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(combobox);
    });

    await userEvent.keyboard("{ArrowDown}");

    const typeScriptOption = screen.getByRole("option", {
      name: "TypeScript",
    });

    expect(combobox.getAttribute("aria-activedescendant")).toBe(typeScriptOption.id);
    expect(typeScriptOption.getAttribute("aria-selected")).toBe("true");

    await userEvent.keyboard("{Enter}");

    expect(onChange).toHaveBeenLastCalledWith("ts");
    await waitFor(() => {
      expect(screen.queryByRole("combobox")).toBeNull();
    });
  });

  it("announces empty searches without leaving a stale active descendant", async () => {
    render(
      <Combobox
        aria-label="Code language"
        value="plain"
        onChange={vi.fn()}
        options={languageOptions}
        searchPlaceholder="Search languages"
        emptyStateLabel="No language matches"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Code language: Plain text" }));

    const combobox = await screen.findByRole("combobox", {
      name: "Code language search",
    });

    await userEvent.type(combobox, "zzz");

    const status = screen.getByRole("status");

    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("No language matches");
    expect(combobox.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("waits instead of falling back to the body while a scope is pending", async () => {
    render(
      <OverlayBoundary container={null} kind="viewport">
        <Combobox
          aria-label="Code language"
          value="plain"
          onChange={vi.fn()}
          options={languageOptions}
        />
      </OverlayBoundary>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Code language: Plain text" }));

    expect(screen.queryByRole("combobox", { name: "Code language search" })).toBeNull();
  });

  it("keeps the ordinary body portal when no scope exists", async () => {
    render(
      <Combobox
        aria-label="Code language"
        value="plain"
        onChange={vi.fn()}
        options={languageOptions}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Code language: Plain text" }));

    expect(
      screen
        .getByRole("combobox", { name: "Code language search" })
        .closest("[data-radix-popper-content-wrapper]")?.parentElement,
    ).toBe(document.body);
  });

  it("portals into a ready scoped host", async () => {
    const container = document.createElement("div");
    container.dataset.testPortalHost = "";
    document.body.append(container);

    render(
      <OverlayBoundary container={container} kind="viewport">
        <Combobox
          aria-label="Code language"
          value="plain"
          onChange={vi.fn()}
          options={languageOptions}
        />
      </OverlayBoundary>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Code language: Plain text" }));

    const host = container.querySelector(":scope > [data-scaffold-overlay-host]");
    expect(host).not.toBeNull();
    expect(
      screen
        .getByRole("combobox", { name: "Code language search" })
        .closest("[data-radix-popper-content-wrapper]")?.parentElement,
    ).toBe(host);
  });

  it("focuses the search input when a pending boundary becomes ready", async () => {
    const { collisionBoundary, container, mount, ownerDocument, ownerWindow } =
      createOwnerDocumentBoundary();
    const user = userEvent.setup({ document: ownerDocument });

    const { rerender } = render(
      <OverlayBoundary container={null} collisionBoundary={collisionBoundary} kind="contained">
        <Combobox
          aria-label="Code language"
          value="plain"
          onChange={vi.fn()}
          options={languageOptions}
        />
      </OverlayBoundary>,
      { container: mount },
    );

    const trigger = ownerDocument.querySelector<HTMLButtonElement>(".sc-combobox-trigger");
    if (trigger === null) throw new Error("Expected combobox trigger");
    await user.click(trigger);

    await new Promise<void>((resolve) => ownerWindow.setTimeout(resolve, 20));
    expect(ownerDocument.querySelector<HTMLInputElement>(".sc-combobox-search-input")).toBeNull();

    rerender(
      <OverlayBoundary container={container} collisionBoundary={collisionBoundary} kind="contained">
        <Combobox
          aria-label="Code language"
          value="plain"
          onChange={vi.fn()}
          options={languageOptions}
        />
      </OverlayBoundary>,
    );

    await waitFor(() => {
      const searchInput = ownerDocument.querySelector<HTMLInputElement>(
        ".sc-combobox-search-input",
      );
      expect(searchInput).not.toBeNull();
      expect(ownerDocument.activeElement).toBe(searchInput);
    });
  });

  it("uses contained geometry in the boundary owner document", async () => {
    const {
      collisionBoundary,
      container,
      getCollisionBoundaryRect,
      mount,
      ownerDocument,
      ownerWindow,
    } = createOwnerDocumentBoundary();
    const user = userEvent.setup({ document: ownerDocument });

    const { unmount } = render(
      <OverlayBoundary container={container} collisionBoundary={collisionBoundary} kind="contained">
        <Combobox
          aria-label="Code language"
          value="plain"
          onChange={vi.fn()}
          options={languageOptions}
        />
      </OverlayBoundary>,
      { container: mount },
    );

    const trigger = ownerDocument.querySelector<HTMLButtonElement>(".sc-combobox-trigger");
    if (trigger === null) throw new Error("Expected combobox trigger");
    await user.click(trigger);

    await waitFor(() => {
      expect(
        ownerDocument.querySelector<HTMLInputElement>(".sc-combobox-search-input"),
      ).not.toBeNull();
    });

    const searchInput = ownerDocument.querySelector<HTMLInputElement>(".sc-combobox-search-input");
    if (searchInput === null) throw new Error("Expected combobox search input");

    const content = searchInput.closest<HTMLElement>(".sc-combobox-content");
    expect(content?.ownerDocument).toBe(ownerDocument);
    expect(content?.ownerDocument.defaultView).toBe(ownerWindow);
    expect(content?.closest("[data-scaffold-overlay-host]")).not.toBeNull();
    expect(content?.style.getPropertyValue("--sc-overlay-available-inline-size")).toBe(
      "var(--radix-popover-content-available-width)",
    );
    expect(content?.style.getPropertyValue("--sc-overlay-available-block-size")).toBe(
      "var(--radix-popover-content-available-height)",
    );
    expect(content?.style.getPropertyValue("--sc-overlay-anchor-inline-size")).toBe(
      "var(--radix-popover-trigger-width)",
    );
    expect(content?.style.getPropertyValue("--sc-overlay-anchor-block-size")).toBe(
      "var(--radix-popover-trigger-height)",
    );

    const popperWrapper = content?.closest<HTMLElement>("[data-radix-popper-content-wrapper]");
    const availableInlineSize = Number.parseFloat(
      popperWrapper?.style.getPropertyValue("--radix-popper-available-width") ?? "",
    );

    const collisionBoundaryWasMeasured = getCollisionBoundaryRect.mock.calls.length;
    unmount();

    expect(collisionBoundaryWasMeasured).toBeGreaterThan(0);
    expect(availableInlineSize).toBeLessThanOrEqual(180);
  });

  it("selects by keyboard without dismissing its parent dialog", async () => {
    render(<NestedComboboxExample />);

    await userEvent.click(screen.getByRole("button", { name: "Open workspace" }));
    const parentDialog = screen.getByRole("dialog", { name: "Workspace dialog" });
    const trigger = within(parentDialog).getByRole("button", {
      name: "Code language: Plain text",
    });

    trigger.focus();
    await userEvent.keyboard("{Enter}");

    const combobox = await screen.findByRole("combobox", {
      name: "Code language search",
    });
    const host = parentDialog.querySelector("[data-scaffold-overlay-host]");
    expect(host).not.toBeNull();
    expect(combobox.closest("[data-radix-popper-content-wrapper]")?.parentElement).toBe(host);
    await waitFor(() => {
      expect(document.activeElement).toBe(combobox);
    });

    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByRole("dialog", { name: "Workspace dialog" })).toBe(parentDialog);
    expect(within(parentDialog).getByRole("button", { name: "Code language: TypeScript" })).toBe(
      trigger,
    );
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});
