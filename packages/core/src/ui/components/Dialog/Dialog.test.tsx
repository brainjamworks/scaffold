// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";

import * as Dialog from "./Dialog";
import { OverlayBoundary } from "../OverlayBoundary/OverlayBoundary";

function ControlledDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button">Open dialog</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Title>Scaffold dialog</Dialog.Title>
          <Dialog.Description>Owned dialog seam</Dialog.Description>
          <Dialog.Close>Close dialog</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ScopedDialog({ container }: { container: Element | null }) {
  return (
    <OverlayBoundary container={container} kind="viewport">
      <ControlledDialog />
    </OverlayBoundary>
  );
}

function ExplicitContainerDialog({
  boundaryContainer,
  portalContainer,
}: {
  boundaryContainer: Element | null;
  portalContainer: Element;
}) {
  return (
    <OverlayBoundary container={boundaryContainer} kind="viewport">
      <ExplicitDialog portalContainer={portalContainer} />
    </OverlayBoundary>
  );
}

function ExplicitDialog({ portalContainer }: { portalContainer: Element }) {
  return (
    <Dialog.Root defaultOpen>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Content>
          <Dialog.Title>Explicit dialog</Dialog.Title>
          <Dialog.Description>Explicit destination</Dialog.Description>
          Explicit content
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NestedDialogExample() {
  const [parentOpen, setParentOpen] = useState(false);
  const [childOpen, setChildOpen] = useState(false);
  const [boundaryContainer, setBoundaryContainer] = useState<HTMLDivElement | null>(null);

  return (
    <Dialog.Root open={parentOpen} onOpenChange={setParentOpen}>
      <Dialog.Trigger asChild>
        <button type="button">Open workspace</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Title>Workspace dialog</Dialog.Title>
          <Dialog.Description>Parent modal</Dialog.Description>
          <div data-test-portal-host="" ref={setBoundaryContainer} />
          <OverlayBoundary container={boundaryContainer} kind="viewport">
            <Dialog.Root open={childOpen} onOpenChange={setChildOpen}>
              <Dialog.Trigger asChild>
                <button type="button">Open child</button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay />
                <Dialog.Content>
                  <Dialog.Title>Child dialog</Dialog.Title>
                  <Dialog.Description>Nested modal</Dialog.Description>
                  Child content
                  <Dialog.Close>Close child</Dialog.Close>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </OverlayBoundary>
          <Dialog.Close>Close workspace</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

describe("Dialog", () => {
  it("preserves the accessible Radix composition behind the Scaffold-owned seam", async () => {
    render(<ControlledDialog />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });

    await userEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: "Scaffold dialog" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close dialog" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("preserves the ordinary body portal when no scope exists", async () => {
    render(<ControlledDialog />);

    await userEvent.click(screen.getByRole("button", { name: "Open dialog" }));

    expect(screen.getByRole("dialog", { name: "Scaffold dialog" }).parentElement).toBe(
      document.body,
    );
  });

  it("waits instead of falling back to the body while a scope is pending", async () => {
    render(<ScopedDialog container={null} />);

    await userEvent.click(screen.getByRole("button", { name: "Open dialog" }));

    expect(screen.queryByRole("dialog", { name: "Scaffold dialog" })).toBeNull();
  });

  it("portals into a ready scoped host", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    render(<ScopedDialog container={container} />);
    await userEvent.click(screen.getByRole("button", { name: "Open dialog" }));

    const host = container.querySelector(":scope > [data-scaffold-overlay-host]");
    expect(host).not.toBeNull();
    expect(screen.getByRole("dialog", { name: "Scaffold dialog" }).parentElement).toBe(host);

    container.remove();
  });

  it("does not let an explicit portal container bypass a pending scope", () => {
    const explicitContainer = document.createElement("div");
    document.body.append(explicitContainer);

    render(
      <ExplicitContainerDialog boundaryContainer={null} portalContainer={explicitContainer} />,
    );

    expect(screen.queryByRole("dialog", { name: "Explicit dialog" })).toBeNull();

    explicitContainer.remove();
  });

  it("preserves an explicit portal container when no scope exists", () => {
    const explicitContainer = document.createElement("div");
    document.body.append(explicitContainer);

    render(<ExplicitDialog portalContainer={explicitContainer} />);

    expect(screen.getByRole("dialog", { name: "Explicit dialog" }).parentElement).toBe(
      explicitContainer,
    );

    explicitContainer.remove();
  });

  it("does not let an explicit portal container bypass a ready scope", () => {
    const boundaryContainer = document.createElement("div");
    const explicitContainer = document.createElement("div");
    document.body.append(boundaryContainer, explicitContainer);

    render(
      <ExplicitContainerDialog
        boundaryContainer={boundaryContainer}
        portalContainer={explicitContainer}
      />,
    );

    const host = boundaryContainer.querySelector(":scope > [data-scaffold-overlay-host]");
    expect(host).not.toBeNull();
    expect(screen.getByRole("dialog", { name: "Explicit dialog" }).parentElement).toBe(host);
    expect(explicitContainer.childElementCount).toBe(0);

    boundaryContainer.remove();
    explicitContainer.remove();
  });

  it("closes a scoped child independently and restores focus without relocating its parent", async () => {
    render(<NestedDialogExample />);

    const parentTrigger = screen.getByRole("button", { name: "Open workspace" });
    await userEvent.click(parentTrigger);
    const parentDialog = screen.getByRole("dialog", { name: "Workspace dialog" });
    const childTrigger = screen.getByRole("button", { name: "Open child" });

    expect(parentDialog.parentElement).toBe(document.body);

    await userEvent.click(childTrigger);

    const host = parentDialog.querySelector("[data-scaffold-overlay-host]");
    expect(host).not.toBeNull();
    expect(screen.getByRole("dialog", { name: "Child dialog" }).parentElement).toBe(host);

    await userEvent.click(screen.getByRole("button", { name: "Close child" }));

    expect(screen.queryByRole("dialog", { name: "Child dialog" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Workspace dialog" })).toBe(parentDialog);
    expect(parentDialog.parentElement).toBe(document.body);
    expect(document.activeElement).toBe(childTrigger);

    await userEvent.click(screen.getByRole("button", { name: "Close workspace" }));

    expect(screen.queryByRole("dialog", { name: "Workspace dialog" })).toBeNull();
    expect(document.activeElement).toBe(parentTrigger);
  });
});
