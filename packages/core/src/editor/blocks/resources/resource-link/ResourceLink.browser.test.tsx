import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import { Input } from "@/ui/components/Input/Input";

import "@/theme/course/designs/pocket-atlas/v1/theme.css";
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
  it("themes the author-only URL field from the App scope inside the Course card", async () => {
    const application = document.createElement("div");
    application.className = "sc-app";
    application.style.setProperty("--sc-app-color-background", "rgb(240 241 242)");
    application.style.setProperty("--sc-app-color-border", "rgb(63 63 70)");
    application.style.setProperty("--sc-app-color-ink", "rgb(24 24 27)");
    application.style.setProperty("--sc-app-color-text-placeholder", "rgb(113 113 122)");
    application.style.setProperty("--sc-app-color-focus-outline", "rgb(22 29 119)");
    application.style.setProperty("--sc-app-font-family", "Arial");
    const host = document.createElement("div");
    host.className = "radix-themes sc-course sc-course-theme-scaffold-flow-v1";
    host.style.width = "480px";
    host.style.setProperty("--gray-1", "rgb(12 34 56)");
    host.style.setProperty("--gray-a6", "rgb(34 56 78)");
    host.style.setProperty("--gray-a7", "rgb(56 78 90)");
    application.append(host);
    document.body.append(application);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <div className="sc-course-resource-link">
        <div className="sc-app-resource-link__controls">
          <Input
            type="url"
            aria-label="Resource URL"
            placeholder="https://..."
            className="sc-app-resource-link__url-input"
          />
          <KindPickerFixture />
        </div>
      </div>,
    );

    await waitForCondition(() => host.querySelector('input[aria-label="Resource URL"]'));
    const input = requiredElement<HTMLInputElement>(host, 'input[aria-label="Resource URL"]');
    const controls = requiredAncestor<HTMLElement>(input, ".sc-app-resource-link__controls");
    const kindPicker = requiredElement<HTMLElement>(controls, '[role="radiogroup"]');

    expect(input).toHaveClass("sc-input", "sc-app-resource-link__url-input");
    expect(input).not.toHaveClass("sc-course-resource-link__url-input");
    expect(controls).not.toHaveClass("sc-course-resource-link__controls");
    expect(kindPicker).toHaveClass("sc-app-resource-link__kind-picker");
    expect(kindPicker).not.toHaveClass("sc-course-resource-link__kind-picker");
    expect(getComputedStyle(controls).display).toBe("flex");
    expect(getComputedStyle(controls).borderTopColor).toBe("rgb(63, 63, 70)");
    expect(getComputedStyle(input).backgroundColor).toBe("rgb(240, 241, 242)");
    expect(getComputedStyle(input).borderColor).toBe("rgb(63, 63, 70)");
    expect(getComputedStyle(input).color).toBe("rgb(24, 24, 27)");
    expect(getComputedStyle(input).fontFamily).toContain("Arial");
    expect(getComputedStyle(input).borderRadius).toBe("6px");
    expect(input.getBoundingClientRect().height).toBeCloseTo(38, 0);

    await userEvent.tab();
    expect(document.activeElement).toBe(input);
    await waitForCondition(() => getComputedStyle(input).outlineStyle !== "none");
    expect(getComputedStyle(input).outlineWidth).toBe("2px");

    host.style.width = "240px";
    await waitForCondition(() => getComputedStyle(controls).flexDirection === "column");
    expect(controls.scrollWidth - controls.clientWidth).toBeLessThanOrEqual(1);
  });

  it("themes the authoring kind selector from the App scope across Course scopes", async () => {
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

    const lightOptions = Array.from(lightPicker.querySelectorAll<HTMLElement>('[role="radio"]'));
    const darkOptions = Array.from(darkPicker.querySelectorAll<HTMLElement>('[role="radio"]'));
    const lightSelected = requiredElement<HTMLElement>(lightPicker, '[aria-label="Link"]');
    const darkSelected = requiredElement<HTMLElement>(darkPicker, '[aria-label="Link"]');

    expect(lightPicker).toHaveClass("sc-app-resource-link__kind-picker");
    expect(lightPicker).not.toHaveClass("sc-course-resource-link__kind-picker");
    expect(
      lightOptions.every((option) =>
        option.classList.contains("sc-app-resource-link__kind-option"),
      ),
    ).toBe(true);
    expect(
      lightOptions.every(
        (option) => !option.classList.contains("sc-course-resource-link__kind-option"),
      ),
    ).toBe(true);
    expect(getComputedStyle(lightPicker).backgroundColor).toBe(
      getComputedStyle(darkPicker).backgroundColor,
    );
    expect(getComputedStyle(lightSelected).backgroundColor).toBe(
      getComputedStyle(darkSelected).backgroundColor,
    );
    expect(lightSelected.getBoundingClientRect().width).toBeCloseTo(32, 0);
    expect(lightSelected.getBoundingClientRect().height).toBeCloseTo(32, 0);
    expect(lightPicker.getBoundingClientRect().width).toBeCloseTo(172, 0);
    expect(lightPicker.getBoundingClientRect().height).toBeCloseTo(36, 0);
    expect(darkOptions).toHaveLength(5);
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
    expect(kindPicker).toHaveClass("sc-app-resource-link__kind-picker");
    expect(kindPicker).not.toHaveClass("sc-course-resource-link__kind-picker");
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

  it("separates the Pocket Atlas icon from its content hierarchy", async () => {
    const host = document.createElement("div");
    host.className = "sc-course sc-course-theme-pocket-atlas-v1";
    host.style.width = "480px";
    host.style.setProperty("--sc-course-author-density", "1");
    host.style.setProperty("--heading-font-family", '"Silkscreen", monospace');
    host.style.setProperty(
      "--default-font-family",
      '"Atkinson Hyperlegible", sans-serif',
    );
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <ResourceLinkSurface
        data={{
          type: "resource_link",
          url: "https://docs.example.com/course",
          kind: "article",
          showDescription: true,
        }}
        editable={false}
      >
        <div className="sc-course-resource-link__title">Pocket guide</div>
        <div className="sc-course-resource-link__description">
          Read before starting the course.
        </div>
      </ResourceLinkSurface>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-resource-link"));
    const link = requiredElement<HTMLElement>(host, ".sc-course-resource-link");
    const kindIcon = requiredElement<HTMLElement>(link, ".sc-course-resource-link__kind-icon");
    const body = requiredElement<HTMLElement>(link, ".sc-course-resource-link__body");

    expect(body.getBoundingClientRect().left - kindIcon.getBoundingClientRect().right).toBeCloseTo(
      16,
      0,
    );
    expect(Number.parseFloat(getComputedStyle(body).gap)).toBeCloseTo(8, 0);
  });

  it("gives Pocket Atlas descriptions, metadata, and the open affordance a clear hierarchy", async () => {
    const host = document.createElement("div");
    host.className = "sc-course sc-course-theme-pocket-atlas-v1";
    host.style.width = "480px";
    host.style.setProperty("--sc-course-author-density", "1");
    host.style.setProperty("--heading-font-family", '"Silkscreen", monospace');
    host.style.setProperty(
      "--default-font-family",
      '"Atkinson Hyperlegible", sans-serif',
    );
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <ResourceLinkSurface
        data={{
          type: "resource_link",
          url: "https://docs.example.com/course",
          kind: "article",
          showDescription: true,
        }}
        editable={false}
      >
        <div className="sc-course-resource-link__title">Pocket guide</div>
        <div className="sc-course-resource-link__description">
          Read before starting the course.
        </div>
      </ResourceLinkSurface>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-resource-link"));
    const link = requiredElement<HTMLElement>(host, ".sc-course-resource-link");
    const description = requiredElement<HTMLElement>(
      link,
      ".sc-course-resource-link__description",
    );
    const meta = requiredElement<HTMLElement>(link, ".sc-course-resource-link__meta");
    const resourceHost = requiredElement<HTMLElement>(link, ".sc-course-resource-link__host");
    const openIcon = requiredElement<HTMLElement>(link, ".sc-course-resource-link__open-icon");

    expect(Number.parseFloat(getComputedStyle(description).fontSize)).toBeCloseTo(15.2, 1);
    expect(Number.parseFloat(getComputedStyle(description).lineHeight)).toBeCloseTo(22.8, 1);
    expect(Number.parseFloat(getComputedStyle(meta).gap)).toBeCloseTo(8, 0);
    expect(getComputedStyle(meta).fontFamily).toContain("Silkscreen");
    expect(Number.parseFloat(getComputedStyle(meta).fontSize)).toBeCloseTo(11.2, 1);
    expect(getComputedStyle(resourceHost).fontFamily).toContain("Atkinson Hyperlegible");
    expect(getComputedStyle(resourceHost).textTransform).toBe("none");
    expect(openIcon.getBoundingClientRect().width).toBeCloseTo(28, 0);
    expect(openIcon.getBoundingClientRect().height).toBeCloseTo(28, 0);

    await userEvent.unhover(link);
    await waitForCondition(() => readTranslation(openIcon).x === 0);
    await userEvent.hover(link);
    await waitForCondition(() => readTranslation(openIcon).x >= 1.9);
    expect(readTranslation(openIcon).x).toBeCloseTo(2, 0);
    expect(readTranslation(openIcon).y).toBeCloseTo(-2, 0);
  });

  it("tightens the Pocket Atlas card without clipping at narrow intrinsic widths", async () => {
    const host = document.createElement("div");
    host.className = "sc-course sc-course-theme-pocket-atlas-v1";
    host.style.width = "240px";
    host.style.setProperty("--sc-course-author-density", "1");
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <div className="sc-course-resource-link-node">
        <ResourceLinkSurface
          data={{
            type: "resource_link",
            url: "https://docs.example.com/a/very/long/resource/path",
            kind: "article",
            showDescription: true,
          }}
          editable={false}
        >
          <div className="sc-course-resource-link__title">A compact Pocket guide</div>
          <div className="sc-course-resource-link__description">
            A longer description that must remain inside the card.
          </div>
        </ResourceLinkSurface>
      </div>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-resource-link"));
    const link = requiredElement<HTMLElement>(host, ".sc-course-resource-link");

    expect(Number.parseFloat(getComputedStyle(link).gap)).toBeCloseTo(12, 0);
    expect(Number.parseFloat(getComputedStyle(link).paddingLeft)).toBeCloseTo(12, 0);
    expect(link.scrollWidth - link.clientWidth).toBeLessThanOrEqual(1);
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
