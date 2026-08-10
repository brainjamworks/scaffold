import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";
import "@/editor/surfaces/authoring/views/AuthoringSurfaceView.css";
import "@/editor/surfaces/authoring/variants/page-default.css";
import "@/editor/surfaces/runtime/views/RuntimeSurfaceView.css";
import "@/editor/surfaces/view/variants/page-default.css";
import "@/runtime/players/page/PagePlayer.css";
import "./page.css";

afterEach(() => {
  document.body.replaceChildren();
});

describe("Scaffold Flow Page recipe", () => {
  it("restores the original resting authoring Page sheet without a second content gutter", () => {
    const populated = mountPage("authoring", 1200);
    const empty = mountPage("authoring", 1200);
    empty.surface.dataset.empty = "true";

    const frameStyle = getComputedStyle(populated.frame);
    const surfaceStyle = getComputedStyle(populated.surface);
    const contentStyle = getComputedStyle(populated.content);
    const expectedMinimumHeight = Math.min(1120, window.innerWidth * 1.41);

    expect(frameStyle.padding).toBe("0px");
    expect(frameStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(populated.surface.getBoundingClientRect().width).toBe(768);
    expect(Number.parseFloat(surfaceStyle.minHeight)).toBeCloseTo(expectedMinimumHeight, 1);
    expect(empty.surface.getBoundingClientRect().height).toBeCloseTo(expectedMinimumHeight, 1);
    expect(surfaceStyle.padding).toBe("32px");
    expect(surfaceStyle.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(surfaceStyle.borderTopWidth).toBe("1px");
    expect(surfaceStyle.borderRadius).toBe("8px");
    expect(surfaceStyle.boxShadow).toBe("none");
    expect(contentStyle.display).toBe("contents");
    expect(contentStyle.padding).toBe("0px");
  });

  it("keeps the default runtime Page transparent, borderless, and shadowless", () => {
    const { content, surface } = mountPage("runtime", 1200);
    const surfaceStyle = getComputedStyle(surface);
    const contentStyle = getComputedStyle(content);

    expect(surfaceStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(surfaceStyle.borderTopWidth).toBe("0px");
    expect(surfaceStyle.borderRadius).toBe("0px");
    expect(surfaceStyle.boxShadow).toBe("none");
    expect(surfaceStyle.padding).toBe("0px");
    expect(contentStyle.display).toBe("block");
    expect(Number.parseFloat(contentStyle.paddingTop)).toBeGreaterThan(0);
  });

  it("uses the semantic Page content wrapper as the only responsive runtime inset", () => {
    const wide = mountPage("runtime", 1200);
    const narrow = mountPage("runtime", 360);
    const wideContentInset = Number.parseFloat(getComputedStyle(wide.content).paddingTop);
    const narrowContentInset = Number.parseFloat(getComputedStyle(narrow.content).paddingTop);

    expect(getComputedStyle(wide.player!).padding).toBe("0px");
    expect(getComputedStyle(wide.frame).padding).toBe("0px");
    expect(getComputedStyle(wide.surface).padding).toBe("0px");
    expect(wideContentInset).toBeGreaterThan(narrowContentInset);
  });

  it.each(["authoring", "runtime"] as const)(
    "preserves an explicitly authored %s Page background",
    (renderer) => {
      const { surface } = mountPage(renderer, 1200);
      surface.style.backgroundColor = "#123456";

      expect(getComputedStyle(surface).backgroundColor).toBe("rgb(18, 52, 86)");
    },
  );

  it("owns Page header and footer rhythm in the Course recipe", () => {
    const { surface } = mountPage("runtime", 1200);
    const header = document.createElement("header");
    header.dataset.slot = "surface-header";
    const footer = document.createElement("footer");
    footer.dataset.slot = "surface-footer";
    surface.append(header, footer);

    expect(getComputedStyle(header).marginBlockEnd).toBe("24px");
    expect(getComputedStyle(footer).marginBlockStart).toBe("28px");
  });
});

function mountPage(
  renderer: "authoring" | "runtime",
  width: number,
): {
  content: HTMLElement;
  frame: HTMLElement;
  player: HTMLElement | null;
  surface: HTMLElement;
} {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  host.style.setProperty("--sc-app-color-canvas", "#fafafa");
  host.style.setProperty("--sc-app-color-border", "#e4e4e7");
  host.style.setProperty("--sc-app-color-focus-outline", "#161d77");
  host.style.setProperty("--sc-app-radius-surface", "8px");
  host.style.setProperty("--color-background", "#ffffff");
  host.style.setProperty("--color-border", "#e4e4e7");
  host.style.setProperty("--radius-md", "8px");
  host.style.setProperty("--sc-border-width", "1px");
  const course = document.createElement("div");
  course.className = "radix-themes light sc-course sc-course-theme-scaffold-flow-v1";
  course.dataset.hasBackground = "false";
  course.dataset.scaling = "100%";
  const frame = document.createElement("section");
  frame.className = `scaffold-${renderer}-surface-view`;
  frame.dataset.courseMode = "page";
  frame.dataset.overflowMode = "grow";
  frame.dataset.surfaceSize = "fluid";
  const surface = document.createElement("article");
  surface.className = `sc-page-default-surface-view sc-page-default-surface-${renderer}-view`;
  const content = document.createElement("div");
  content.dataset.nodeViewContent = "";
  content.dataset.surfaceContent = "";
  content.textContent = "Page content";
  surface.append(content);
  if (renderer === "runtime") {
    const rendererSurface = document.createElement("section");
    rendererSurface.className = "react-renderer node-surface sc-surface-runtime-node";
    rendererSurface.dataset.surface = "";
    rendererSurface.append(surface);
    frame.append(rendererSurface);
  } else {
    surface.dataset.surface = "";
    frame.append(surface);
  }

  let player: HTMLElement | null = null;
  if (renderer === "runtime") {
    player = document.createElement("div");
    player.className = "sc-page-player";
    const content = document.createElement("div");
    content.className = "sc-page-player__content";
    content.append(frame);
    player.append(content);
    course.append(player);
  } else {
    course.append(frame);
  }

  host.append(course);
  document.body.append(host);
  return { content, frame, player, surface };
}
