// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { EditorBottomPanel, type EditorBottomPanelProps } from "./EditorBottomPanel";

const TABS: EditorBottomPanelProps["tabs"] = [
  { id: "timeline", label: "Timeline", content: <div>Timeline content</div> },
  { id: "interactions", label: "Interactions", content: <div>Interactions content</div> },
];

function setup(activeTabId = "timeline", extra?: Partial<EditorBottomPanelProps>) {
  const onTabChange = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <EditorBottomPanel
      tabs={TABS}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      onClose={onClose}
      tabsLabel="Surface workspace"
      {...extra}
    />,
  );
  return { ...utils, onTabChange, onClose };
}

describe("EditorBottomPanel", () => {
  it("renders controlled tabs wired to a single tabpanel", () => {
    const { container } = setup();

    const tablist = screen.getByRole("tablist", { name: "Surface workspace" });
    const timelineTab = screen.getByRole("tab", { name: "Timeline" });
    const interactionsTab = screen.getByRole("tab", { name: "Interactions" });
    const tabpanel = screen.getByRole("tabpanel");

    expect(container.querySelector(".sc-editor-bottom-panel")).not.toBeNull();
    expect(timelineTab).toHaveAttribute("aria-selected", "true");
    expect(interactionsTab).toHaveAttribute("aria-selected", "false");
    expect(timelineTab.getAttribute("aria-controls")).toBe(tabpanel.id);
    expect(interactionsTab.getAttribute("aria-controls")).toBe(tabpanel.id);
    expect(tabpanel.getAttribute("aria-labelledby")).toBe(timelineTab.id);
    expect(tabpanel).toHaveTextContent("Timeline content");
    expect(screen.queryByText("Interactions content")).toBeNull();
  });

  it("requests tab changes without flipping selection itself", () => {
    const { onTabChange } = setup();

    fireEvent.click(screen.getByRole("tab", { name: "Interactions" }));

    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith("interactions");
    expect(screen.getByRole("tab", { name: "Interactions" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("tab", { name: "Timeline" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("requests close from the close button", () => {
    const { onClose } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Close workspace" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("requests close on Escape from inside the panel", () => {
    const { onClose } = setup();

    fireEvent.keyDown(screen.getByRole("tab", { name: "Timeline" }), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape already handled by an open dialog", () => {
    const { onClose } = setup();
    const tab = screen.getByRole("tab", { name: "Timeline" });
    tab.addEventListener("keydown", (event) => event.preventDefault());

    fireEvent.keyDown(tab, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("resizes and collapses from the keyboard", () => {
    const { container } = setup();
    const handle = screen.getByRole("separator", { name: "Resize bottom workspace" });
    const panel = container.querySelector<HTMLElement>(".sc-editor-bottom-panel");
    const workspaceScroll = screen.getByRole("region", { name: "Bottom workspace" });

    expect(panel?.style.getPropertyValue("--sc-editor-bottom-workspace-height")).toBe("240px");
    expect(handle).toHaveAttribute("aria-orientation", "horizontal");
    expect(handle).toHaveAttribute("aria-valuemin", "0");
    expect(handle).toHaveAttribute("aria-valuemax", "480");
    expect(handle).toHaveAttribute("aria-valuenow", "240");
    expect(handle).toHaveAttribute("aria-valuetext", "240 pixels, expanded");

    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(handle).toHaveAttribute("aria-valuenow", "256");
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(handle).toHaveAttribute("aria-valuenow", "240");

    fireEvent.keyDown(handle, { key: "Home" });
    expect(panel).toHaveAttribute("data-state", "collapsed");
    expect(handle).toHaveAttribute("aria-valuenow", "0");
    expect(handle).toHaveAttribute("aria-valuetext", "Collapsed");
    expect(workspaceScroll).toHaveAttribute("hidden");

    fireEvent.keyDown(handle, { key: "Enter" });
    expect(panel).toHaveAttribute("data-state", "expanded");
    expect(handle).toHaveAttribute("aria-valuenow", "240");
    expect(workspaceScroll).not.toHaveAttribute("hidden");

    fireEvent.keyDown(handle, { key: "End" });
    expect(handle).toHaveAttribute("aria-valuenow", "480");
  });

  it("clamps pointer resizing without moving focus", () => {
    const { container } = setup();
    const focusTarget = screen.getByRole("tab", { name: "Timeline" });
    const handle = screen.getByRole("separator", {
      name: "Resize bottom workspace",
    }) as HTMLButtonElement;
    const panel = container.querySelector<HTMLElement>(".sc-editor-bottom-panel");
    const releasePointerCapture = vi.fn();
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = releasePointerCapture;
    focusTarget.focus();

    fireEvent.pointerDown(handle, { button: 0, clientY: 400, pointerId: 7 });
    fireEvent.pointerMove(handle, { clientY: 350, pointerId: 7 });

    expect(document.activeElement).toBe(focusTarget);
    expect(handle).toHaveAttribute("aria-valuenow", "290");
    expect(panel?.style.getPropertyValue("--sc-editor-bottom-workspace-height")).toBe("290px");

    fireEvent.pointerMove(handle, { clientY: -1000, pointerId: 7 });
    expect(handle).toHaveAttribute("aria-valuenow", "480");
    fireEvent.pointerMove(handle, { clientY: 2000, pointerId: 7 });
    expect(handle).toHaveAttribute("aria-valuenow", "160");

    fireEvent.pointerUp(handle, { pointerId: 7 });
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
  });
});
