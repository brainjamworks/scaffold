import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/editor/shell/authoring/ScaffoldAuthoringApp.css";

import { Header } from "./Header";
import { AuthoringPublishAction } from "./AuthoringPublishAction";

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
});

describe("AuthoringPublishAction in the authoring header", () => {
  it("keeps host slots ordered, the blocked action discoverable, and narrow geometry contained", async () => {
    await page.viewport(800, 600);
    host = document.createElement("div");
    host.style.width = "393px";
    document.body.append(host);

    root = createRoot(host);
    root.render(
      <Header
        actions={
          <div className="sc-scaffold-authoring-actions">
            <button className="sc-scaffold-authoring-action" type="button">
              Save
            </button>
            <AuthoringPublishAction onPublish={() => {}} publishState="forbidden" />
            <button className="sc-scaffold-authoring-action" type="button">
              Done
            </button>
          </div>
        }
        onTitleChange={() => {}}
        title="Untitled"
      />,
    );

    await waitForCondition(() => host?.querySelector(".sc-app-publish-action"));

    const actions = Array.from(host.querySelectorAll<HTMLButtonElement>("button"));
    const save = actions.find((action) => action.textContent === "Save")!;
    const publish = actions.find((action) => action.textContent === "Publish")!;
    const done = actions.find((action) => action.textContent === "Done")!;
    const header = host.querySelector<HTMLElement>(".sc-editor-header")!;

    expect(save.compareDocumentPosition(publish) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(publish.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(publish).toHaveAttribute("aria-disabled", "true");
    expect(publish).toHaveAccessibleDescription("Publishing is not permitted.");
    expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth + 1);

    await userEvent.tab();
    await userEvent.tab();
    expect(publish).toHaveFocus();
  });
});

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for the publish action");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
