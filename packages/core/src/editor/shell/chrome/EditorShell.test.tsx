// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { EditorShell } from "./EditorShell";

function setScrollMetrics(
  element: HTMLElement,
  metrics: { clientHeight: number; scrollHeight: number },
) {
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    value: metrics.clientHeight,
  });
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    value: metrics.scrollHeight,
  });
}

describe("EditorShell", () => {
  it("places an optional bottom workspace below the Surface viewport in the Stage column", () => {
    const { container } = render(
      <EditorShell
        dock={<aside>Agent</aside>}
        leftNavigatorDock={<aside>Document Outline</aside>}
        stage={<main>Stage</main>}
        bottomWorkspace={<section>Timeline workspace</section>}
      />,
    );

    const stageColumn = container.querySelector(".sc-editor-stage-column");
    const stage = container.querySelector(".sc-editor-stage");
    const workspace = container.querySelector(".sc-editor-bottom-workspace");
    const workspaceScroll = screen.getByRole("region", { name: "Bottom workspace" });
    const docks = container.querySelectorAll(".sc-editor-dock-slot");

    expect(stageColumn?.firstElementChild).toBe(stage);
    expect(stageColumn?.lastElementChild).toBe(workspace);
    expect(workspaceScroll).toHaveTextContent("Timeline workspace");
    expect(container.querySelectorAll(".sc-editor-bottom-workspace-scroll")).toHaveLength(1);
    expect(docks[0]?.nextElementSibling).toBe(stageColumn);
    expect(stageColumn?.nextElementSibling).toBe(docks[1]);
  });

  it("keeps the bottom workspace absent when no slot content is provided", () => {
    const { container } = render(<EditorShell stage={<main>Stage</main>} />);

    expect(container.querySelector(".sc-editor-bottom-workspace")).toBeNull();
  });

  it("resizes and collapses the bottom workspace from the keyboard", () => {
    const { container } = render(
      <EditorShell
        stage={<button type="button">Stage focus target</button>}
        bottomWorkspace={<section>Timeline workspace</section>}
      />,
    );
    const handle = screen.getByRole("separator", { name: "Resize bottom workspace" });
    const workspace = container.querySelector<HTMLElement>(".sc-editor-bottom-workspace");
    const workspaceScroll = screen.getByRole("region", { name: "Bottom workspace" });

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
    expect(workspace).toHaveAttribute("data-state", "collapsed");
    expect(handle).toHaveAttribute("aria-valuenow", "0");
    expect(handle).toHaveAttribute("aria-valuetext", "Collapsed");
    expect(workspaceScroll).toHaveAttribute("hidden");

    fireEvent.keyDown(handle, { key: "Enter" });
    expect(workspace).toHaveAttribute("data-state", "expanded");
    expect(handle).toHaveAttribute("aria-valuenow", "240");
    expect(workspaceScroll).not.toHaveAttribute("hidden");

    fireEvent.keyDown(handle, { key: "End" });
    expect(handle).toHaveAttribute("aria-valuenow", "480");
  });

  it("clamps pointer resizing without moving ordinary Stage focus", () => {
    const { container } = render(
      <EditorShell
        stage={<button type="button">Stage focus target</button>}
        bottomWorkspace={<section>Timeline workspace</section>}
      />,
    );
    const stageFocusTarget = screen.getByRole("button", { name: "Stage focus target" });
    const handle = screen.getByRole("separator", {
      name: "Resize bottom workspace",
    }) as HTMLButtonElement;
    const workspace = container.querySelector<HTMLElement>(".sc-editor-bottom-workspace");
    const releasePointerCapture = vi.fn();
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = releasePointerCapture;
    stageFocusTarget.focus();

    fireEvent.pointerDown(handle, { button: 0, clientY: 400, pointerId: 7 });
    fireEvent.pointerMove(handle, { clientY: 350, pointerId: 7 });

    expect(document.activeElement).toBe(stageFocusTarget);
    expect(handle).toHaveAttribute("aria-valuenow", "290");
    expect(workspace?.style.getPropertyValue("--sc-editor-bottom-workspace-height")).toBe("290px");

    fireEvent.pointerMove(handle, { clientY: -1000, pointerId: 7 });
    expect(handle).toHaveAttribute("aria-valuenow", "480");
    fireEvent.pointerMove(handle, { clientY: 2000, pointerId: 7 });
    expect(handle).toHaveAttribute("aria-valuenow", "160");

    fireEvent.pointerUp(handle, { pointerId: 7 });
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it("places a wide navigator dock on the left while preserving the wide right dock", () => {
    const { container } = render(
      <EditorShell
        dock={<aside>Agent</aside>}
        leftNavigatorDock={<aside>Document Outline</aside>}
        stage={<main>Stage</main>}
      />,
    );

    const shell = container.querySelector(".sc-editor-shell");
    const docks = container.querySelectorAll(".sc-editor-dock-slot");
    expect(docks).toHaveLength(2);
    expect(docks[0]).toHaveAttribute("data-side", "left");
    expect(docks[0]).toHaveTextContent("Document Outline");
    expect(docks[1]).toHaveAttribute("data-side", "right");
    expect(docks[1]).toHaveTextContent("Agent");
    expect(shell?.firstElementChild).toBe(docks[0]);
    expect(shell?.lastElementChild).toBe(docks[1]);
  });

  it("wraps both rails in labelled bounded scroll regions", () => {
    const { container } = render(
      <EditorShell
        stage={<main>Stage</main>}
        leftRail={<div>Left rail</div>}
        rightRail={<div>Right rail</div>}
      />,
    );

    expect(screen.getByRole("region", { name: "Editor tools" }).textContent).toBe("Left rail");
    expect(screen.getByRole("region", { name: "Insert tools" }).textContent).toBe("Right rail");
    expect(container.querySelector('.sc-editor-rail-viewport[data-side="left"]')).not.toBeNull();
    expect(container.querySelector('.sc-editor-rail-viewport[data-side="right"]')).not.toBeNull();
    expect(container.querySelector(".sc-editor-shell")?.getAttribute("data-scroll-model")).toBe(
      "page",
    );
  });

  it("marks contained-scroll shells explicitly", () => {
    const { container } = render(
      <EditorShell
        scrollModel="contained"
        stage={<main>Stage</main>}
        leftRail={<div>Left rail</div>}
      />,
    );

    expect(container.querySelector(".sc-editor-shell")?.getAttribute("data-scroll-model")).toBe(
      "contained",
    );
  });

  it("enables rail scroll affordances when the rail overflows", async () => {
    const { container } = render(
      <EditorShell
        stage={<main>Stage</main>}
        leftRail={<div style={{ height: 600 }}>Left rail</div>}
      />,
    );
    const viewport = container.querySelector<HTMLElement>(
      '.sc-editor-rail-viewport[data-side="left"]',
    );
    const scrollport = screen.getByRole("region", {
      name: "Editor tools",
    }) as HTMLElement;
    const scrollUp = screen.getByRole("button", {
      hidden: true,
      name: "Scroll editor tools up",
    });
    const scrollDown = screen.getByRole("button", {
      hidden: true,
      name: "Scroll editor tools down",
    });

    if (!viewport) throw new Error("left rail viewport did not render");

    expect(viewport.getAttribute("data-overflow")).toBe("false");
    expect(scrollUp.hasAttribute("disabled")).toBe(true);
    expect(scrollDown.hasAttribute("disabled")).toBe(true);

    setScrollMetrics(scrollport, { clientHeight: 200, scrollHeight: 600 });
    window.dispatchEvent(new Event("resize"));

    await waitFor(() => {
      expect(viewport.getAttribute("data-overflow")).toBe("true");
      expect(scrollport.hasAttribute("tabindex")).toBe(false);
      expect(scrollUp.hasAttribute("disabled")).toBe(false);
      expect(scrollDown.hasAttribute("disabled")).toBe(false);
    });

    scrollport.scrollTop = 400;
    fireEvent.scroll(scrollport);

    expect(scrollUp.hasAttribute("disabled")).toBe(false);
    expect(scrollDown.hasAttribute("disabled")).toBe(false);
    await waitFor(() => {
      expect(viewport.getAttribute("data-overflow")).toBe("true");
      expect(scrollUp.hasAttribute("disabled")).toBe(false);
      expect(scrollDown.hasAttribute("disabled")).toBe(false);
    });
  });
});
