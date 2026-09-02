import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import { EditorShell } from "./EditorShell";

describe("EditorShell rail geometry", () => {
  it.each([
    ["narrow", 760],
    ["standard", 1200],
    ["enlarged", 1600],
  ] as const)("keeps the bottom workspace between independent docks at %s width", (_, width) => {
    const host = document.createElement("div");
    host.style.width = `${width}px`;
    host.style.height = "720px";
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
            bottomWorkspace={<section>Timeline workspace</section>}
          />,
        );
      });

      const stageColumn = host.querySelector<HTMLElement>(".sc-editor-stage-column");
      const stage = host.querySelector<HTMLElement>(".sc-editor-stage");
      const workspace = host.querySelector<HTMLElement>(".sc-editor-bottom-workspace");
      const workspaceScroll = host.querySelector<HTMLElement>(".sc-editor-bottom-workspace-scroll");
      const leftDock = host.querySelector<HTMLElement>('.sc-editor-dock-slot[data-side="left"]');
      const rightDock = host.querySelector<HTMLElement>('.sc-editor-dock-slot[data-side="right"]');
      if (!stageColumn || !stage || !workspace || !workspaceScroll || !leftDock || !rightDock) {
        throw new Error("Expected the shell, Stage, workspace, and both docks.");
      }

      const stageColumnRect = stageColumn.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const workspaceRect = workspace.getBoundingClientRect();
      const leftDockRect = leftDock.getBoundingClientRect();
      const rightDockRect = rightDock.getBoundingClientRect();

      expect(workspaceRect.left).toBeCloseTo(stageColumnRect.left, 5);
      expect(workspaceRect.right).toBeCloseTo(stageColumnRect.right, 5);
      expect(workspaceRect.left).toBeCloseTo(stageRect.left, 5);
      expect(workspaceRect.right).toBeCloseTo(stageRect.right, 5);
      expect(leftDockRect.right).toBeLessThanOrEqual(workspaceRect.left);
      expect(workspaceRect.right).toBeLessThanOrEqual(rightDockRect.left);
      expect(workspaceRect.top).toBeGreaterThanOrEqual(stageRect.bottom);
      expect(getComputedStyle(workspace).overflowY).toBe("hidden");
      expect(getComputedStyle(workspaceScroll).overflowY).toBe("auto");
      expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
      expect(host.scrollHeight).toBe(scrollHeightWithoutWorkspace);
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
            bottomWorkspace={<section>Timeline workspace</section>}
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
            bottomWorkspace={<section>Timeline workspace</section>}
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
});
