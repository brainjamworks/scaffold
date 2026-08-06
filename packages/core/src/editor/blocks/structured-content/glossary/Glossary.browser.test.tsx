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
  it("keeps its row recipe and App controls correct when only the container narrows", async () => {
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
    const application = requiredElement<HTMLElement>(host, ".sc-app");
    application.style.setProperty("--sc-app-color-text-muted", "rgb(82 82 91)");
    application.style.setProperty("--sc-app-color-error", "rgb(185 28 28)");
    application.style.setProperty("--sc-app-color-error-background", "rgb(254 226 226)");

    const entry = requiredElement<HTMLElement>(host, ".sc-course-glossary__entry");
    const term = requiredElement<HTMLElement>(entry, ".sc-course-glossary__term");
    const definition = requiredElement<HTMLElement>(entry, ".sc-course-glossary__definition");
    const deleteButton = requiredElement<HTMLButtonElement>(entry, ".sc-app-glossary-delete");
    const addButton = requiredElement<HTMLButtonElement>(host, ".sc-app-glossary-add");

    const desktopTerm = term.getBoundingClientRect();
    const desktopDefinition = definition.getBoundingClientRect();
    expect(getComputedStyle(entry).display).toBe("grid");
    expect(desktopTerm.width).toBeCloseTo(176, 0);
    expect(desktopDefinition.left - desktopTerm.right).toBeCloseTo(24, 0);
    expect(Math.abs(desktopDefinition.top - desktopTerm.top)).toBeLessThanOrEqual(2);
    expect(getComputedStyle(deleteButton).opacity).toBe("1");
    expect(getComputedStyle(deleteButton).color).toBe("rgb(82, 82, 91)");
    expect(addButton.querySelector("svg")).toBeNull();

    await userEvent.hover(deleteButton);
    await waitForCondition(() => getComputedStyle(deleteButton).color === "rgb(185, 28, 28)");

    await userEvent.unhover(deleteButton);
    deleteButton.focus();
    await waitForCondition(() => getComputedStyle(deleteButton).color === "rgb(185, 28, 28)");

    host.style.width = "560px";
    await waitForCondition(() => getComputedStyle(definition).gridRowStart === "2");
    const narrowTerm = term.getBoundingClientRect();
    const narrowDefinition = definition.getBoundingClientRect();
    expect(narrowDefinition.left).toBeCloseTo(narrowTerm.left, 0);
    expect(narrowDefinition.top).toBeGreaterThanOrEqual(narrowTerm.bottom);
    expect(window.innerWidth).toBe(900);
  });

  it("lets Course appearance recolour content without recolouring App controls", async () => {
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

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for Glossary state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
