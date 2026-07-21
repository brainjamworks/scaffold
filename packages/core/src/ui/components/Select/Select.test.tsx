// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import * as Dialog from "../Dialog/Dialog";
import { OverlayBoundary } from "../OverlayBoundary/OverlayBoundary";
import { Select, selectVariants } from "./Select";

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

function ScopedSelect({ container }: { container: Element | null }) {
  return (
    <OverlayBoundary container={container} kind="viewport">
      <Select.Root open value="bar" onValueChange={vi.fn()}>
        <Select.Trigger aria-label="Chart type" />
        <Select.Content>
          <Select.Item value="bar">Bar</Select.Item>
          <Select.Item value="line">Line</Select.Item>
        </Select.Content>
      </Select.Root>
    </OverlayBoundary>
  );
}

function NestedSelectExample() {
  const [parentOpen, setParentOpen] = useState(false);
  const [value, setValue] = useState("bar");
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
            <Select.Root value={value} onValueChange={setValue}>
              <Select.Trigger aria-label="Chart type" />
              <Select.Content>
                <Select.Item value="bar">Bar</Select.Item>
                <Select.Item value="line">Line</Select.Item>
              </Select.Content>
            </Select.Root>
          </OverlayBoundary>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

describe("Select", () => {
  it("reflects the trigger visual contract through semantic classes", () => {
    render(
      <Select.Root value="bar" onValueChange={vi.fn()}>
        <Select.Trigger invalid placeholder="Chart type" />
      </Select.Root>,
    );

    const trigger = screen.getByRole("combobox");

    expect(trigger.classList.contains("sc-select-trigger")).toBe(true);
    expect(trigger.getAttribute("aria-invalid")).toBe("true");
    expect(trigger.getAttribute("data-invalid")).toBe("true");
    expect(trigger.querySelector(".sc-select-trigger-icon")).not.toBeNull();
  });

  it("supports the simple options API", () => {
    render(
      <Select
        value="line"
        onChange={vi.fn()}
        options={[
          { value: "bar", label: "Bar" },
          { value: "line", label: "Line" },
        ]}
      />,
    );

    expect(screen.getByRole("combobox").classList.contains("sc-select-trigger")).toBe(true);
  });

  it("keeps the exported variant helper available", () => {
    expect(selectVariants({ invalid: true })).toBe("sc-select-trigger");
  });

  it("waits instead of falling back to the body while a scope is pending", () => {
    render(<ScopedSelect container={null} />);

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("keeps the ordinary body portal when no scope exists", () => {
    render(
      <Select.Root open value="bar" onValueChange={vi.fn()}>
        <Select.Trigger aria-label="Chart type" />
        <Select.Content>
          <Select.Item value="bar">Bar</Select.Item>
        </Select.Content>
      </Select.Root>,
    );

    expect(
      screen.getByRole("listbox").closest("[data-radix-popper-content-wrapper]")?.parentElement,
    ).toBe(document.body);
  });

  it("portals into a ready scoped host", () => {
    const container = document.createElement("div");
    container.dataset.testPortalHost = "";
    document.body.append(container);

    render(<ScopedSelect container={container} />);

    const host = container.querySelector(":scope > [data-scaffold-overlay-host]");
    expect(host).not.toBeNull();
    expect(
      screen.getByRole("listbox").closest("[data-radix-popper-content-wrapper]")?.parentElement,
    ).toBe(host);
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

    const { unmount } = render(
      <OverlayBoundary container={container} collisionBoundary={collisionBoundary} kind="contained">
        <Select.Root open value="bar" onValueChange={vi.fn()}>
          <Select.Trigger aria-label="Chart type" />
          <Select.Content onCloseAutoFocus={(event) => event.preventDefault()}>
            <Select.Item value="bar">Bar</Select.Item>
            <Select.Item value="line">Line</Select.Item>
          </Select.Content>
        </Select.Root>
      </OverlayBoundary>,
      { container: mount },
    );

    await waitFor(() => {
      expect(ownerDocument.querySelector<HTMLElement>("[role=listbox]")).not.toBeNull();
    });

    const content = ownerDocument.querySelector<HTMLElement>("[role=listbox]");
    if (content === null) throw new Error("Expected select content");
    const collisionBoundaryWasMeasured = getCollisionBoundaryRect.mock.calls.length;

    expect(content?.ownerDocument).toBe(ownerDocument);
    expect(content?.ownerDocument.defaultView).toBe(ownerWindow);
    expect(content?.closest("[data-scaffold-overlay-host]")).not.toBeNull();
    expect(content?.style.getPropertyValue("--sc-overlay-available-inline-size")).toBe(
      "var(--radix-select-content-available-width)",
    );
    expect(content?.style.getPropertyValue("--sc-overlay-available-block-size")).toBe(
      "var(--radix-select-content-available-height)",
    );
    expect(content?.style.getPropertyValue("--sc-overlay-anchor-inline-size")).toBe(
      "var(--radix-select-trigger-width)",
    );
    expect(content?.style.getPropertyValue("--sc-overlay-anchor-block-size")).toBe(
      "var(--radix-select-trigger-height)",
    );

    const popperWrapper = content.closest<HTMLElement>("[data-radix-popper-content-wrapper]");
    const availableInlineSize = Number.parseFloat(
      popperWrapper?.style.getPropertyValue("--radix-popper-available-width") ?? "",
    );

    unmount();

    expect(collisionBoundaryWasMeasured).toBeGreaterThan(0);
    expect(availableInlineSize).toBeLessThanOrEqual(180);
  });

  it("selects by keyboard without dismissing its parent dialog", async () => {
    render(<NestedSelectExample />);

    await userEvent.click(screen.getByRole("button", { name: "Open workspace" }));
    const parentDialog = screen.getByRole("dialog", { name: "Workspace dialog" });
    const trigger = within(parentDialog).getByRole("combobox", { name: "Chart type" });

    trigger.focus();
    await userEvent.keyboard("{Enter}");

    const host = parentDialog.querySelector("[data-scaffold-overlay-host]");
    expect(host).not.toBeNull();
    expect(
      (await screen.findByRole("listbox")).closest("[data-radix-popper-content-wrapper]")
        ?.parentElement,
    ).toBe(host);

    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(trigger.textContent).toContain("Line");
    expect(screen.getByRole("dialog", { name: "Workspace dialog" })).toBe(parentDialog);
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});
