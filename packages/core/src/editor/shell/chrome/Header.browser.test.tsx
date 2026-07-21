import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/editor/shell/authoring/ScaffoldAuthoringApp.css";

import { Header } from "./Header";

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
});

describe("Header responsive geometry", () => {
  it("uses icon-only actions without creating page-level overflow in a narrow host", async () => {
    await page.viewport(800, 600);
    const sample = await mountHeader(393);

    expect(sample.header.scrollWidth).toBeLessThanOrEqual(sample.header.clientWidth + 1);
    expect(getComputedStyle(sample.title).display).toBe("none");
    for (const label of sample.labels) {
      expect(getComputedStyle(label).display).toBe("none");
    }
    for (const action of sample.actions) {
      expect(action.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      expect(action.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  });

  it("keeps action labels visible when the header has room", async () => {
    await page.viewport(1000, 600);
    const sample = await mountHeader(800);

    for (const label of sample.labels) {
      expect(getComputedStyle(label).display).not.toBe("none");
    }
  });
});

async function mountHeader(width: number) {
  host = document.createElement("div");
  host.style.width = `${width}px`;
  document.body.append(host);

  root = createRoot(host);
  root.render(
    <Header
      title="Untitled"
      onTitleChange={() => {}}
      actions={
        <div className="sc-scaffold-authoring-actions">
          {[
            ["Reset playground", "Reset"],
            ["Show Scaffold Agent", "Agent"],
            ["Switch to preview", "Preview"],
          ].map(([accessibleName, label]) => (
            <button
              key={accessibleName}
              type="button"
              aria-label={accessibleName}
              className="sc-scaffold-authoring-action"
              data-compact-label
            >
              <span aria-hidden="true">+</span>
              <span className="sc-scaffold-authoring-action-label">{label}</span>
            </button>
          ))}
        </div>
      }
    />,
  );

  await waitForCondition(() => host?.querySelector(".sc-editor-header"));

  return {
    actions: Array.from(host.querySelectorAll<HTMLElement>(".sc-scaffold-authoring-action")),
    header: requireElement<HTMLElement>(host, ".sc-editor-header"),
    labels: Array.from(host.querySelectorAll<HTMLElement>(".sc-scaffold-authoring-action-label")),
    title: requireElement<HTMLElement>(host, ".sc-editor-header-title"),
  };
}

function requireElement<T extends Element>(rootElement: ParentNode, selector: string): T {
  const element = rootElement.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for responsive header");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
