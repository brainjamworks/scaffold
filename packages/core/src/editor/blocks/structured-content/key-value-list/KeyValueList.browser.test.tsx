import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import "./KeyValueList.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Key-Value List presentation", () => {
  it("preserves wide layouts and collapses through its container query", async () => {
    const host = document.createElement("div");
    host.style.width = "600px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <div className="sc-key-value-list" data-layout="grid" data-key-width="wide">
        <div className="sc-key-value-list__rows">
          <div className="sc-key-value-list__content">
            <div className="sc-key-value-list__row">
              <div className="sc-key-value-list__key">Duration</div>
              <div className="sc-key-value-list__value">Six weeks</div>
            </div>
            <div className="sc-key-value-list__row">
              <div className="sc-key-value-list__key">Level</div>
              <div className="sc-key-value-list__value">Intermediate</div>
            </div>
          </div>
        </div>
      </div>,
    );

    await waitForCondition(() => host.querySelector(".sc-key-value-list"));
    const list = requiredElement<HTMLElement>(host, ".sc-key-value-list");
    const content = requiredElement<HTMLElement>(list, ".sc-key-value-list__content");
    const row = requiredElement<HTMLElement>(content, ".sc-key-value-list__row");
    const key = requiredElement<HTMLElement>(row, ".sc-key-value-list__key");
    const value = requiredElement<HTMLElement>(row, ".sc-key-value-list__value");

    expect(getComputedStyle(list).containerType).toBe("inline-size");
    expect(getComputedStyle(content).display).toBe("grid");
    expect(getComputedStyle(row).display).toBe("contents");
    expect(key.getBoundingClientRect().width).toBeCloseTo(180, 0);
    expect(value.getBoundingClientRect().width).toBeCloseTo(400, 0);
    expect(getComputedStyle(key).textAlign).toBe("right");

    host.style.width = "320px";
    await waitForCondition(() => getComputedStyle(content).display === "flex");
    expect(getComputedStyle(content).flexDirection).toBe("column");
    expect(getComputedStyle(row).display).toBe("flex");
    expect(getComputedStyle(row).flexDirection).toBe("column");
    expect(getComputedStyle(key).textAlign).toBe("left");

    host.style.width = "600px";
    list.dataset["layout"] = "inline";
    list.dataset["keyWidth"] = "medium";
    await waitForCondition(
      () =>
        getComputedStyle(content).display === "flex" && getComputedStyle(row).display === "flex",
    );
    expect(getComputedStyle(row).flexDirection).toBe("row");
    expect(key.getBoundingClientRect().width).toBeCloseTo(120, 0);
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
      throw new Error("Timed out waiting for Key-Value List state.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
