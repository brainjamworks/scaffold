// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { createElement, useContext } from "react";
import { createPortal } from "react-dom";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  BottomPanelSlotsContext,
  EditorBottomPanel,
  type EditorBottomPanelProps,
} from "./EditorBottomPanel";

function SlotProbe({ marker, alert }: { marker: string; alert?: string }) {
  const slots = useContext(BottomPanelSlotsContext);
  if (!slots) return createElement("span", null, `${marker} standalone`);
  return createElement(
    "span",
    null,
    slots.headerActions
      ? createPortal(createElement("span", null, marker), slots.headerActions)
      : null,
    alert && slots.status
      ? createPortal(createElement("p", { role: "alert" }, alert), slots.status)
      : null,
  );
}

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

  it("portals the active tab's content into the header actions slot", () => {
    render(
      <EditorBottomPanel
        tabs={[
          {
            id: "timeline",
            label: "Timeline",
            content: <SlotProbe marker="timeline marker" />,
          },
          {
            id: "interactions",
            label: "Interactions",
            content: <SlotProbe marker="interactions marker" />,
          },
        ]}
        activeTabId="interactions"
        onTabChange={vi.fn()}
        onClose={vi.fn()}
        tabsLabel="Surface workspace"
      />,
    );

    const actions = document.querySelector(".sc-editor-bottom-panel-header-actions");
    expect(actions).toHaveTextContent("interactions marker");
    expect(actions).not.toHaveTextContent("timeline marker");
    expect(actions).not.toHaveTextContent("standalone");
  });

  it("portals transient alerts into the status slot and leaves it empty when unused", () => {
    const { rerender } = render(
      <EditorBottomPanel
        tabs={[
          {
            id: "timeline",
            label: "Timeline",
            content: <SlotProbe marker="timeline marker" alert="Timeline broke" />,
          },
        ]}
        activeTabId="timeline"
        onTabChange={vi.fn()}
        onClose={vi.fn()}
        tabsLabel="Surface workspace"
      />,
    );
    const status = document.querySelector(".sc-editor-bottom-panel-status");

    expect(status).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Timeline broke");
    expect(status).toContainElement(screen.getByRole("alert"));

    rerender(
      <EditorBottomPanel
        tabs={[
          {
            id: "timeline",
            label: "Timeline",
            content: <SlotProbe marker="timeline marker" />,
          },
        ]}
        activeTabId="timeline"
        onTabChange={vi.fn()}
        onClose={vi.fn()}
        tabsLabel="Surface workspace"
      />,
    );
    expect(status).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).toBeNull();
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

  it("restores the stored height on mount and falls back when invalid", () => {
    window.sessionStorage.setItem("test-bottom-height", "300");
    const first = setup("timeline", { heightStorageKey: "test-bottom-height" });
    expect(
      first.container
        .querySelector<HTMLElement>(".sc-editor-bottom-panel")
        ?.style.getPropertyValue("--sc-editor-bottom-workspace-height"),
    ).toBe("300px");
    first.unmount();
    window.sessionStorage.removeItem("test-bottom-height");

    window.sessionStorage.setItem("test-bottom-height-bad", "tall");
    const second = setup("timeline", { heightStorageKey: "test-bottom-height-bad" });
    expect(
      second.container
        .querySelector<HTMLElement>(".sc-editor-bottom-panel")
        ?.style.getPropertyValue("--sc-editor-bottom-workspace-height"),
    ).toBe("240px");
    second.unmount();
    window.sessionStorage.removeItem("test-bottom-height-bad");
  });

  it("persists keyboard resizes, pointer resizes and collapse toggles", () => {
    const key = "test-bottom-height-write";
    const { container } = setup("timeline", { heightStorageKey: key });
    const handle = screen.getByRole("separator", {
      name: "Resize bottom workspace",
    }) as HTMLButtonElement;
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();

    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(window.sessionStorage.getItem(key)).toBe("256");

    fireEvent.keyDown(handle, { key: "Home" });
    expect(window.sessionStorage.getItem(key)).toBe("256");

    fireEvent.keyDown(handle, { key: "End" });
    expect(window.sessionStorage.getItem(key)).toBe("480");

    fireEvent.pointerDown(handle, { button: 0, clientY: 400, pointerId: 7 });
    fireEvent.pointerMove(handle, { clientY: 500, pointerId: 7 });
    fireEvent.pointerUp(handle, { pointerId: 7 });
    expect(window.sessionStorage.getItem(key)).toBe("380");

    window.sessionStorage.removeItem(key);
  });

  it("ignores throwing storage", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => undefined,
    });
    const { container } = setup("timeline", { heightStorageKey: "test-bottom-height-throw" });
    const panel = container.querySelector<HTMLElement>(".sc-editor-bottom-panel");
    const handle = screen.getByRole("separator", { name: "Resize bottom workspace" });

    expect(panel?.style.getPropertyValue("--sc-editor-bottom-workspace-height")).toBe("240px");
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(panel?.style.getPropertyValue("--sc-editor-bottom-workspace-height")).toBe("256px");
    vi.unstubAllGlobals();
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
