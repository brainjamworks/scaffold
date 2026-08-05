import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import "@/theme/course/designs/scaffold-flow/v1/roadmap.css";
import "./RoadmapAuthoringControls.css";
import "./Roadmap.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  mountedRoots.splice(0).forEach((root) => root.unmount());
  document.body.replaceChildren();
});

describe("Roadmap responsive ownership", () => {
  it("keeps Course status readable, App controls stable, and horizontal milestones intact narrow", async () => {
    await page.viewport(1000, 900);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    root.render(
      <AppThemeProvider appearance="light">
        <main>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
            <RoadmapSpecimen id="light" mode="authoring" />
          </CourseThemeProvider>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="dark">
            <RoadmapSpecimen id="dark" mode="authoring" />
            <RoadmapSpecimen id="runtime" mode="runtime" />
          </CourseThemeProvider>
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelectorAll(".sc-course-roadmap").length === 3);

    const light = requiredElement<HTMLElement>(host, '[data-specimen="light"]');
    const dark = requiredElement<HTMLElement>(host, '[data-specimen="dark"]');
    const runtime = requiredElement<HTMLElement>(host, '[data-specimen="runtime"]');
    const lightList = requiredElement<HTMLElement>(light, ".sc-course-roadmap__milestones");
    const lightMarkers = light.querySelectorAll<HTMLElement>(".sc-course-roadmap__marker");
    const darkMarkers = dark.querySelectorAll<HTMLElement>(".sc-course-roadmap__marker");
    const lightItems = light.querySelectorAll<HTMLElement>(".sc-course-roadmap__milestone");
    const lightDelete = requiredElement<HTMLElement>(light, ".sc-app-roadmap-delete");
    const darkDelete = requiredElement<HTMLElement>(dark, ".sc-app-roadmap-delete");

    expect(light.getAttribute("aria-label")).toBe("Roadmap");
    expect(lightList.getAttribute("aria-label")).toBe("Roadmap milestones");
    expect(light.querySelectorAll("li")).toHaveLength(3);
    expect(lightMarkers[1]?.getAttribute("data-course-state")).toBe("current");
    expect(lightItems[1]?.getAttribute("aria-current")).toBe("step");
    expect(getComputedStyle(lightItems[0]!).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(lightItems[0]!).borderTopWidth).toBe("0px");
    expect(runtime.querySelector('[class*="sc-app-roadmap-"]')).toBeNull();
    expect(runtime.querySelector("button")).toBeNull();
    expect(host.querySelector('[class^="sc-roadmap"], [class*=" sc-roadmap"]')).toBeNull();

    expect(getComputedStyle(lightMarkers[0]!).backgroundColor).not.toBe(
      getComputedStyle(darkMarkers[0]!).backgroundColor,
    );
    expect(
      getComputedStyle(requiredElement(light, ".sc-course-roadmap__content")).color,
    ).not.toBe(
      getComputedStyle(requiredElement(dark, ".sc-course-roadmap__content")).color,
    );
    expect(getComputedStyle(lightDelete).color).toBe(getComputedStyle(darkDelete).color);
    expect(lightDelete.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    expect(lightDelete.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);

    const statusMarker = requiredElement<HTMLElement>(light, ".sc-app-roadmap-status");
    const markerRect = statusMarker.getBoundingClientRect();
    expect(
      document
        .elementFromPoint(markerRect.left + markerRect.width / 2, markerRect.top + markerRect.height / 2)
        ?.closest(".sc-app-roadmap-status"),
    ).toBe(statusMarker);

    expect(getComputedStyle(lightList).flexDirection).toBe("row");
    expect(lightItems[1]!.getBoundingClientRect().left).toBeGreaterThan(
      lightItems[0]!.getBoundingClientRect().left,
    );
    expect(light.scrollWidth - light.clientWidth).toBeLessThanOrEqual(1);

    light.style.width = "320px";
    await waitForCondition(() => light.getBoundingClientRect().width === 320);
    expect(getComputedStyle(lightList).flexDirection).toBe("row");
    expect(lightItems[1]!.getBoundingClientRect().left).toBeGreaterThan(
      lightItems[0]!.getBoundingClientRect().left,
    );
    expect(getComputedStyle(light).overflowX).toBe("auto");
    expect(light.scrollWidth).toBeGreaterThan(light.clientWidth);

    light.style.width = "220px";
    await waitForCondition(() => light.getBoundingClientRect().width === 220);
    expect(light.scrollWidth).toBeGreaterThan(light.clientWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    expect(window.innerWidth).toBe(1000);
  });
});

function RoadmapSpecimen({ id, mode }: { id: string; mode: "authoring" | "runtime" }) {
  const authoring = mode === "authoring";
  const statuses = ["completed", "current", "available"] as const;

  return (
    <section
      data-specimen={id}
      data-block-align="left"
      data-orientation="horizontal"
      aria-label="Roadmap"
      className="sc-course-roadmap"
      style={{ width: "720px" }}
    >
      <div className="sc-course-roadmap__track">
        <ol aria-label="Roadmap milestones" className="sc-course-roadmap__milestones">
          {statuses.map((status, index) => (
            <li
              key={status}
              aria-current={status === "current" ? "step" : undefined}
              className="sc-course-roadmap__milestone"
            >
              <div className="sc-course-roadmap__milestone-shell">
                {authoring ? (
                  <div className="sc-app-roadmap-milestone-chrome">
                    <button
                      type="button"
                      className="sc-app-contained-movement-handle sc-app-roadmap-movement"
                    >
                      Move
                    </button>
                    <button type="button" className="sc-app-roadmap-delete">
                      Delete
                    </button>
                  </div>
                ) : null}
                {authoring ? (
                  <button
                    type="button"
                    data-course-state={status}
                    className="sc-course-roadmap__marker sc-app-roadmap-status"
                  >
                    {index + 1}
                  </button>
                ) : (
                  <span data-course-state={status} className="sc-course-roadmap__marker">
                    <span aria-hidden>{index + 1}</span>
                    <span className="sc-sr-only">Milestone {index + 1} status: {status}</span>
                  </span>
                )}
                <div className="sc-course-roadmap__content">
                  <p>{["Orient", "Practise", "Transfer"][index]}</p>
                  <p>A milestone description that remains readable without fragmented words.</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
        {authoring ? (
          <button type="button" className="sc-app-block-add sc-app-roadmap-add">
            <span className="sc-app-roadmap-add__marker">+</span>
            <span>Add milestone</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}

function requiredElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for Roadmap state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
