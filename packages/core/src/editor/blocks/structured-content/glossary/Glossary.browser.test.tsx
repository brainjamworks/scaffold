import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import "./Glossary.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Glossary presentation", () => {
  it("preserves desktop alignment, delete reveal, and narrow reflow", async () => {
    await page.viewport(900, 700);
    const host = document.createElement("div");
    host.style.width = "800px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <div className="sc-glossary">
        <section className="sc-glossary__section" aria-label="Glossary">
          <div className="sc-glossary__list">
            <div className="sc-glossary__entry">
              <div className="sc-glossary__term">
                <p>Photosynthesis</p>
              </div>
              <div className="sc-glossary__definition">
                <p>The process plants use to convert light into chemical energy.</p>
              </div>
              <button type="button" className="sc-glossary__delete" aria-label="Delete term 1">
                Delete
              </button>
            </div>
          </div>
        </section>
      </div>,
    );

    await waitForCondition(() => host.querySelector(".sc-glossary__entry"));
    const entry = requiredElement<HTMLElement>(host, ".sc-glossary__entry");
    const term = requiredElement<HTMLElement>(entry, ".sc-glossary__term");
    const definition = requiredElement<HTMLElement>(entry, ".sc-glossary__definition");
    const deleteButton = requiredElement<HTMLButtonElement>(entry, ".sc-glossary__delete");

    const desktopTerm = term.getBoundingClientRect();
    const desktopDefinition = definition.getBoundingClientRect();
    expect(getComputedStyle(entry).display).toBe("grid");
    expect(desktopTerm.width).toBeCloseTo(176, 0);
    expect(desktopDefinition.left - desktopTerm.right).toBeCloseTo(24, 0);
    expect(Math.abs(desktopDefinition.top - desktopTerm.top)).toBeLessThanOrEqual(2);
    expect(getComputedStyle(deleteButton).opacity).toBe("0");

    await userEvent.hover(entry);
    await waitForCondition(() => getComputedStyle(deleteButton).opacity === "0.6");
    expect(getComputedStyle(deleteButton).opacity).toBe("0.6");
    await userEvent.unhover(entry);

    await page.viewport(600, 700);
    host.style.width = "560px";
    await waitForCondition(() => getComputedStyle(definition).gridRowStart === "2");
    const narrowTerm = term.getBoundingClientRect();
    const narrowDefinition = definition.getBoundingClientRect();
    expect(narrowDefinition.left).toBeCloseTo(narrowTerm.left, 0);
    expect(narrowDefinition.top).toBeGreaterThanOrEqual(narrowTerm.bottom);
    expect(getComputedStyle(deleteButton).gridColumnStart).toBe("2");
    expect(getComputedStyle(deleteButton).gridRowStart).toBe("1");
  });
});

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
