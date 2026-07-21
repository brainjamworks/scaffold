// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { OverlayBoundary } from "@/ui/components/OverlayBoundary/OverlayBoundary";
import * as Popover from "@/ui/components/Popover/Popover";
import {
  AUTHORING_CHROME_ATTR,
  AuthoringChromeKind,
} from "@/editor/interactions/dom/authoring-chrome";
import { zIndex } from "@/ui/overlays/z-index";

import { EditorFloatingPopover } from "./EditorFloatingPopover";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("EditorFloatingPopover", () => {
  it("preserves the editor-facing popover namespace", () => {
    expect(EditorFloatingPopover.Root).toBeDefined();
    expect(EditorFloatingPopover.Trigger).toBeDefined();
    expect(EditorFloatingPopover.Anchor).toBeDefined();
    expect(EditorFloatingPopover.Portal).toBeDefined();
    expect(EditorFloatingPopover.Content).toBeDefined();
    expect(EditorFloatingPopover.Close).toBeDefined();
    expect(EditorFloatingPopover.Arrow).toBeDefined();
  });

  it("delegates lifecycle and port parts to the owned Radix adapter", () => {
    expect(EditorFloatingPopover.Root).toBe(Popover.Root);
    expect(EditorFloatingPopover.Trigger).toBe(Popover.Trigger);
    expect(EditorFloatingPopover.Anchor).toBe(Popover.Anchor);
    expect(EditorFloatingPopover.Portal).toBe(Popover.Portal);
    expect(EditorFloatingPopover.Close).toBe(Popover.Close);
    expect(EditorFloatingPopover.Arrow).toBe(Popover.Arrow);
  });

  it("keeps owned editor content visible with authoring chrome and geometry", async () => {
    render(
      <EditorFloatingPopover.Root open>
        <EditorFloatingPopover.Trigger>Open popover</EditorFloatingPopover.Trigger>
        <EditorFloatingPopover.Portal>
          <EditorFloatingPopover.Content
            align="start"
            aria-label="Font size"
            authoringChrome
            className="editor-popover"
            side="bottom"
            sideOffset={8}
            style={{ minWidth: 240 }}
          >
            Font size controls
          </EditorFloatingPopover.Content>
        </EditorFloatingPopover.Portal>
      </EditorFloatingPopover.Root>,
    );

    const content = await screen.findByRole("dialog", { name: "Font size" });

    expect(content.getAttribute(AUTHORING_CHROME_ATTR)).toBe(AuthoringChromeKind.Popover);
    expect(content.classList).toContain("editor-popover");
    expect(content.classList).toContain("sc-overlay-positioned-content");
    expect(content.style.minWidth).toBe("240px");
    expect(content.style.getPropertyValue("--sc-overlay-available-inline-size")).toBe(
      "var(--radix-popover-content-available-width)",
    );
    expect(content.parentElement?.style.visibility).not.toBe("hidden");
    expect(content.parentElement?.style.pointerEvents).not.toBe("none");
  });

  it("defaults content to the named popover layer", async () => {
    render(
      <EditorFloatingPopover.Root open>
        <EditorFloatingPopover.Trigger>Open layered popover</EditorFloatingPopover.Trigger>
        <EditorFloatingPopover.Portal>
          <EditorFloatingPopover.Content aria-label="Layered popover">
            Layered content
          </EditorFloatingPopover.Content>
        </EditorFloatingPopover.Portal>
      </EditorFloatingPopover.Root>,
    );

    const content = await screen.findByRole("dialog", { name: "Layered popover" });

    expect(content.style.zIndex).toBe(String(zIndex.popover));
  });

  it("preserves an explicit caller layer override", async () => {
    render(
      <EditorFloatingPopover.Root open>
        <EditorFloatingPopover.Trigger>Open overridden popover</EditorFloatingPopover.Trigger>
        <EditorFloatingPopover.Portal>
          <EditorFloatingPopover.Content
            aria-label="Overridden popover"
            style={{ zIndex: zIndex.modalContent }}
          >
            Overridden content
          </EditorFloatingPopover.Content>
        </EditorFloatingPopover.Portal>
      </EditorFloatingPopover.Root>,
    );

    const content = await screen.findByRole("dialog", { name: "Overridden popover" });

    expect(content.style.zIndex).toBe(String(zIndex.modalContent));
  });

  it("preserves custom anchors and arrow composition", async () => {
    render(
      <EditorFloatingPopover.Root open>
        <EditorFloatingPopover.Anchor asChild>
          <div data-testid="custom-anchor">
            <EditorFloatingPopover.Trigger>Hotspot</EditorFloatingPopover.Trigger>
          </div>
        </EditorFloatingPopover.Anchor>
        <EditorFloatingPopover.Portal>
          <EditorFloatingPopover.Content aria-label="Hotspot editor">
            Hotspot controls
            <EditorFloatingPopover.Arrow data-testid="popover-arrow" />
          </EditorFloatingPopover.Content>
        </EditorFloatingPopover.Portal>
      </EditorFloatingPopover.Root>,
    );

    expect(screen.getByTestId("custom-anchor").querySelector("button")).not.toBeNull();
    expect(await screen.findByRole("dialog", { name: "Hotspot editor" })).not.toBeNull();
    expect(screen.getByTestId("popover-arrow").tagName).toBe("svg");
  });

  it("portals into the nearest ready scoped host", async () => {
    const outerContainer = document.createElement("div");
    const innerContainer = document.createElement("div");
    document.body.append(outerContainer, innerContainer);

    render(
      <OverlayBoundary container={outerContainer} kind="viewport">
        <OverlayBoundary container={innerContainer} kind="viewport">
          <EditorFloatingPopover.Root open>
            <EditorFloatingPopover.Trigger>Open scoped popover</EditorFloatingPopover.Trigger>
            <EditorFloatingPopover.Portal>
              <EditorFloatingPopover.Content>Scoped content</EditorFloatingPopover.Content>
            </EditorFloatingPopover.Portal>
          </EditorFloatingPopover.Root>
        </OverlayBoundary>
      </OverlayBoundary>,
    );

    const innerHost = innerContainer.querySelector(":scope > [data-scaffold-overlay-host]");
    expect(innerHost).not.toBeNull();
    expect(
      (await screen.findByText("Scoped content")).closest("[data-radix-popper-content-wrapper]")
        ?.parentElement,
    ).toBe(innerHost);
  });

  it("renders no popover content while the scoped host is pending", () => {
    render(
      <OverlayBoundary container={null} kind="viewport">
        <EditorFloatingPopover.Root open>
          <EditorFloatingPopover.Trigger>Open pending popover</EditorFloatingPopover.Trigger>
          <EditorFloatingPopover.Portal>
            <EditorFloatingPopover.Content>Pending content</EditorFloatingPopover.Content>
          </EditorFloatingPopover.Portal>
        </EditorFloatingPopover.Root>
      </OverlayBoundary>,
    );

    expect(screen.getByRole("button", { name: "Open pending popover" })).not.toBeNull();
    expect(screen.queryByText("Pending content")).toBeNull();
  });

  it("keeps a ready scoped host authoritative over an explicit destination", async () => {
    const scopedContainer = document.createElement("div");
    const explicitHost = document.createElement("div");
    document.body.append(scopedContainer, explicitHost);

    render(
      <OverlayBoundary container={scopedContainer} kind="viewport">
        <EditorFloatingPopover.Root open>
          <EditorFloatingPopover.Trigger>Open explicit popover</EditorFloatingPopover.Trigger>
          <EditorFloatingPopover.Portal container={explicitHost}>
            <EditorFloatingPopover.Content>Explicit content</EditorFloatingPopover.Content>
          </EditorFloatingPopover.Portal>
        </EditorFloatingPopover.Root>
      </OverlayBoundary>,
    );

    const scopedHost = scopedContainer.querySelector(":scope > [data-scaffold-overlay-host]");
    expect(scopedHost).not.toBeNull();
    expect(
      (await screen.findByText("Explicit content")).closest("[data-radix-popper-content-wrapper]")
        ?.parentElement,
    ).toBe(scopedHost);
    expect(explicitHost.childElementCount).toBe(0);
  });

  it("preserves the owned unscoped body portal fallback", async () => {
    render(
      <EditorFloatingPopover.Root open>
        <EditorFloatingPopover.Trigger>Open unscoped popover</EditorFloatingPopover.Trigger>
        <EditorFloatingPopover.Portal>
          <EditorFloatingPopover.Content>Unscoped content</EditorFloatingPopover.Content>
        </EditorFloatingPopover.Portal>
      </EditorFloatingPopover.Root>,
    );

    expect(
      (await screen.findByText("Unscoped content")).closest("[data-radix-popper-content-wrapper]")
        ?.parentElement,
    ).toBe(document.body);
  });

  it("delegates Escape, outside interaction, and focus restoration to Radix", async () => {
    function DismissProbe() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <EditorFloatingPopover.Root open={open} onOpenChange={setOpen}>
            <EditorFloatingPopover.Trigger>Toggle</EditorFloatingPopover.Trigger>
            <EditorFloatingPopover.Portal>
              <EditorFloatingPopover.Content>Dismissible content</EditorFloatingPopover.Content>
            </EditorFloatingPopover.Portal>
          </EditorFloatingPopover.Root>
          <button type="button">Outside</button>
        </>
      );
    }

    render(<DismissProbe />);
    const trigger = screen.getByRole("button", { name: "Toggle" });

    expect(await screen.findByText("Dismissible content")).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByText("Dismissible content")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    await userEvent.click(trigger);
    expect(await screen.findByText("Dismissible content")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Outside" }));
    await waitFor(() => expect(screen.queryByText("Dismissible content")).toBeNull());
  });

  it("honors focus callback cancellation", async () => {
    const onOpenAutoFocus = vi.fn((event: Event) => event.preventDefault());
    const onCloseAutoFocus = vi.fn((event: Event) => event.preventDefault());

    function FocusProbe() {
      const [open, setOpen] = useState(true);
      return (
        <EditorFloatingPopover.Root open={open} onOpenChange={setOpen}>
          <EditorFloatingPopover.Trigger>Toggle focus</EditorFloatingPopover.Trigger>
          <EditorFloatingPopover.Portal>
            <EditorFloatingPopover.Content
              onCloseAutoFocus={onCloseAutoFocus}
              onOpenAutoFocus={onOpenAutoFocus}
            >
              Focus content
            </EditorFloatingPopover.Content>
          </EditorFloatingPopover.Portal>
        </EditorFloatingPopover.Root>
      );
    }

    render(<FocusProbe />);
    expect(await screen.findByText("Focus content")).not.toBeNull();
    expect(onOpenAutoFocus).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Focus content")).toBeNull());
    expect(onCloseAutoFocus).toHaveBeenCalledTimes(1);
  });

  it("dismisses a nested child first and restores focus in sequence", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    render(<NestedPopoverProbe host={host} />);
    const parentTrigger = screen.getByRole("button", { name: "Open parent" });
    await userEvent.click(parentTrigger);
    const parent = (await screen.findByText("Parent content")).closest('[role="dialog"]');
    const childTrigger = screen.getByText("Open child");
    fireEvent.click(childTrigger);

    expect(await screen.findByText("Child content")).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByText("Child content")).toBeNull();
      expect(screen.getByText("Parent content").closest('[role="dialog"]')).toBe(parent);
      expect(document.activeElement).toBe(childTrigger);
    });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByText("Parent content")).toBeNull();
      expect(document.activeElement).toBe(parentTrigger);
    });
  });
});

function NestedPopoverProbe({ host }: { host: HTMLElement }) {
  const [parentOpen, setParentOpen] = useState(false);
  const [childOpen, setChildOpen] = useState(false);

  return (
    <OverlayBoundary container={host} kind="viewport">
      <EditorFloatingPopover.Root open={parentOpen} onOpenChange={setParentOpen}>
        <EditorFloatingPopover.Trigger>Open parent</EditorFloatingPopover.Trigger>
        <EditorFloatingPopover.Portal>
          <EditorFloatingPopover.Content aria-label="Parent popover">
            Parent content
            <EditorFloatingPopover.Root open={childOpen} onOpenChange={setChildOpen}>
              <EditorFloatingPopover.Trigger>Open child</EditorFloatingPopover.Trigger>
              <EditorFloatingPopover.Portal>
                <EditorFloatingPopover.Content aria-label="Child popover">
                  Child content
                </EditorFloatingPopover.Content>
              </EditorFloatingPopover.Portal>
            </EditorFloatingPopover.Root>
          </EditorFloatingPopover.Content>
        </EditorFloatingPopover.Portal>
      </EditorFloatingPopover.Root>
    </OverlayBoundary>
  );
}
