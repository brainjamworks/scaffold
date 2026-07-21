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
