import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import { ResourceLinkSurface } from "./ResourceLinkSurface";

const mountedRoots: Root[] = [];
const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Resource Link presentation", () => {
  it("preserves the runtime card while allowing adapter-layer overrides", async () => {
    const adapterStyles = document.createElement("style");
    adapterStyles.textContent = `
      @layer sc-adapters {
        .sc-resource-link {
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
      <ResourceLinkSurface
        data={{
          type: "resource_link",
          url: "https://docs.example.com/course",
          kind: "article",
          showDescription: true,
        }}
        editable={false}
      >
        <div className="sc-resource-link__title">Course guide</div>
        <div className="sc-resource-link__description">Read before starting the course.</div>
      </ResourceLinkSurface>,
    );

    await waitForCondition(() => host.querySelector(".sc-resource-link"));
    const link = requiredElement<HTMLAnchorElement>(host, ".sc-resource-link");
    const kindIcon = requiredElement<HTMLElement>(link, ".sc-resource-link__kind-icon");
    const body = requiredElement<HTMLElement>(link, ".sc-resource-link__body");
    const openIcon = requiredElement<HTMLElement>(link, ".sc-resource-link__open-icon");

    expect(getComputedStyle(link).display).toBe("grid");
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

    expect(getComputedStyle(link).backgroundColor).toBe("rgb(12, 34, 56)");
  });
});

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

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error("Timed out waiting for Resource Link state.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
