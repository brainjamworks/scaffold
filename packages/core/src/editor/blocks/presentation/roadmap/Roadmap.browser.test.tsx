import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import "@/editor/movement/view/movement-handles.css";
import "@/styles/globals.css";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import "@/theme/course/designs/scaffold-flow/v1/roadmap.css";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";
import "./RoadmapAuthoringControls.css";
import "./Roadmap.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  mountedRoots.splice(0).forEach((root) => root.unmount());
  document.body.replaceChildren();
});

describe("Roadmap responsive ownership", () => {
  it("keeps required Roadmap geometry usable without a Course recipe", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    root.render(
      <AppThemeProvider appearance="light">
        <main>
          <RoadmapSpecimen id="core-fallback" mode="authoring" orientation="vertical" />
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelector('[data-specimen="core-fallback"]'));

    const roadmap = requiredElement<HTMLElement>(host, '[data-specimen="core-fallback"]');
    const marker = requiredElement<HTMLElement>(roadmap, ".sc-app-roadmap-status");
    const add = requiredElement<HTMLElement>(roadmap, ".sc-app-roadmap-add");
    const addMarker = requiredElement<HTMLElement>(roadmap, ".sc-app-roadmap-add__marker");
    const styles = getComputedStyle(roadmap);

    expect(styles.getPropertyValue("--sc-course-roadmap-marker-size")).not.toBe("");
    expect(styles.getPropertyValue("--sc-course-roadmap-marker-gap")).not.toBe("");
    expect(marker.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    expect(marker.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(add.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(addMarker.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    expect(addMarker.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  });

  it("supplies a complete Pocket Atlas Roadmap recipe without reskinning App controls", async () => {
    await page.viewport(1000, 900);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    root.render(
      <AppThemeProvider appearance="light">
        <main>
          <CourseThemeProvider theme={pocketAtlasTheme()} appearance="light">
            <RoadmapSpecimen id="pocket-authoring" mode="authoring" orientation="vertical" />
            <RoadmapSpecimen id="pocket-runtime" mode="runtime" orientation="vertical" />
            <RoadmapSpecimen id="pocket-horizontal" mode="runtime" orientation="horizontal" />
          </CourseThemeProvider>
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelectorAll(".sc-course-roadmap").length === 3);

    const authoring = requiredElement<HTMLElement>(host, '[data-specimen="pocket-authoring"]');
    const runtime = requiredElement<HTMLElement>(host, '[data-specimen="pocket-runtime"]');
    const horizontal = requiredElement<HTMLElement>(host, '[data-specimen="pocket-horizontal"]');
    const track = requiredElement<HTMLElement>(authoring, ".sc-course-roadmap__track");
    const markers = runtime.querySelectorAll<HTMLElement>(".sc-course-roadmap__marker");
    const status = requiredElement<HTMLElement>(authoring, ".sc-app-roadmap-status");
    const add = requiredElement<HTMLElement>(authoring, ".sc-app-roadmap-add");
    const addMarker = requiredElement<HTMLElement>(authoring, ".sc-app-roadmap-add__marker");

    expect(getComputedStyle(authoring).getPropertyValue("--sc-course-roadmap-marker-size")).not.toBe(
      "",
    );
    expect(track.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(getComputedStyle(track).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(track, "::before").content).not.toBe("none");
    expect(markers).toHaveLength(3);
    expect(markers[0]?.getBoundingClientRect().width).toBeCloseTo(44, 0);
    expect(markers[0]?.getBoundingClientRect().height).toBeCloseTo(44, 0);
    expect(getComputedStyle(markers[0]!).backgroundColor).not.toBe(
      getComputedStyle(markers[1]!).backgroundColor,
    );
    expect(getComputedStyle(markers[1]!).backgroundColor).not.toBe(
      getComputedStyle(markers[2]!).backgroundColor,
    );
    expect(status.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    expect(status.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(add.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(addMarker.getBoundingClientRect().width).toBeCloseTo(44, 0);
    expect(getComputedStyle(add).fontFamily).toContain("Satoshi");
    expect(getComputedStyle(add).color).toBe("rgb(113, 113, 122)");

    horizontal.style.width = "320px";
    await waitForCondition(() => horizontal.getBoundingClientRect().width === 320);
    expect(getComputedStyle(horizontal).overflowX).toBe("auto");
    expect(horizontal.scrollWidth).toBeGreaterThan(horizontal.clientWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });

  it("keeps the authoring add control on the milestone axis and in the milestone rhythm", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    root.render(
      <AppThemeProvider appearance="light">
        <main>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
            <RoadmapSpecimen id="vertical-authoring" mode="authoring" orientation="vertical" />
          </CourseThemeProvider>
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelector(".sc-app-roadmap-add"));

    const roadmap = requiredElement<HTMLElement>(host, '[data-specimen="vertical-authoring"]');
    const list = requiredElement<HTMLElement>(roadmap, ".sc-course-roadmap__milestones");
    const milestones = roadmap.querySelectorAll<HTMLElement>(".sc-course-roadmap__milestone");
    const lastMilestone = milestones[milestones.length - 1]!;
    const lastMarker = requiredElement<HTMLElement>(lastMilestone, ".sc-course-roadmap__marker");
    const add = requiredElement<HTMLElement>(roadmap, ".sc-app-roadmap-add");
    const addMarker = requiredElement<HTMLElement>(add, ".sc-app-roadmap-add__marker");

    const expectedGap = Number.parseFloat(getComputedStyle(list).gap);
    const actualGap =
      add.getBoundingClientRect().top - lastMilestone.getBoundingClientRect().bottom;
    expect(actualGap).toBeCloseTo(expectedGap, 1);
    expect(addMarker.getBoundingClientRect().left).toBeCloseTo(
      lastMarker.getBoundingClientRect().left,
      1,
    );
    expect(getComputedStyle(addMarker).borderRadius).toBe("6px");
    expect(getComputedStyle(addMarker).borderRadius).not.toBe(
      getComputedStyle(lastMarker).borderRadius,
    );
  });

  it("keeps the App-owned delete action stable across Course roundness values", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);
    const roundnessValues = ["square", "subtle", "rounded", "full"] as const;

    root.render(
      <AppThemeProvider appearance="light">
        <main>
          {roundnessValues.map((roundness) => (
            <CourseThemeProvider
              key={roundness}
              theme={courseThemeWithRoundness(roundness)}
              appearance="light"
            >
              <RoadmapSpecimen id={`roundness-${roundness}`} mode="authoring" />
            </CourseThemeProvider>
          ))}
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(
      () =>
        host.querySelectorAll('[data-specimen^="roundness-"]').length === roundnessValues.length,
    );

    for (const roundness of roundnessValues) {
      const roadmap = requiredElement<HTMLElement>(
        host,
        `[data-specimen="roundness-${roundness}"]`,
      );
      const deleteAction = requiredElement<HTMLElement>(roadmap, ".sc-app-roadmap-delete");
      const styles = getComputedStyle(deleteAction);

      expect(deleteAction.classList.contains("sc-course-roadmap__delete")).toBe(false);
      expect(deleteAction.getBoundingClientRect().width).toBeCloseTo(44, 0);
      expect(deleteAction.getBoundingClientRect().height).toBeCloseTo(44, 0);
      expect(styles.borderTopWidth).toBe("0px");
      expect(styles.borderTopLeftRadius).toBe("6px");
      expect(styles.backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(styles.color).toBe("rgb(113, 113, 122)");
      expect(styles.opacity).toBe("0.72");
    }
  });

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
          <AppThemeProvider appearance="dark">
            <div>
              <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="dark">
                <RoadmapSpecimen id="app-dark" mode="authoring" />
              </CourseThemeProvider>
            </div>
          </AppThemeProvider>
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelectorAll(".sc-course-roadmap").length === 4);

    const light = requiredElement<HTMLElement>(host, '[data-specimen="light"]');
    const dark = requiredElement<HTMLElement>(host, '[data-specimen="dark"]');
    const appDark = requiredElement<HTMLElement>(host, '[data-specimen="app-dark"]');
    const runtime = requiredElement<HTMLElement>(host, '[data-specimen="runtime"]');
    const lightList = requiredElement<HTMLElement>(light, ".sc-course-roadmap__milestones");
    const lightMarkers = light.querySelectorAll<HTMLElement>(".sc-course-roadmap__marker");
    const darkMarkers = dark.querySelectorAll<HTMLElement>(".sc-course-roadmap__marker");
    const lightItems = light.querySelectorAll<HTMLElement>(".sc-course-roadmap__milestone");
    const lightDelete = requiredElement<HTMLElement>(light, ".sc-app-roadmap-delete");
    const darkDelete = requiredElement<HTMLElement>(dark, ".sc-app-roadmap-delete");
    const darkAppDelete = requiredElement<HTMLElement>(appDark, ".sc-app-roadmap-delete");
    const lightMovementVisual = requiredElement<HTMLElement>(
      light,
      ".sc-app-compact-movement-handle__visual",
    );
    const darkCourseMovementVisual = requiredElement<HTMLElement>(
      dark,
      ".sc-app-compact-movement-handle__visual",
    );
    const darkAppMovementVisual = requiredElement<HTMLElement>(
      appDark,
      ".sc-app-compact-movement-handle__visual",
    );

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
    expect(getComputedStyle(requiredElement(light, ".sc-course-roadmap__content")).color).not.toBe(
      getComputedStyle(requiredElement(dark, ".sc-course-roadmap__content")).color,
    );
    expect(getComputedStyle(lightDelete).color).toBe(getComputedStyle(darkDelete).color);
    expect(getComputedStyle(lightDelete).color).not.toBe(getComputedStyle(darkAppDelete).color);
    expect(getComputedStyle(lightMovementVisual).color).toBe(
      getComputedStyle(darkCourseMovementVisual).color,
    );
    expect(getComputedStyle(lightMovementVisual).color).not.toBe(
      getComputedStyle(darkAppMovementVisual).color,
    );
    expect(getComputedStyle(lightMovementVisual).borderRadius).toBe("6px");
    expect(lightDelete.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    expect(lightDelete.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);

    const firstMarker = requiredElement<HTMLElement>(lightItems[0]!, ".sc-course-roadmap__marker");
    expect(
      firstMarker.getBoundingClientRect().top - lightDelete.getBoundingClientRect().bottom,
    ).toBe(4);

    const statusMarker = requiredElement<HTMLElement>(light, ".sc-app-roadmap-status");
    const markerRect = statusMarker.getBoundingClientRect();
    expect(
      document
        .elementFromPoint(
          markerRect.left + markerRect.width / 2,
          markerRect.top + markerRect.height / 2,
        )
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

function RoadmapSpecimen({
  id,
  mode,
  orientation = "horizontal",
}: {
  id: string;
  mode: "authoring" | "runtime";
  orientation?: "horizontal" | "vertical";
}) {
  const authoring = mode === "authoring";
  const statuses = ["completed", "current", "available"] as const;

  return (
    <section
      data-specimen={id}
      data-block-align="left"
      data-orientation={orientation}
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
                      className="sc-app-contained-movement-handle sc-app-compact-movement-handle"
                    >
                      <span className="sc-app-contained-movement-handle__visual sc-app-compact-movement-handle__visual">
                        Move
                      </span>
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
                    <span aria-hidden className="sc-course-roadmap__marker-visual">
                      {index + 1}
                    </span>
                    <span className="sc-sr-only">
                      Milestone {index + 1} status: {status}
                    </span>
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

function courseThemeWithRoundness(roundness: "square" | "subtle" | "rounded" | "full") {
  return {
    ...createDefaultPersistedCourseTheme(),
    overrides: { design: { roundness } },
  };
}

function pocketAtlasTheme() {
  return {
    schemaVersion: 1 as const,
    design: { id: "pocket-atlas", revision: "1" },
    colourSystem: { id: "pocket-atlas", revision: "1" },
    overrides: {},
  };
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
