// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

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
  it("places an optional bottom workspace slot below the centre row", () => {
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
    const centre = container.querySelector(".sc-editor-centre");
    const row = container.querySelector(".sc-editor-centre-row");
    const slot = container.querySelector(".sc-editor-bottom-panel-slot");
    const docks = container.querySelectorAll(".sc-editor-dock-slot");

    expect(stageColumn?.firstElementChild).toBe(stage);
    expect(stageColumn?.parentElement).toBe(row);
    expect(slot?.parentElement).toBe(centre);
    expect(row?.nextElementSibling).toBe(slot);
    expect(slot).toHaveTextContent("Timeline workspace");
    expect(slot?.querySelector("section")).toHaveTextContent("Timeline workspace");
    expect(docks[0]?.nextElementSibling).toBe(centre);
    expect(centre?.nextElementSibling).toBe(docks[1]);
  });

  it("keeps the bottom workspace absent when no slot content is provided", () => {
    const { container } = render(<EditorShell stage={<main>Stage</main>} />);

    expect(container.querySelector(".sc-editor-bottom-panel-slot")).toBeNull();
  });

  it("wraps rails and stage in a two-row centre column so the bottom workspace spans them", () => {
    const { container } = render(
      <EditorShell
        dock={<aside>Agent</aside>}
        leftNavigatorDock={<aside>Document Outline</aside>}
        leftRail={<div>Left tools</div>}
        rightRail={<div>Right tools</div>}
        stage={<main>Stage</main>}
        bottomWorkspace={<section>Timeline workspace</section>}
      />,
    );

    const shell = container.querySelector<HTMLElement>(".sc-editor-shell");
    const centre = container.querySelector<HTMLElement>(".sc-editor-centre");
    const row = container.querySelector(".sc-editor-centre-row");
    const stageColumn = container.querySelector(".sc-editor-stage-column");
    const slot = container.querySelector(".sc-editor-bottom-panel-slot");

    expect(centre).not.toBeNull();
    expect(row).not.toBeNull();
    expect(slot).not.toBeNull();
    expect(centre?.parentElement).toBe(shell);
    expect(row?.parentElement).toBe(centre);
    expect(stageColumn?.parentElement).toBe(row);
    expect(row?.nextElementSibling).toBe(slot);
    expect(centre?.lastElementChild).toBe(slot);
    expect(row?.querySelectorAll(".sc-editor-rail-slot")).toHaveLength(2);
    const shellDocks = shell
      ? Array.from(shell.children).filter((child) =>
          child.classList.contains("sc-editor-dock-slot"),
        )
      : [];
    expect(shellDocks).toHaveLength(2);
    expect(shell?.firstElementChild).toBe(shellDocks[0]);
    expect(shell?.lastElementChild).toBe(shellDocks[1]);
  });

  it("keeps the centre column when no bottom workspace is provided", () => {
    const { container } = render(<EditorShell stage={<main>Stage</main>} />);

    expect(container.querySelector(".sc-editor-centre")).not.toBeNull();
    expect(container.querySelector(".sc-editor-bottom-panel")).toBeNull();
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
