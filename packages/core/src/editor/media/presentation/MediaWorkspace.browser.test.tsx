import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import { MediaWorkspace } from "./MediaWorkspace";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("MediaWorkspace geometry", () => {
  it("keeps wide canvas and sidebar panels finite beside each other with list-owned overflow", async () => {
    await page.viewport(1400, 900);
    const sample = await mountWorkspace("74rem", "38rem");

    const rootRect = sample.workspace.getBoundingClientRect();
    const canvasRect = sample.canvas.getBoundingClientRect();
    const sidebarRect = sample.sidebar.getBoundingClientRect();

    expect(canvasRect.right).toBeLessThan(sidebarRect.left);
    expect(canvasRect.top).toBeCloseTo(sidebarRect.top, 0);
    expect(canvasRect.bottom).toBeCloseTo(sidebarRect.bottom, 0);
    expect(canvasRect.top).toBeGreaterThan(rootRect.top);
    expect(canvasRect.bottom).toBeLessThan(rootRect.bottom);
    expect(sample.workspace.scrollHeight).toBeLessThanOrEqual(sample.workspace.clientHeight + 1);
    expect(sample.sidebar.scrollHeight).toBeLessThanOrEqual(sample.sidebar.clientHeight + 1);
    expect(getComputedStyle(sample.list).overflowY).toBe("auto");
    expect(sample.list.scrollHeight).toBeGreaterThan(sample.list.clientHeight);
  });

  it("stacks useful finite panels in a narrow container and only falls back to outer scrolling when short", async () => {
    await page.viewport(1000, 900);
    const sample = await mountWorkspace("40rem", "44rem");

    await waitForCondition(
      () =>
        sample.sidebar.getBoundingClientRect().top > sample.canvas.getBoundingClientRect().bottom,
    );

    const canvasRect = sample.canvas.getBoundingClientRect();
    const sidebarRect = sample.sidebar.getBoundingClientRect();

    expect(canvasRect.width).toBeCloseTo(sidebarRect.width, 0);
    expect(canvasRect.height).toBeGreaterThanOrEqual(18 * 16 - 1);
    expect(sidebarRect.height).toBeGreaterThanOrEqual(16 * 16 - 1);
    expect(sidebarRect.height).toBeLessThanOrEqual(20 * 16 + 1);
    expect(sample.layout.scrollHeight).toBeLessThanOrEqual(sample.layout.clientHeight + 1);
    expect(sample.list.scrollHeight).toBeGreaterThan(sample.list.clientHeight);
    expect(getComputedStyle(sample.list).overflowY).toBe("auto");

    sample.host.style.height = "28rem";
    await waitForCondition(() => sample.layout.scrollHeight > sample.layout.clientHeight);

    expect(getComputedStyle(sample.layout).overflowY).toBe("auto");
    expect(sample.layout.scrollHeight).toBeGreaterThan(sample.layout.clientHeight);
    expect(sample.sidebar.getBoundingClientRect().height).toBeLessThanOrEqual(20 * 16 + 1);
    expect(sample.list.scrollHeight).toBeGreaterThan(sample.list.clientHeight);
  });
});

interface WorkspaceSample {
  canvas: HTMLElement;
  host: HTMLElement;
  layout: HTMLElement;
  list: HTMLOListElement;
  sidebar: HTMLElement;
  workspace: HTMLElement;
}

async function mountWorkspace(width: string, height: string): Promise<WorkspaceSample> {
  const host = document.createElement("div");
  host.style.display = "flex";
  host.style.flexDirection = "column";
  host.style.width = width;
  host.style.height = height;
  document.body.append(host);

  const root = createRoot(host);
  mountedRoots.push(root);
  root.render(
    <MediaWorkspace.Root data-browser-workspace>
      <MediaWorkspace.Canvas aria-label="Media canvas">
        <div>Canvas content</div>
      </MediaWorkspace.Canvas>
      <MediaWorkspace.Sidebar aria-label="Media management">
        <MediaWorkspace.SidebarHeader
          title="Items"
          description="Select an item to edit it."
          count={24}
          countLabel="24 total items"
        />
        <MediaWorkspace.List aria-label="Media items">
          {Array.from({ length: 24 }, (_, index) => (
            <MediaWorkspace.Item key={index} selected={index === 0}>
              <MediaWorkspace.ItemHeader>
                <MediaWorkspace.ItemSelect aria-label={`Select item ${index + 1}`}>
                  <MediaWorkspace.ItemNumber aria-hidden>{index + 1}</MediaWorkspace.ItemNumber>
                  Item {index + 1}
                </MediaWorkspace.ItemSelect>
              </MediaWorkspace.ItemHeader>
            </MediaWorkspace.Item>
          ))}
        </MediaWorkspace.List>
      </MediaWorkspace.Sidebar>
    </MediaWorkspace.Root>,
  );

  await waitForCondition(() => host.querySelector("[data-browser-workspace]"));

  const workspace = requiredElement<HTMLElement>(host, "[data-browser-workspace]");
  const layout = workspace.firstElementChild;
  if (!(layout instanceof HTMLElement)) throw new Error("Expected the MediaWorkspace layout.");

  return {
    canvas: requiredElement<HTMLElement>(workspace, '[aria-label="Media canvas"]'),
    host,
    layout,
    list: requiredElement<HTMLOListElement>(workspace, '[aria-label="Media items"]'),
    sidebar: requiredElement<HTMLElement>(workspace, '[aria-label="Media management"]'),
    workspace,
  };
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for workspace geometry.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
