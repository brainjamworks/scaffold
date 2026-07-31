import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import "./Checklist.css";

const mountedRoots: Root[] = [];
const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Checklist presentation", () => {
  it("preserves item states while allowing adapter-layer overrides", async () => {
    const adapterStyles = document.createElement("style");
    adapterStyles.textContent = `
      @layer sc-adapters {
        .sc-checklist__section {
          background: rgb(12 34 56);
        }
      }
    `;
    document.head.append(adapterStyles);
    mountedStyles.push(adapterStyles);

    const host = document.createElement("div");
    host.style.width = "480px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <div className="sc-checklist">
        <section className="sc-checklist__section" aria-label="Checklist">
          <header className="sc-checklist__header">
            <span className="sc-checklist__progress">
              <span className="sc-checklist__progress-count">1</span>
              <span className="sc-checklist__progress-divider">/</span>
              <span className="sc-checklist__progress-total">2</span>
              <span className="sc-checklist__progress-label">complete</span>
            </span>
          </header>
          <ul role="list" className="sc-checklist__list">
            <li role="listitem" className="sc-checklist-item" data-checked="false">
              <div className="sc-checklist-item__shell">
                <button type="button" className="sc-checklist-item__drag" aria-label="Move item">
                  Move
                </button>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked="false"
                  className="sc-checklist-item__checkbox"
                  aria-label="Mark item as complete"
                />
                <div className="sc-checklist-item__text">Draft the course</div>
                <button
                  type="button"
                  className="sc-checklist-item__delete"
                  aria-label="Delete item"
                >
                  Delete
                </button>
              </div>
            </li>
            <li role="listitem" className="sc-checklist-item" data-checked="true">
              <div className="sc-checklist-item__shell">
                <span className="sc-checklist-item__drag" aria-hidden />
                <button
                  type="button"
                  role="checkbox"
                  aria-checked="true"
                  className="sc-checklist-item__checkbox"
                  aria-label="Mark item as incomplete"
                >
                  ✓
                </button>
                <div className="sc-checklist-item__text">Review the course</div>
                <span />
              </div>
            </li>
          </ul>
        </section>
      </div>,
    );

    await waitForCondition(() => host.querySelector(".sc-checklist-item__checkbox"));
    const section = requiredElement<HTMLElement>(host, ".sc-checklist__section");
    const firstItem = requiredElement<HTMLElement>(
      host,
      '.sc-checklist-item[data-checked="false"]',
    );
    const firstShell = requiredElement<HTMLElement>(firstItem, ".sc-checklist-item__shell");
    const firstCheckbox = requiredElement<HTMLButtonElement>(
      firstItem,
      ".sc-checklist-item__checkbox",
    );
    const drag = requiredElement<HTMLButtonElement>(firstItem, ".sc-checklist-item__drag");
    const deleteButton = requiredElement<HTMLButtonElement>(
      firstItem,
      ".sc-checklist-item__delete",
    );
    const checkedItem = requiredElement<HTMLElement>(
      host,
      '.sc-checklist-item[data-checked="true"]',
    );
    const checkedCheckbox = requiredElement<HTMLButtonElement>(
      checkedItem,
      ".sc-checklist-item__checkbox",
    );
    const checkedText = requiredElement<HTMLElement>(checkedItem, ".sc-checklist-item__text");

    expect(getComputedStyle(firstShell).display).toBe("grid");
    expect(firstCheckbox.getBoundingClientRect().width).toBeCloseTo(18, 0);
    expect(firstCheckbox.getBoundingClientRect().height).toBeCloseTo(18, 0);
    expect(getComputedStyle(drag).opacity).toBe("0");
    expect(getComputedStyle(deleteButton).opacity).toBe("0");
    expect(getComputedStyle(checkedCheckbox).backgroundColor).toBe(
      getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim(),
    );
    expect(getComputedStyle(checkedText).textDecorationLine).toContain("line-through");

    await userEvent.hover(firstItem);
    await waitForCondition(
      () =>
        getComputedStyle(drag).opacity === "1" && getComputedStyle(deleteButton).opacity === "1",
    );
    expect(getComputedStyle(drag).opacity).toBe("1");
    expect(getComputedStyle(deleteButton).opacity).toBe("1");

    expect(getComputedStyle(section).backgroundColor).toBe("rgb(12, 34, 56)");
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
    if (performance.now() > deadline) {
      throw new Error("Timed out waiting for Checklist state.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
