import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import "@/theme/course/designs/scaffold-flow/v1/resource-link.css";
import "./ResourceLinkAuthoringControls.css";
import { ResourceLinkKindPicker } from "./ResourceLinkAuthoringView";
import { ResourceLinkSurface } from "./ResourceLinkSurface";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Resource Link presentation", () => {
  it("themes the authoring kind selector from its active Course scope", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <AppThemeProvider appearance="light">
        <main>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
            <div data-authoring-controls="light">
              <KindPickerFixture />
            </div>
          </CourseThemeProvider>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="dark">
            <div data-authoring-controls="dark">
              <KindPickerFixture />
            </div>
          </CourseThemeProvider>
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelectorAll('[role="radiogroup"]').length === 2);
    const lightPicker = requiredElement<HTMLElement>(
      host,
      '[data-authoring-controls="light"] [role="radiogroup"]',
    );
    const darkPicker = requiredElement<HTMLElement>(
      host,
      '[data-authoring-controls="dark"] [role="radiogroup"]',
    );

    expect(lightPicker).toHaveClass("sc-course-resource-link__kind-picker");
    expect(
      host.querySelector('[class^="sc-app-resource-link"], [class*=" sc-app-resource-link"]'),
    ).toBeNull();
    expect(getComputedStyle(lightPicker).backgroundColor).not.toBe(
      getComputedStyle(darkPicker).backgroundColor,
    );
  });

  it("keeps the Course card theme-aware and contained at narrow intrinsic widths", async () => {
    const host = document.createElement("div");
    host.style.width = "480px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <AppThemeProvider appearance="light">
        <main>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
            <section>
              <div className="sc-course-resource-link-node">
                <ResourceLinkSurface
                  data={{
                    type: "resource_link",
                    url: "https://docs.example.com/course",
                    kind: "article",
                    showDescription: true,
                  }}
                  editable={false}
                  frameAttributes={{ "data-specimen": "light" }}
                >
                  <div className="sc-course-resource-link__title">Course guide</div>
                  <div className="sc-course-resource-link__description">
                    Read before starting the course.
                  </div>
                </ResourceLinkSurface>
              </div>
              <div className="sc-course-resource-link-node">
                <ResourceLinkSurface
                  data={{
                    type: "resource_link",
                    url: "https://docs.example.com/course",
                    kind: "link",
                    showDescription: true,
                  }}
                  editable
                  frameAttributes={{ "data-specimen": "authoring" }}
                  controls={<KindPickerFixture />}
                >
                  <div className="sc-course-resource-link__title">Editable guide</div>
                  <div className="sc-course-resource-link__description">Authoring controls</div>
                </ResourceLinkSurface>
              </div>
            </section>
          </CourseThemeProvider>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="dark">
            <div className="sc-course-resource-link-node">
              <ResourceLinkSurface
                data={{
                  type: "resource_link",
                  url: "https://docs.example.com/course",
                  kind: "article",
                  showDescription: false,
                }}
                editable={false}
                frameAttributes={{ "data-specimen": "dark" }}
              >
                <div className="sc-course-resource-link__title">Course guide</div>
                <div className="sc-course-resource-link__description">
                  Retained but hidden learner context.
                </div>
              </ResourceLinkSurface>
            </div>
          </CourseThemeProvider>
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelectorAll(".sc-course-resource-link").length === 3);
    const link = requiredElement<HTMLAnchorElement>(host, '[data-specimen="light"]');
    const darkLink = requiredElement<HTMLAnchorElement>(host, '[data-specimen="dark"]');
    const authoringCard = requiredElement<HTMLElement>(host, '[data-specimen="authoring"]');
    const linkNode = requiredAncestor<HTMLElement>(link, ".sc-course-resource-link-node");
    const authoringNode = requiredAncestor<HTMLElement>(
      authoringCard,
      ".sc-course-resource-link-node",
    );
    const kindIcon = requiredElement<HTMLElement>(link, ".sc-course-resource-link__kind-icon");
    const darkKindIcon = requiredElement<HTMLElement>(
      darkLink,
      ".sc-course-resource-link__kind-icon",
    );
    const hiddenDescription = requiredElement<HTMLElement>(
      darkLink,
      ".sc-course-resource-link__description",
    );
    const body = requiredElement<HTMLElement>(link, ".sc-course-resource-link__body");
    const openIcon = requiredElement<HTMLElement>(link, ".sc-course-resource-link__open-icon");
    const kindPicker = requiredElement<HTMLElement>(host, '[role="radiogroup"]');
    const kindOptions = Array.from(kindPicker.querySelectorAll<HTMLElement>('[role="radio"]'));
    const selectedKind = requiredElement<HTMLElement>(kindPicker, '[aria-label="Link"]');

    expect(getComputedStyle(link).display).toBe("grid");
    expect(
      host.querySelector('[class^="sc-resource-link"], [class*=" sc-resource-link"]'),
    ).toBeNull();
    expect(kindIcon.getBoundingClientRect().width).toBeCloseTo(40, 0);
    expect(kindIcon.getBoundingClientRect().height).toBeCloseTo(40, 0);
    expect(body.getBoundingClientRect().left - kindIcon.getBoundingClientRect().right).toBeCloseTo(
      16,
      0,
    );
    await userEvent.unhover(link);
    await waitForCondition(() => readTranslation(openIcon).x === 0);
    expect(readTranslation(openIcon)).toEqual({ x: 0, y: 0 });

    await userEvent.hover(link);
    await waitForCondition(() => readTranslation(openIcon).x >= 1.9);
    expect(readTranslation(openIcon).x).toBeCloseTo(2, 0);
    expect(readTranslation(openIcon).y).toBeCloseTo(-2, 0);

    expect(getComputedStyle(link).backgroundColor).not.toBe(
      getComputedStyle(darkLink).backgroundColor,
    );
    expect(hiddenDescription).toHaveTextContent("Retained but hidden learner context.");
    expect(getComputedStyle(hiddenDescription).display).toBe("none");
    expect(getComputedStyle(kindIcon).backgroundColor).not.toBe(
      getComputedStyle(darkKindIcon).backgroundColor,
    );

    expect(kindPicker.tabIndex).toBe(0);
    expect(kindOptions.every((option) => option.tabIndex === -1)).toBe(true);
    kindPicker.focus();
    await waitForCondition(() => document.activeElement === selectedKind);
    await userEvent.keyboard("{ArrowLeft>}");
    const audioKind = requiredElement<HTMLElement>(kindPicker, '[aria-label="Audio"]');
    await waitForCondition(() => audioKind.getAttribute("aria-checked") === "true");
    await userEvent.keyboard("{/ArrowLeft}");
    expect(document.activeElement).toBe(audioKind);
    expect(
      requiredElement<HTMLElement>(host, "[data-selected-resource-kind]").dataset[
        "selectedResourceKind"
      ],
    ).toBe("audio");

    linkNode.style.width = "240px";
    await waitForCondition(() => link.getBoundingClientRect().width === 240);
    expect(link.scrollWidth - link.clientWidth).toBeLessThanOrEqual(1);
    expect(Number.parseFloat(getComputedStyle(link).gap)).toBeCloseTo(12, 0);
    expect(link.getBoundingClientRect().right).toBeLessThanOrEqual(
      host.getBoundingClientRect().right,
    );

    authoringNode.style.width = "240px";
    await waitForCondition(() => authoringCard.getBoundingClientRect().width === 240);
    expect(authoringCard.scrollWidth - authoringCard.clientWidth).toBeLessThanOrEqual(1);
    expect(getComputedStyle(kindPicker).flexWrap).toBe("wrap");
  });
});

function KindPickerFixture() {
  const [kind, setKind] = useState<"article" | "video" | "pdf" | "audio" | "link">("link");

  return (
    <div data-selected-resource-kind={kind}>
      <ResourceLinkKindPicker value={kind} onChange={setKind} />
    </div>
  );
}

function readTranslation(element: Element): { x: number; y: number } {
  const transform = getComputedStyle(element).transform;
  if (transform === "none") return { x: 0, y: 0 };
  const matrix = new DOMMatrixReadOnly(transform);
  return { x: matrix.m41, y: matrix.m42 };
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}

function requiredAncestor<T extends Element>(element: Element, selector: string): T {
  const ancestor = element.closest<T>(selector);
  if (!ancestor) throw new Error(`Expected an ancestor for ${selector}.`);
  return ancestor;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error("Timed out waiting for Resource Link state.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
