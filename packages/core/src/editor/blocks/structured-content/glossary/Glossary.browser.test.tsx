import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import "./Glossary.css";
import "./GlossaryAuthoringControls.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Glossary presentation", () => {
  it("keeps its row recipe and App-owned delete action correct when the container narrows", async () => {
    await page.viewport(900, 700);
    const host = document.createElement("div");
    host.style.width = "800px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <AppThemeProvider appearance="light">
        <main>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
            <GlossarySpecimen />
          </CourseThemeProvider>
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-glossary__entry"));
    const appStyle = getComputedStyle(requiredElement<HTMLElement>(host, ".sc-app"));
    const mutedColour = computedColor(appStyle.getPropertyValue("--sc-app-color-text-muted"));
    const errorColour = computedColor(appStyle.getPropertyValue("--sc-app-color-error"));
    const errorBackground = computedColor(
      appStyle.getPropertyValue("--sc-app-color-error-background"),
      "background",
    );
    const controlRadius = computedLength(appStyle.getPropertyValue("--sc-app-radius-control"));

    const entry = requiredElement<HTMLElement>(host, ".sc-course-glossary__entry");
    const term = requiredElement<HTMLElement>(entry, ".sc-course-glossary__term");
    const definition = requiredElement<HTMLElement>(entry, ".sc-course-glossary__definition");
    const deleteButton = requiredElement<HTMLButtonElement>(entry, ".sc-app-glossary-delete");
    const addButton = requiredElement<HTMLButtonElement>(host, ".sc-app-glossary-add");

    const desktopTerm = term.getBoundingClientRect();
    const desktopDefinition = definition.getBoundingClientRect();
    const deleteTarget = deleteButton.getBoundingClientRect();
    const deleteVisual = getComputedStyle(deleteButton, "::before");
    expect(getComputedStyle(entry).display).toBe("grid");
    expect(desktopTerm.width).toBeCloseTo(176, 0);
    expect(desktopDefinition.left - desktopTerm.right).toBeCloseTo(24, 0);
    expect(Math.abs(desktopDefinition.top - desktopTerm.top)).toBeLessThanOrEqual(2);
    expect(deleteButton).not.toHaveClass("sc-course-glossary__delete");
    expect(deleteTarget.width).toBeCloseTo(44, 0);
    expect(deleteTarget.height).toBeCloseTo(44, 0);
    expect(Number.parseFloat(deleteVisual.width)).toBeCloseTo(28, 0);
    expect(Number.parseFloat(deleteVisual.height)).toBeCloseTo(28, 0);
    expect(Number.parseFloat(deleteVisual.borderTopLeftRadius)).toBeCloseTo(controlRadius, 1);
    expect(entry.scrollWidth).toBe(entry.clientWidth);
    expect(getComputedStyle(deleteButton).opacity).toBe("1");
    expect(getComputedStyle(deleteButton).color).toBe(mutedColour);
    expect(deleteVisual.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(addButton.querySelector("svg")).toBeNull();

    await userEvent.hover(deleteButton);
    await waitForCondition(() => getComputedStyle(deleteButton).color === errorColour);
    expect(getComputedStyle(deleteButton, "::before").backgroundColor).toBe(errorBackground);
    expect(getComputedStyle(deleteButton).backgroundColor).toBe("rgba(0, 0, 0, 0)");

    await userEvent.unhover(deleteButton);
    deleteButton.focus();
    await waitForCondition(() => getComputedStyle(deleteButton).color === errorColour);

    deleteButton.setAttribute("aria-disabled", "true");
    await waitForCondition(
      () =>
        getComputedStyle(deleteButton).opacity === "0.45" &&
        getComputedStyle(deleteButton).color === mutedColour,
    );
    expect(document.activeElement).toBe(deleteButton);
    expect(getComputedStyle(deleteButton).color).toBe(mutedColour);
    expect(getComputedStyle(deleteButton, "::before").backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(deleteButton).cursor).toBe("not-allowed");
    expect(getComputedStyle(deleteButton).outlineStyle).toBe("solid");

    host.style.width = "560px";
    await waitForCondition(() => getComputedStyle(definition).gridRowStart === "2");
    const narrowTerm = term.getBoundingClientRect();
    const narrowDefinition = definition.getBoundingClientRect();
    expect(narrowDefinition.left).toBeCloseTo(narrowTerm.left, 0);
    expect(narrowDefinition.top).toBeGreaterThanOrEqual(narrowTerm.bottom);
    expect(Number.parseFloat(getComputedStyle(term).paddingInlineEnd)).toBeGreaterThanOrEqual(44);
    expect(entry.scrollWidth).toBe(entry.clientWidth);
    expect(window.innerWidth).toBe(900);
  });

  it("lets Course appearance recolour content without recolouring the App-owned delete action", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <AppThemeProvider appearance="light">
        <main>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
            <GlossarySpecimen label="Light glossary" />
          </CourseThemeProvider>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="dark">
            <GlossarySpecimen label="Dark glossary" />
          </CourseThemeProvider>
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelectorAll(".sc-course-glossary__term").length === 2);
    const terms = host.querySelectorAll<HTMLElement>(".sc-course-glossary__term");
    const deletes = host.querySelectorAll<HTMLElement>(".sc-app-glossary-delete");

    expect(getComputedStyle(terms[0]!).color).not.toBe(getComputedStyle(terms[1]!).color);
    expect(getComputedStyle(deletes[0]!).color).toBe(getComputedStyle(deletes[1]!).color);
  });
});

function GlossarySpecimen({ label = "Glossary" }: { label?: string }) {
  return (
    <div className="sc-course-glossary">
      <section data-node="glossary" className="sc-course-glossary__section" aria-label={label}>
        <dl className="sc-course-glossary__list">
          <div data-node="glossary-entry" className="sc-course-glossary__entry">
            <dt data-slot="glossary-term" className="sc-course-glossary__term">
              <p>Photosynthesis</p>
            </dt>
            <dd data-slot="glossary-definition" className="sc-course-glossary__definition">
              <p>The process plants use to convert light into chemical energy.</p>
            </dd>
            <button type="button" className="sc-app-glossary-delete" aria-label="Delete term 1">
              Delete
            </button>
          </div>
        </dl>
        <button type="button" className="sc-app-glossary-add">
          Add term
        </button>
      </section>
    </div>
  );
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}

function computedColor(value: string, property: "color" | "background" = "color"): string {
  const probe = document.createElement("span");
  probe.style[property] = value;
  document.body.append(probe);
  const resolved = getComputedStyle(probe)[property === "background" ? "backgroundColor" : "color"];
  probe.remove();
  return resolved;
}

function computedLength(value: string): number {
  const probe = document.createElement("span");
  probe.style.borderRadius = value;
  document.body.append(probe);
  const resolved = Number.parseFloat(getComputedStyle(probe).borderTopLeftRadius);
  probe.remove();
  return resolved;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for Glossary state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
