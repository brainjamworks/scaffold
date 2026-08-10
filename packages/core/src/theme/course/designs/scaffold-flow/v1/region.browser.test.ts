import { afterEach, describe, expect, it } from "vite-plus/test";

import "@radix-ui/themes/tokens/base.css";

import "@/editor/surfaces/view/region.css";
import "./theme.css";

afterEach(() => {
  document.body.replaceChildren();
});

describe("Scaffold Flow Region recipe", () => {
  it("leaves visual values unset outside a Course design scope", () => {
    const region = document.createElement("section");
    region.className = "sc-region";
    region.style.setProperty("--radius-4", "8px");
    document.body.append(region);

    const style = getComputedStyle(region);
    expect(style.padding).toBe("0px");
    expect(style.gap).toBe("normal");
    expect(style.borderRadius).toBe("0px");
  });

  it("supplies the incumbent inset and rhythm while following the Course radius scale", () => {
    const medium = mountScaffoldFlowRegion("medium");
    const large = mountScaffoldFlowRegion("large");
    const mediumStyle = getComputedStyle(medium);
    const largeStyle = getComputedStyle(large);

    expect(mediumStyle.padding).toBe("4px");
    expect(mediumStyle.gap).toBe("12px");
    expect(mediumStyle.borderRadius).toBe("8px");
    expect(largeStyle.borderRadius).toBe("12px");
  });

  it("does not outrank explicitly authored Region presentation", () => {
    const region = mountScaffoldFlowRegion();
    region.style.padding = "7px";
    region.style.borderRadius = "3px";
    region.style.backgroundColor = "#123456";

    const style = getComputedStyle(region);
    expect(style.padding).toBe("7px");
    expect(style.borderRadius).toBe("3px");
    expect(style.backgroundColor).toBe("rgb(18, 52, 86)");
  });
});

function mountScaffoldFlowRegion(radius: "large" | "medium" = "medium"): HTMLElement {
  const course = document.createElement("div");
  course.className = "radix-themes sc-course sc-course-theme-scaffold-flow-v1";
  course.dataset.radius = radius;
  course.dataset.scaling = "100%";
  course.style.setProperty("--sc-course-author-density", "1");

  const region = document.createElement("section");
  region.className = "sc-region";
  course.append(region);
  document.body.append(course);
  return region;
}
