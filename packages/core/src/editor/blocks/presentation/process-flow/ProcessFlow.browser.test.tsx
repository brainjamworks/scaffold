import { createRoot, type Root } from "react-dom/client";
import { useLayoutEffect, useRef } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import "@/theme/course/designs/scaffold-flow/v1/process-flow.css";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";
import "./ProcessFlow.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  mountedRoots.splice(0).forEach((root) => root.unmount());
  document.body.replaceChildren();
});

describe("Process Flow responsive Course ownership", () => {
  it("keeps horizontal steps in one scroll-owned sequence and vertical connectors downward", async () => {
    await page.viewport(1000, 900);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    root.render(
      <main>
        <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
          <FlowSpecimen id="horizontal" orientation="horizontal" count={7} width={540} />
          <FlowSpecimen id="vertical" orientation="vertical" count={3} width={320} />
        </CourseThemeProvider>
      </main>,
    );

    await waitForCondition(
      () =>
        host.querySelector('[data-specimen="horizontal"] [data-process-flow-scrollable]') &&
        host.querySelector('[data-specimen="vertical"]'),
    );

    const horizontal = requiredElement<HTMLElement>(host, '[data-specimen="horizontal"]');
    const horizontalLane = requiredElement<HTMLElement>(
      horizontal,
      ".sc-course-process-flow__scrollport",
    );
    const horizontalList = requiredElement<HTMLElement>(
      horizontal,
      ".sc-course-process-flow__steps",
    );
    const horizontalItems = horizontal.querySelectorAll<HTMLElement>(
      ".sc-course-process-flow__step",
    );
    expect(getComputedStyle(horizontalList).flexWrap).toBe("nowrap");
    expect(horizontalLane.scrollWidth).toBeGreaterThan(horizontalLane.clientWidth);
    expect(horizontalLane.getAttribute("data-process-flow-scrollable")).toBe("horizontal");
    expect(horizontalItems[5]!.getBoundingClientRect().left).toBeGreaterThan(
      horizontalItems[4]!.getBoundingClientRect().left,
    );
    expect(horizontalItems[6]!.getBoundingClientRect().top).toBeCloseTo(
      horizontalItems[0]!.getBoundingClientRect().top,
      1,
    );
    expectConnectorVisualCenter(horizontalItems[0]!, horizontalItems[1]!, "horizontal");
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);

    const vertical = requiredElement<HTMLElement>(host, '[data-specimen="vertical"]');
    const verticalList = requiredElement<HTMLElement>(vertical, ".sc-course-process-flow__steps");
    const verticalItems = vertical.querySelectorAll<HTMLElement>(
      ".sc-course-process-flow__step",
    );
    expect(getComputedStyle(verticalList).flexDirection).toBe("column");
    expect(verticalItems[1]!.getBoundingClientRect().top).toBeGreaterThan(
      verticalItems[0]!.getBoundingClientRect().top,
    );
    expectConnectorVisualCenter(verticalItems[0]!, verticalItems[1]!, "vertical");
    const verticalConnectorTransform = new DOMMatrix(
      getComputedStyle(verticalItems[0]!, "::after").transform,
    );
    expect(verticalConnectorTransform.a).toBeCloseTo(Math.SQRT1_2, 5);
    expect(verticalConnectorTransform.b).toBeCloseTo(Math.SQRT1_2, 5);
    expect(verticalConnectorTransform.c).toBeCloseTo(-Math.SQRT1_2, 5);
    expect(verticalConnectorTransform.d).toBeCloseTo(Math.SQRT1_2, 5);
    expect(getComputedStyle(verticalItems[2]!, "::after").content).toBe("none");
  });

  it("uses Course light/dark surfaces and lets author roundness reach the cards", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    root.render(
      <main>
        <CourseThemeProvider theme={courseThemeWithRoundness("square")} appearance="light">
          <FlowSpecimen id="square-light" orientation="horizontal" count={3} width={720} />
        </CourseThemeProvider>
        <CourseThemeProvider theme={courseThemeWithRoundness("rounded")} appearance="dark">
          <FlowSpecimen id="rounded-dark" orientation="horizontal" count={3} width={720} />
        </CourseThemeProvider>
      </main>,
    );

    await waitForCondition(() => host.querySelectorAll(".sc-course-process-flow__card").length === 6);
    const light = requiredElement<HTMLElement>(host, '[data-specimen="square-light"]');
    const dark = requiredElement<HTMLElement>(host, '[data-specimen="rounded-dark"]');
    const lightCard = requiredElement<HTMLElement>(light, ".sc-course-process-flow__card");
    const darkCard = requiredElement<HTMLElement>(dark, ".sc-course-process-flow__card");
    const lightMarker = requiredElement<HTMLElement>(light, ".sc-course-process-flow__number");
    const darkMarker = requiredElement<HTMLElement>(dark, ".sc-course-process-flow__number");

    expect(Number.parseFloat(getComputedStyle(lightCard).borderTopLeftRadius)).toBe(0);
    expect(Number.parseFloat(getComputedStyle(darkCard).borderTopLeftRadius)).toBeGreaterThan(0);
    expect(getComputedStyle(lightCard).backgroundColor).not.toBe(
      getComputedStyle(darkCard).backgroundColor,
    );
    expect(getComputedStyle(lightMarker).backgroundColor).not.toBe(
      getComputedStyle(darkMarker).backgroundColor,
    );
  });

  it.each(["light", "dark"] as const)(
    "gives Pocket Atlas a complete accessible Process Flow recipe in %s mode",
    async (appearance) => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      mountedRoots.push(root);

      root.render(
        <CourseThemeProvider appearance={appearance} theme={pocketAtlasTheme()}>
          <FlowSpecimen
            id={`pocket-${appearance}`}
            orientation="horizontal"
            count={3}
            width={720}
            includeAdd
          />
        </CourseThemeProvider>,
      );

      await waitForCondition(
        () => host.querySelectorAll(".sc-course-process-flow__card").length === 3,
      );
      const specimen = requiredElement<HTMLElement>(host, "[data-specimen]");
      const rail = requiredElement<HTMLElement>(specimen, ".sc-course-process-flow__rail");
      const cards = Array.from(
        specimen.querySelectorAll<HTMLElement>(".sc-course-process-flow__card"),
      );
      const add = requiredElement<HTMLElement>(specimen, ".sc-app-process-flow-add");
      const title = requiredElement<HTMLElement>(specimen, ".sc-course-process-flow__content p");
      const description = requiredElement<HTMLElement>(
        specimen,
        ".sc-course-process-flow__content p + p",
      );
      const marker = requiredElement<HTMLElement>(specimen, ".sc-course-process-flow__number");
      const specimenStyle = getComputedStyle(specimen);
      const cardWidth = cards[0]!.getBoundingClientRect().width;

      expect(specimenStyle.getPropertyValue("--sc-course-process-flow-card-size").trim()).not.toBe(
        "",
      );
      expect(
        specimenStyle.getPropertyValue("--sc-course-process-flow-connector-size").trim(),
      ).not.toBe("");
      expect(cards.every((card) => Math.abs(card.getBoundingClientRect().width - cardWidth) < 1)).toBe(
        true,
      );
      expect(add.getBoundingClientRect().width).toBeCloseTo(cardWidth, 0);
      expect(getComputedStyle(rail).backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(Number.parseFloat(getComputedStyle(title).fontSize)).toBeGreaterThan(
        Number.parseFloat(getComputedStyle(description).fontSize),
      );
      expect(Number.parseInt(getComputedStyle(title).fontWeight, 10)).toBeGreaterThan(
        Number.parseInt(getComputedStyle(description).fontWeight, 10),
      );
      expect(
        contrastRatio(getComputedStyle(marker).color, getComputedStyle(marker).backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});

function FlowSpecimen({
  count,
  id,
  orientation,
  width,
  includeAdd = false,
}: {
  count: number;
  id: string;
  orientation: "horizontal" | "vertical";
  width: number;
  includeAdd?: boolean;
}) {
  const scrollportRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scrollport = scrollportRef.current;
    if (!scrollport) return;
    const update = () => {
      const hasOverflow =
        orientation === "horizontal"
          ? scrollport.scrollWidth > scrollport.clientWidth + 1
          : scrollport.scrollHeight > scrollport.clientHeight + 1;
      if (hasOverflow) {
        scrollport.setAttribute("data-process-flow-scrollable", orientation);
      } else {
        scrollport.removeAttribute("data-process-flow-scrollable");
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scrollport);
    const rail = scrollport.firstElementChild;
    if (rail) observer.observe(rail);
    return () => observer.disconnect();
  }, [count, orientation]);

  return (
    <section
      aria-label="Process flow"
      className="sc-course-process-flow"
      data-orientation={orientation}
      data-show-connectors="true"
      data-show-numbers="true"
      data-specimen={id}
      style={{ width }}
    >
      <div ref={scrollportRef} className="sc-course-process-flow__scrollport">
        <div className="sc-course-process-flow__rail">
          <ol aria-label="Process steps" className="sc-course-process-flow__steps">
            {Array.from({ length: count }, (_, index) => (
              <li key={index} className="sc-course-process-flow__step">
                <div className="sc-course-process-flow__card">
                  <div className="sc-course-process-flow__header">
                    <span aria-hidden className="sc-course-process-flow__number">
                      {index + 1}
                    </span>
                  </div>
                  <div className="sc-course-process-flow__content">
                    <p>{`Step ${index + 1}`}</p>
                    <p>A concise description for this stage.</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {includeAdd ? (
            <button className="sc-app-process-flow-add" type="button">
              Add step
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function pocketAtlasTheme() {
  return {
    schemaVersion: 1 as const,
    design: { id: "pocket-atlas", revision: "1" },
    colourSystem: { id: "pocket-atlas", revision: "1" },
    overrides: {},
  };
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: string): number {
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) {
    throw new Error(`Expected an rgb colour, received ${color}`);
  }
  const [red, green, blue] = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function expectConnectorVisualCenter(
  current: HTMLElement,
  next: HTMLElement,
  orientation: "horizontal" | "vertical",
): void {
  const pseudo = getComputedStyle(current, "::after");
  const matrix = new DOMMatrix(pseudo.transform);
  const size = Number.parseFloat(
    orientation === "horizontal" ? pseudo.width : pseudo.height,
  );
  const currentRect = current.getBoundingClientRect();
  const nextRect = next.getBoundingClientRect();
  const visualBias = size / (2 * Math.SQRT2);

  if (orientation === "horizontal") {
    const untransformedCenter = currentRect.right - Number.parseFloat(pseudo.right) - size / 2;
    const visualCenter = untransformedCenter + matrix.e + visualBias;
    expect(visualCenter).toBeCloseTo((currentRect.right + nextRect.left) / 2, 1);
    return;
  }

  const untransformedCenter = currentRect.bottom - Number.parseFloat(pseudo.bottom) - size / 2;
  const visualCenter = untransformedCenter + matrix.f + visualBias;
  expect(visualCenter).toBeCloseTo((currentRect.bottom + nextRect.top) / 2, 1);
}

function courseThemeWithRoundness(roundness: "square" | "rounded") {
  return {
    ...createDefaultPersistedCourseTheme(),
    overrides: { design: { roundness } },
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
    if (performance.now() > deadline) throw new Error("Timed out waiting for Process Flow state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
