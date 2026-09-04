import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import { EditorBottomPanel } from "./EditorBottomPanel";
import { EditorShell } from "./EditorShell";

function timelinePanel() {
  return (
    <EditorBottomPanel
      tabsLabel="Surface workspace"
      tabs={[{ id: "timeline", label: "Timeline", content: <section>Timeline workspace</section> }]}
      activeTabId="timeline"
      onTabChange={() => undefined}
      onClose={() => undefined}
    />
  );
}

describe("EditorShell rail geometry", () => {
  it.each([
    ["narrow", 760],
    ["standard", 1200],
    ["enlarged", 1600],
  ] as const)("keeps the bottom workspace between independent docks at %s width", (_, width) => {
    const host = document.createElement("div");
    host.style.width = `${width}px`;
    // Fill the viewport minus the app header, like the production shell, so the
    // viewport-sized rail boxes line up exactly with the row above the bar.
    host.style.height = "calc(100dvh - 53px)";
    document.body.append(host);
    const root = createRoot(host);

    try {
      flushSync(() => {
        root.render(
          <EditorShell
            leftNavigatorDock={<aside style={{ width: 180 }}>Document Outline</aside>}
            leftRail={<div>Left tools</div>}
            rightRail={<div>Right tools</div>}
            dock={<aside style={{ width: 220 }}>Agent</aside>}
            stage={<main>Stage</main>}
          />,
        );
      });
      const scrollHeightWithoutWorkspace = host.scrollHeight;

      flushSync(() => {
        root.render(
          <EditorShell
            leftNavigatorDock={<aside style={{ width: 180 }}>Document Outline</aside>}
            leftRail={<div>Left tools</div>}
            rightRail={<div>Right tools</div>}
            dock={<aside style={{ width: 220 }}>Agent</aside>}
            stage={<main>Stage</main>}
            bottomWorkspace={timelinePanel()}
          />,
        );
      });

      const centre = host.querySelector<HTMLElement>(".sc-editor-centre");
      const stageColumn = host.querySelector<HTMLElement>(".sc-editor-stage-column");
      const stage = host.querySelector<HTMLElement>(".sc-editor-stage");
      const workspace = host.querySelector<HTMLElement>(".sc-editor-bottom-workspace");
      const workspaceScroll = host.querySelector<HTMLElement>(".sc-editor-bottom-workspace-scroll");
      const leftDock = host.querySelector<HTMLElement>('.sc-editor-dock-slot[data-side="left"]');
      const rightDock = host.querySelector<HTMLElement>('.sc-editor-dock-slot[data-side="right"]');
      if (
        !centre ||
        !stageColumn ||
        !stage ||
        !workspace ||
        !workspaceScroll ||
        !leftDock ||
        !rightDock
      ) {
        throw new Error("Expected the shell, Stage, workspace, and both docks.");
      }

      const centreRect = centre.getBoundingClientRect();
      const stageColumnRect = stageColumn.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const workspaceRect = workspace.getBoundingClientRect();
      const leftDockRect = leftDock.getBoundingClientRect();
      const rightDockRect = rightDock.getBoundingClientRect();

      expect(workspaceRect.left).toBeCloseTo(centreRect.left, 5);
      expect(workspaceRect.right).toBeCloseTo(centreRect.right, 5);
      expect(stageRect.left).toBeCloseTo(stageColumnRect.left, 5);
      expect(stageRect.right).toBeCloseTo(stageColumnRect.right, 5);
      expect(leftDockRect.right).toBeLessThanOrEqual(workspaceRect.left);
      expect(workspaceRect.right).toBeLessThanOrEqual(rightDockRect.left);
      expect(workspaceRect.top).toBeGreaterThanOrEqual(stageRect.bottom);
      expect(getComputedStyle(workspace).overflowY).toBe("hidden");
      expect(getComputedStyle(workspaceScroll).overflowY).toBe("auto");
      expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
      expect(host.scrollHeight).toBe(scrollHeightWithoutWorkspace);

      const shell = host.querySelector<HTMLElement>(".sc-editor-shell");
      const leftRailSlot = host.querySelector<HTMLElement>(
        '.sc-editor-rail-slot[data-side="left"]',
      );
      const rightRailSlot = host.querySelector<HTMLElement>(
        '.sc-editor-rail-slot[data-side="right"]',
      );
      const leftRail = host.querySelector<HTMLElement>('.sc-editor-rail[data-side="left"]');
      const rightRail = host.querySelector<HTMLElement>('.sc-editor-rail[data-side="right"]');
      const leftPill = host.querySelector<HTMLElement>(
        '.sc-editor-rail[data-side="left"] .sc-editor-rail-frame',
      );
      const rightPill = host.querySelector<HTMLElement>(
        '.sc-editor-rail[data-side="right"] .sc-editor-rail-frame',
      );
      if (
        !shell ||
        !leftRailSlot ||
        !rightRailSlot ||
        !leftRail ||
        !rightRail ||
        !leftPill ||
        !rightPill
      ) {
        throw new Error("Expected the shell, both rail slots, both rails, and both pills.");
      }

      const shellRect = shell.getBoundingClientRect();
      const leftRailSlotRect = leftRailSlot.getBoundingClientRect();
      const rightRailSlotRect = rightRailSlot.getBoundingClientRect();

      // The bar spans rails + stage: its edges reach past both rail slots.
      expect(workspaceRect.left).toBeLessThanOrEqual(leftRailSlotRect.left);
      expect(workspaceRect.right).toBeGreaterThanOrEqual(rightRailSlotRect.right);

      // Both docks stay full height, from shell top to shell bottom.
      for (const dockRect of [leftDockRect, rightDockRect]) {
        expect(Math.abs(dockRect.top - shellRect.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(dockRect.bottom - shellRect.bottom)).toBeLessThanOrEqual(1);
      }

      // Each rail pill sits centred in the space above the bar …
      const midpointY = (stageRect.top + workspaceRect.top) / 2;
      for (const pill of [leftPill, rightPill]) {
        const pillRect = pill.getBoundingClientRect();
        expect(Math.abs((pillRect.top + pillRect.bottom) / 2 - midpointY)).toBeLessThanOrEqual(
          2,
        );
      }

      // … and no rail box overlaps the bar.
      for (const rail of [leftRail, rightRail]) {
        expect(rail.getBoundingClientRect().bottom).toBeLessThanOrEqual(workspaceRect.top + 1);
      }
    } finally {
      flushSync(() => root.unmount());
      host.remove();
    }
  });

  it("keeps a usable Stage when keyboard resizing reaches the maximum in a short shell", () => {
    const host = document.createElement("div");
    host.style.width = "900px";
    host.style.height = "360px";
    document.body.append(host);
    const root = createRoot(host);

    try {
      flushSync(() => {
        root.render(
          <EditorShell
            stage={<main>Stage</main>}
            bottomWorkspace={timelinePanel()}
          />,
        );
      });
      const handle = host.querySelector<HTMLButtonElement>(
        ".sc-editor-bottom-workspace-resize-handle",
      );
      const stage = host.querySelector<HTMLElement>(".sc-editor-stage");
      const workspace = host.querySelector<HTMLElement>(".sc-editor-bottom-workspace");
      if (!handle || !stage || !workspace) throw new Error("Expected short shell workspace.");
      flushSync(() => {
        handle.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
      });

      expect(workspace.getBoundingClientRect().height).toBeLessThanOrEqual(200);
      expect(stage.getBoundingClientRect().height).toBeGreaterThanOrEqual(160);
      expect(handle).toHaveAttribute("aria-valuemax", "200");
      expect(handle).toHaveAttribute("aria-valuenow", "200");
      expect(host.scrollHeight).toBeLessThanOrEqual(host.clientHeight);

      flushSync(() => {
        handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      });
      expect(handle).toHaveAttribute("aria-valuenow", "184");
      expect(stage.getBoundingClientRect().height).toBeGreaterThanOrEqual(176);
    } finally {
      flushSync(() => root.unmount());
      host.remove();
    }
  });

  it("keeps a usable Stage when pointer resizing reaches the maximum in a short shell", () => {
    const host = document.createElement("div");
    host.style.width = "900px";
    host.style.height = "360px";
    document.body.append(host);
    const root = createRoot(host);

    try {
      flushSync(() => {
        root.render(
          <EditorShell
            stage={<main>Stage</main>}
            bottomWorkspace={timelinePanel()}
          />,
        );
      });
      const handle = host.querySelector<HTMLButtonElement>(
        ".sc-editor-bottom-workspace-resize-handle",
      );
      const stage = host.querySelector<HTMLElement>(".sc-editor-stage");
      const workspace = host.querySelector<HTMLElement>(".sc-editor-bottom-workspace");
      if (!handle || !stage || !workspace) throw new Error("Expected short shell workspace.");
      handle.setPointerCapture = () => undefined;

      flushSync(() => {
        handle.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            button: 0,
            clientY: 300,
            pointerId: 7,
          }),
        );
        handle.dispatchEvent(
          new PointerEvent("pointermove", { bubbles: true, clientY: -1_000, pointerId: 7 }),
        );
      });

      expect(workspace.getBoundingClientRect().height).toBeLessThanOrEqual(200);
      expect(stage.getBoundingClientRect().height).toBeGreaterThanOrEqual(160);
      expect(handle).toHaveAttribute("aria-valuemax", "200");
      expect(handle).toHaveAttribute("aria-valuenow", "200");
      expect(host.scrollHeight).toBeLessThanOrEqual(host.clientHeight);
    } finally {
      flushSync(() => root.unmount());
      host.remove();
    }
  });

  it("keeps the stage fixed while reserved rail content becomes ready", () => {
    const host = document.createElement("div");
    host.style.width = "800px";
    document.body.append(host);
    const root = createRoot(host);

    try {
      flushSync(() => {
        root.render(
          <EditorShell
            reserveLeftRail
            reserveRightRail
            stage={<main data-testid="stage">Stage</main>}
          />,
        );
      });

      const stage = host.querySelector<HTMLElement>(".sc-editor-stage");
      if (!stage) throw new Error("Expected the editor stage.");
      const before = stage.getBoundingClientRect();

      expect(host.querySelectorAll(".sc-editor-rail-slot")).toHaveLength(2);
      expect(host.querySelectorAll(".sc-editor-rail-viewport")).toHaveLength(0);

      flushSync(() => {
        root.render(
          <EditorShell
            reserveLeftRail
            reserveRightRail
            leftRail={<div>Left tools</div>}
            rightRail={<div>Right tools</div>}
            stage={<main data-testid="stage">Stage</main>}
          />,
        );
      });

      const after = stage.getBoundingClientRect();

      expect(host.querySelectorAll(".sc-editor-rail-viewport")).toHaveLength(2);
      expect(after.left).toBeCloseTo(before.left, 5);
      expect(after.width).toBeCloseTo(before.width, 5);
    } finally {
      flushSync(() => root.unmount());
      host.remove();
    }
  });

  it("pins the bottom workspace to the viewport bottom while the page scrolls", () => {
    const host = document.createElement("div");
    host.style.width = "1200px";
    document.body.append(host);
    const root = createRoot(host);
    const previousScrollY = window.scrollY;

    try {
      flushSync(() => {
        root.render(
          <EditorShell
            scrollModel="page"
            stage={<main style={{ height: 3000 }}>Stage</main>}
            bottomWorkspace={timelinePanel()}
          />,
        );
      });
      const workspace = host.querySelector<HTMLElement>(".sc-editor-bottom-workspace");
      if (!workspace) throw new Error("Expected the bottom workspace.");

      window.scrollTo(0, 800);
      const workspaceRect = workspace.getBoundingClientRect();

      expect(Math.abs(workspaceRect.bottom - window.innerHeight)).toBeLessThanOrEqual(1);
    } finally {
      window.scrollTo(0, previousScrollY);
      flushSync(() => root.unmount());
      host.remove();
    }
  });
});
