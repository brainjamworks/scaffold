import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/theme/app/AppThemeProvider.css";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

import { emptyEmbedData } from "./embed-data";
import { EmbedSurface } from "./EmbedSurface";
import "./EmbedAuthoringControls.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Embed presentation", () => {
  it("keeps the empty-state composition intact without Scaffold Flow layout rules", async () => {
    const application = document.createElement("div");
    application.className = "sc-app";
    const host = document.createElement("div");
    host.className = "radix-themes sc-course sc-course-theme-pocket-atlas-v1";
    host.style.width = "480px";
    application.append(host);
    document.body.append(application);

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

    await waitForCondition(() => host.querySelector(".sc-course-embed__empty"));
    const empty = requiredElement<HTMLElement>(host, ".sc-course-embed__empty");
    const chip = requiredElement<HTMLElement>(empty, ".sc-course-embed__empty-chip");
    const text = requiredElement<HTMLElement>(empty, ".sc-course-embed__empty-text");
    const form = requiredElement<HTMLFormElement>(empty, ".sc-app-embed__form");

    expect(getComputedStyle(empty).display).toBe("grid");
    expect(getComputedStyle(empty).gridTemplateColumns).not.toBe("none");
    expect(getComputedStyle(chip).display).toBe("flex");
    expect(getComputedStyle(text).display).toBe("flex");
    expect(getComputedStyle(form).gridColumnStart).toBe("1");
    expect(getComputedStyle(form).gridColumnEnd).toBe("-1");
  });

  it("stacks shared empty-state content and App controls in a narrow Embed", async () => {
    const application = document.createElement("div");
    application.className = "sc-app";
    const host = document.createElement("div");
    host.className = "radix-themes sc-course sc-course-theme-pocket-atlas-v1";
    host.style.width = "300px";
    application.append(host);
    document.body.append(application);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <EmbedSurface data={emptyEmbedData()} editable onSubmit={() => undefined} />,
    );

    await waitForCondition(() => host.querySelector(".sc-course-embed__empty"));
    const empty = requiredElement<HTMLElement>(host, ".sc-course-embed__empty");
    const form = requiredElement<HTMLFormElement>(empty, ".sc-app-embed__form");

    expect(getComputedStyle(empty).gridTemplateColumns.split(" ")).toHaveLength(1);
    expect(getComputedStyle(empty).justifyItems).toBe("center");
    expect(getComputedStyle(empty).textAlign).toBe("center");
    expect(getComputedStyle(form).flexDirection).toBe("column");
  });

  it("gives Pocket Atlas learner Embed states an intentional Course treatment", async () => {
    const host = document.createElement("div");
    host.className = "radix-themes sc-course sc-course-theme-pocket-atlas-v1";
    host.style.width = "480px";
    host.style.setProperty("--heading-font-family", '"Silkscreen", sans-serif');
    host.style.setProperty("--default-font-family", '"Atkinson Hyperlegible", sans-serif');
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <EmbedSurface
        data={emptyEmbedData({ caption: "A supporting embedded resource" })}
        editable={false}
      />,
    );

    await waitForCondition(() => host.querySelector(".sc-course-embed__state"));
    const figure = requiredElement<HTMLElement>(host, ".sc-course-embed__figure");
    const empty = requiredElement<HTMLElement>(host, ".sc-course-embed__empty");
    const chip = requiredElement<HTMLElement>(empty, ".sc-course-embed__empty-chip");
    const title = requiredElement<HTMLElement>(empty, ".sc-course-embed__empty-title");
    const hint = requiredElement<HTMLElement>(empty, ".sc-course-embed__empty-hint");
    const caption = requiredElement<HTMLElement>(figure, ".sc-course-embed__caption");

    expect(getComputedStyle(figure).gap).toBe("12px");
    expect(getComputedStyle(empty).padding).toBe("16px");
    expect(getComputedStyle(empty).gap).toBe("12px");
    expect(getComputedStyle(chip).borderTopWidth).toBe("2px");
    expect(getComputedStyle(chip).backgroundColor).toBe("rgb(255, 200, 87)");
    expect(getComputedStyle(chip).boxShadow).not.toBe("none");
    expect(getComputedStyle(title).fontFamily).toContain("Silkscreen");
    expect(getComputedStyle(hint).fontFamily).toContain("Atkinson Hyperlegible");
    expect(getComputedStyle(caption).textAlign).toBe("center");
  });

  it("distinguishes an unavailable Pocket Atlas Embed from an empty one", async () => {
    const host = document.createElement("div");
    host.className = "radix-themes sc-course sc-course-theme-pocket-atlas-v1";
    host.style.width = "480px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <EmbedSurface
        data={emptyEmbedData({ url: "https://example.com/not-supported" })}
        editable={false}
      />,
    );

    await waitForCondition(() => host.querySelector(".sc-course-embed__state--error"));
    const state = requiredElement<HTMLElement>(host, ".sc-course-embed__state--error");
    const chip = requiredElement<HTMLElement>(state, ".sc-course-embed__empty-chip");

    expect(state.dataset["courseState"]).toBe("error");
    expect(getComputedStyle(state).backgroundColor).not.toBe("rgb(255, 255, 255)");
    expect(getComputedStyle(chip).backgroundColor).toBe("rgb(243, 93, 117)");
  });

  it("keeps the empty shell Course-owned and its author controls App-owned", async () => {
    const application = document.createElement("div");
    application.className = "sc-app";
    const host = document.createElement("div");
    host.className = "radix-themes sc-course sc-course-theme-scaffold-flow-v1";
    host.style.width = "480px";
    host.style.setProperty("--gray-a2", "rgb(12 34 56)");
    application.append(host);
    document.body.append(application);

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

    await waitForCondition(() => host.querySelector(".sc-course-embed__empty"));
    const empty = requiredElement<HTMLElement>(host, ".sc-course-embed__empty");
    const chip = requiredElement<HTMLElement>(empty, ".sc-course-embed__empty-chip");
    const form = requiredElement<HTMLFormElement>(empty, ".sc-app-embed__form");
    const input = requiredElement<HTMLInputElement>(form, ".sc-app-embed__input");
    const submit = requiredElement<HTMLButtonElement>(form, ".sc-app-embed__submit");

    expect(getComputedStyle(empty).display).toBe("grid");
    expect(chip.getBoundingClientRect().width).toBeCloseTo(40, 0);
    expect(chip.getBoundingClientRect().height).toBeCloseTo(40, 0);
    expect(getComputedStyle(form).gridColumnStart).toBe("1");
    expect(getComputedStyle(form).gridColumnEnd).toBe("-1");
    expect(input.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(submit.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);

    await userEvent.tab();
    expect(document.activeElement).toBe(input);
    await waitForCondition(() => getComputedStyle(input).outlineStyle !== "none");
    expect(getComputedStyle(input).outlineWidth).toBe("2px");

    expect(getComputedStyle(empty).backgroundColor).toBe("rgb(12, 34, 56)");
  });

  it("uses compact provider geometry without horizontal overflow", async () => {
    const host = document.createElement("div");
    host.className = "radix-themes sc-course sc-course-theme-scaffold-flow-v1";
    host.style.width = "247px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <EmbedSurface
        data={{
          ...emptyEmbedData(),
          url: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
          provider: "spotify",
          sizingMode: "provider",
        }}
        editable={false}
      />,
    );

    await waitForCondition(() => host.querySelector(".sc-course-embed__frame"));
    const frame = requiredElement<HTMLElement>(host, ".sc-course-embed__frame");

    expect(frame.getBoundingClientRect().height).toBeCloseTo(80, 0);
    expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    );
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
