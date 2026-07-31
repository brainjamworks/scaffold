import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import "./NumberedList.css";

const mountedRoots: Root[] = [];
const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Numbered List presentation", () => {
  it("preserves list geometry while allowing adapter-layer overrides", async () => {
    const adapterStyles = document.createElement("style");
    adapterStyles.textContent = `
      @layer sc-adapters {
        .sc-numbered-list__marker {
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
      <div className="sc-numbered-list">
        <section className="sc-numbered-list__section" aria-label="Numbered list">
          <div className="sc-numbered-list__items">
            <div className="sc-numbered-list__title">
              <span className="sc-numbered-list__header-icon" aria-hidden>
                #
              </span>
              <div className="sc-numbered-list__title-content">Launch checklist</div>
            </div>
            <div className="sc-numbered-list__item">
              <div className="sc-numbered-list__item-shell">
                <button
                  type="button"
                  className="sc-numbered-list__marker sc-numbered-list__marker--neutral"
                  aria-label="Change item 1 status"
                >
                  1
                </button>
                <div className="sc-numbered-list__item-content">Publish the course</div>
                <button
                  type="button"
                  className="sc-numbered-list__delete"
                  aria-label="Delete item 1"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>,
    );

    await waitForCondition(() => host.querySelector(".sc-numbered-list__marker"));
    const items = requiredElement<HTMLElement>(host, ".sc-numbered-list__items");
    const marker = requiredElement<HTMLButtonElement>(items, ".sc-numbered-list__marker");
    const content = requiredElement<HTMLElement>(items, ".sc-numbered-list__item-content");
    const item = requiredElement<HTMLElement>(items, ".sc-numbered-list__item");
    const deleteButton = requiredElement<HTMLButtonElement>(item, ".sc-numbered-list__delete");

    const markerRect = marker.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    expect(markerRect.width).toBeCloseTo(36, 0);
    expect(markerRect.height).toBeCloseTo(36, 0);
    expect(contentRect.left - markerRect.right).toBeCloseTo(14, 0);
    expect(getComputedStyle(items, "::before").width).toBe("1px");
    expect(getComputedStyle(deleteButton).opacity).toBe("0");

    await userEvent.hover(item);
    await waitForCondition(() => getComputedStyle(deleteButton).opacity === "0.6");
    expect(getComputedStyle(deleteButton).opacity).toBe("0.6");

    expect(getComputedStyle(marker).backgroundColor).toBe("rgb(12, 34, 56)");
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
      throw new Error("Timed out waiting for Numbered List state.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
