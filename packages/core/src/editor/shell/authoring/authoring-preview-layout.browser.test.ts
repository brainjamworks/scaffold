import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";
import "./ScaffoldAuthoringApp.css";
import "@/runtime/players/slideshow/SlideshowPlayer.css";

afterEach(() => {
  document.body.replaceChildren();
});

describe("Authoring preview layout", () => {
  it("fills the contained Slideshow height chain without stretching Page preview", () => {
    const slideshow = mountPreviewHeightChain("slideshow");

    expect(slideshow.host.getBoundingClientRect().height).toBe(360);
    expect(slideshow.course.getBoundingClientRect().height).toBe(360);
    expect(slideshow.player.getBoundingClientRect().height).toBe(360);
    expect(getComputedStyle(slideshow.player).minHeight).toBe("0px");

    slideshow.workspace.remove();

    const page = mountPreviewHeightChain("page");

    expect(page.host.getBoundingClientRect().height).toBe(48);
    expect(page.course.getBoundingClientRect().height).toBe(48);
    expect(page.player.getBoundingClientRect().height).toBe(48);
  });
});

function mountPreviewHeightChain(mode: "page" | "slideshow"): {
  workspace: HTMLElement;
  host: HTMLElement;
  course: HTMLElement;
  player: HTMLElement;
} {
  const workspace = document.createElement("main");
  workspace.className = "sc-scaffold-authoring-workspace";
  workspace.dataset.previewMode = mode;
  workspace.style.width = "640px";
  workspace.style.height = "360px";

  const host = document.createElement("div");
  host.className = "sc-content-runtime-host";

  const course = document.createElement("div");
  course.className = "sc-course";

  const player = document.createElement("div");
  if (mode === "slideshow") {
    player.className = "sc-slideshow-player";
    player.dataset.slideshowSizing = "contained";
  } else {
    player.style.height = "48px";
  }

  course.append(player);
  host.append(course);
  workspace.append(host);
  document.body.append(workspace);

  return { workspace, host, course, player };
}
