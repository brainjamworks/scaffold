import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import { emptyEmbedData } from "./embed-data";
import { EmbedSurface } from "./EmbedSurface";

const mountedRoots: Root[] = [];
const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Embed presentation", () => {
  it("preserves the empty editor while allowing adapter-layer overrides", async () => {
    const adapterStyles = document.createElement("style");
    adapterStyles.textContent = `
      @layer sc-adapters {
        .sc-embed__empty {
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
      <EmbedSurface
        data={emptyEmbedData()}
        editable
        onSubmit={() => {
          // The presentation test does not submit the form.
        }}
      />,
    );

    await waitForCondition(() => host.querySelector(".sc-embed__empty"));
    const empty = requiredElement<HTMLElement>(host, ".sc-embed__empty");
    const chip = requiredElement<HTMLElement>(empty, ".sc-embed__empty-chip");
    const form = requiredElement<HTMLFormElement>(empty, ".sc-embed__empty-form");
    const input = requiredElement<HTMLInputElement>(form, ".sc-embed__empty-input");

    expect(getComputedStyle(empty).display).toBe("grid");
    expect(chip.getBoundingClientRect().width).toBeCloseTo(40, 0);
    expect(chip.getBoundingClientRect().height).toBeCloseTo(40, 0);
    expect(getComputedStyle(form).gridColumnStart).toBe("1");
    expect(getComputedStyle(form).gridColumnEnd).toBe("-1");

    await userEvent.click(input);
    await waitForCondition(() => getComputedStyle(input).boxShadow !== "none");
    expect(getComputedStyle(input).boxShadow).not.toBe("none");

    expect(getComputedStyle(empty).backgroundColor).toBe("rgb(12, 34, 56)");
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
      throw new Error("Timed out waiting for Embed state.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
