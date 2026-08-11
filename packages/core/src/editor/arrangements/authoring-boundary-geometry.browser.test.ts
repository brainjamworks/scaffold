import { afterEach, describe, expect, it } from "vite-plus/test";

import "./grid/authoring/grid-authoring.css";
import "../surfaces/authoring/nodes/region-authoring.css";
import "../../theme/course/designs/scaffold-flow/v1/region.css";

afterEach(() => {
  document.body.replaceChildren();
});

describe("Authoring layout boundary geometry", () => {
  it("keeps invisible Region geometry and App authoring boundaries square", () => {
    const app = document.createElement("div");
    app.className = "sc-course sc-course-theme-scaffold-flow-v1";
    app.style.setProperty("--sc-app-color-border", "rgb(40, 50, 60)");
    app.style.setProperty("--sc-app-color-primary", "rgb(10, 20, 30)");
    app.style.setProperty("--sc-app-radius-surface", "12px");
    app.style.setProperty("--sc-authoring-slide-scale", "0.5");
    app.style.setProperty("--radius-4", "12px");

    const grid = document.createElement("div");
    grid.className = "sc-app-grid-authoring";

    const region = document.createElement("div");
    region.className = "sc-region sc-app-region-authoring";

    app.append(grid, region);
    document.body.append(app);

    expect(getComputedStyle(grid).borderTopLeftRadius).toBe("0px");
    expect(getComputedStyle(region).borderTopLeftRadius).toBe("0px");
    const regionOutline = getComputedStyle(region, "::before");
    expect(regionOutline.borderTopLeftRadius).toBe("0px");
    expect(regionOutline.borderTopWidth).toBe("1px");
    expect(regionOutline.borderTopStyle).toBe("dotted");
  });
});
