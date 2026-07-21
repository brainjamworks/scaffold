// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  useOverlayBoundary,
  type OverlayBoundaryEnvironment,
} from "@/ui/overlays/portal-host-context";

import * as Dialog from "../Dialog/Dialog";
import { OverlayBoundary } from "../OverlayBoundary/OverlayBoundary";
import { Select } from "../Select/Select";
import { Sheet, sheetContentVariants } from "./Sheet";

afterEach(() => {
  cleanup();
  document.querySelectorAll("[data-test-portal-host]").forEach((host) => host.remove());
});

function ScopedSheet({ container }: { container: Element | null }) {
  return (
    <OverlayBoundary container={container} kind="viewport">
      <Sheet.Root open>
        <Sheet.Content>
          <Sheet.Title>Scoped sheet</Sheet.Title>
          <Sheet.Description>Scoped sheet description</Sheet.Description>
        </Sheet.Content>
      </Sheet.Root>
    </OverlayBoundary>
  );
}

function NestedSheetExample() {
  const [parentOpen, setParentOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
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
            <Sheet.Root open={sheetOpen} onOpenChange={setSheetOpen}>
              <Sheet.Trigger asChild>
                <button type="button">Open nested sheet</button>
              </Sheet.Trigger>
              <Sheet.Content>
                <Sheet.Title>Nested sheet</Sheet.Title>
                <Sheet.Description>Child modal</Sheet.Description>
              </Sheet.Content>
            </Sheet.Root>
          </OverlayBoundary>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function BoundaryProbe({
  onReady,
}: {
  onReady: (environment: OverlayBoundaryEnvironment) => void;
}) {
  const resolution = useOverlayBoundary();

  useEffect(() => {
    if (resolution.status === "ready") onReady(resolution.environment);
  }, [onReady, resolution]);

  return null;
}

describe("Sheet", () => {
  it("reflects its content contract through semantic classes and side data", () => {
    render(
      <Sheet.Root open>
        <Sheet.Content side="left">
          <Sheet.Header closeLabel="Close panel">
            <Sheet.Title>Panel title</Sheet.Title>
            <Sheet.Description>Panel description</Sheet.Description>
          </Sheet.Header>
          <Sheet.Body>Panel body</Sheet.Body>
          <Sheet.Footer>Panel footer</Sheet.Footer>
        </Sheet.Content>
      </Sheet.Root>,
    );

    const dialog = screen.getByRole("dialog");

    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.classList.contains("sc-sheet-content")).toBe(true);
    expect(dialog.getAttribute("data-side")).toBe("left");
    expect(document.querySelector(".sc-sheet-overlay")).not.toBeNull();
    expect(document.querySelector(".sc-sheet-header")).not.toBeNull();
    expect(screen.getByText("Panel title").classList.contains("sc-sheet-title")).toBe(true);
    expect(screen.getByText("Panel description").classList.contains("sc-sheet-description")).toBe(
      true,
    );
    expect(screen.getByText("Panel body").classList.contains("sc-sheet-body")).toBe(true);
    expect(screen.getByText("Panel footer").classList.contains("sc-sheet-footer")).toBe(true);
  });

  it("keeps the exported variant helper available", () => {
    expect(sheetContentVariants({ side: "bottom" })).toBe("sc-sheet-content");
  });

  it("waits instead of falling back to the body while a scope is pending", () => {
    render(<ScopedSheet container={null} />);

    expect(screen.queryByRole("dialog", { name: "Scoped sheet" })).toBeNull();
  });

  it("portals into a ready scoped host", () => {
    const container = document.createElement("div");
    container.dataset.testPortalHost = "";
    document.body.append(container);

    render(<ScopedSheet container={container} />);

    const host = container.querySelector(":scope > [data-scaffold-overlay-host]");
    expect(host).not.toBeNull();
    expect(screen.getByRole("dialog", { name: "Scoped sheet" }).parentElement).toBe(host);
  });

  it("scopes floating descendants to the Sheet content lifecycle", async () => {
    const container = document.createElement("div");
    container.dataset.testPortalHost = "";
    document.body.append(container);
    const onReady = vi.fn<(environment: OverlayBoundaryEnvironment) => void>();
    let forwardedContent: HTMLDivElement | null = null;

    const { unmount } = render(
      <OverlayBoundary container={container} kind="viewport">
        <Sheet.Root open>
          <Sheet.Content
            ref={(element) => {
              forwardedContent = element;
            }}
          >
            <Sheet.Title>Settings</Sheet.Title>
            <Sheet.Description>Configure the question</Sheet.Description>
            <BoundaryProbe onReady={onReady} />
            <Select.Root open value="single" onValueChange={vi.fn()}>
              <Select.Trigger aria-label="Response type" />
              <Select.Content>
                <Select.Item value="single">Single answer</Select.Item>
                <Select.Item value="multiple">Multiple answers</Select.Item>
              </Select.Content>
            </Select.Root>
          </Sheet.Content>
        </Sheet.Root>
      </OverlayBoundary>,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalled());
    const dialog = container.querySelector<HTMLDivElement>(".sc-sheet-content");
    if (!dialog) throw new Error("Expected the Sheet content element");
    const environment = onReady.mock.calls.at(-1)?.[0];
    if (!environment) throw new Error("Expected a ready Sheet overlay environment");
    const listbox = document.querySelector<HTMLElement>('[role="listbox"]');
    if (!listbox) throw new Error("Expected the Sheet Select listbox");
    const listboxWrapper = listbox.closest<HTMLElement>("[data-radix-popper-content-wrapper]");

    expect(forwardedContent).toBe(dialog);
    expect(environment.kind).toBe("contained");
    expect(environment.collisionBoundary).toBe(dialog);
    expect(environment.host.parentElement).toBe(dialog);
    expect(dialog.querySelector(":scope > [data-scaffold-overlay-host]")).toBe(environment.host);
    expect(listboxWrapper?.parentElement).toBe(environment.host);

    const nestedHost = environment.host;
    unmount();

    expect(nestedHost.isConnected).toBe(false);
    expect(container.querySelector("[data-scaffold-overlay-host]")).toBeNull();
  });

  it("closes before its parent and restores focus to its launcher", async () => {
    render(<NestedSheetExample />);

    await userEvent.click(screen.getByRole("button", { name: "Open workspace" }));
    const parentDialog = screen.getByRole("dialog", { name: "Workspace dialog" });
    const sheetTrigger = screen.getByRole("button", { name: "Open nested sheet" });

    await userEvent.click(sheetTrigger);

    const host = parentDialog.querySelector("[data-scaffold-overlay-host]");
    expect(host).not.toBeNull();
    expect(screen.getByRole("dialog", { name: "Nested sheet" }).parentElement).toBe(host);

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Nested sheet" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Workspace dialog" })).toBe(parentDialog);
    expect(parentDialog.parentElement).toBe(document.body);
    expect(document.activeElement).toBe(sheetTrigger);
  });
});
