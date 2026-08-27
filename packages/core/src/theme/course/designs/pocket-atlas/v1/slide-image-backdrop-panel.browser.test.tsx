import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { AuthoringSurfaceView } from "@/editor/surfaces/authoring/views/AuthoringSurfaceView";
import { RuntimeSurfaceView } from "@/editor/surfaces/runtime/views/RuntimeSurfaceView";
import "@/editor/surfaces/view/variants/slide-layout.css";
import "@/styles/globals.css";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";

import "./theme.css";

let root: Root | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

describe("Pocket Atlas image backdrop panel recipe", () => {
  it.each(["light", "dark"] as const)(
    "keeps the learner panel legible and aligned in %s mode",
    async (appearance) => {
      const host = renderImageBackdropPanel(appearance);

      await waitForCondition(
        () => host.querySelector('[data-testid="authoring-backdrop-panel"]') !== null,
      );

      const courseRoot = requiredElement<HTMLElement>(host, ".sc-course");
      const authoringPanel = requiredElement<HTMLElement>(
        host,
        '[data-testid="authoring-backdrop-panel"] > [data-node-view-content-react]',
      );
      const runtimePanel = requiredElement<HTMLElement>(
        host,
        '[data-testid="runtime-backdrop-panel"] > [data-surface-content]',
      );
      const authoringTitle = requiredElement<HTMLElement>(
        authoringPanel,
        '[data-slot="slide-title"]',
      );
      const authoringStyle = getComputedStyle(authoringPanel);
      const runtimeStyle = getComputedStyle(runtimePanel);
      const expectedBackground = resolveCssColour(courseRoot, "--pa-paper-raised");
      const expectedForeground = resolveCssColour(courseRoot, "--pa-ink");

      expect(authoringStyle.backgroundColor).toBe(expectedBackground);
      expect(authoringStyle.color).toBe(expectedForeground);
      expect(authoringStyle.borderTopWidth).toBe("2px");
      expect(authoringStyle.borderRadius).toBe("0px");
      expect(authoringStyle.boxShadow).not.toBe("none");
      expect(runtimeStyle.backgroundColor).toBe(authoringStyle.backgroundColor);
      expect(runtimeStyle.color).toBe(authoringStyle.color);
      expect(runtimeStyle.border).toBe(authoringStyle.border);
      expect(runtimeStyle.boxShadow).toBe(authoringStyle.boxShadow);
      expect(
        contrastRatio(parseRgb(authoringStyle.color), parseRgb(authoringStyle.backgroundColor)),
      ).toBeGreaterThanOrEqual(4.5);
      expect(Number.parseFloat(getComputedStyle(authoringTitle).fontSize)).toBeLessThanOrEqual(28);
      expect(authoringPanel.querySelector('[class*="sc-app-"]')).toBeNull();
      expect(runtimePanel.querySelector('[class*="sc-app-"]')).toBeNull();
    },
  );
});

const slideshowSettings = {
  mode: "slideshow",
  overflowMode: "clip",
  surfaceSize: "16x9",
} as const;

function renderImageBackdropPanel(appearance: "light" | "dark"): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  root.render(
    <CourseThemeProvider
      appearance={appearance}
      theme={{
        schemaVersion: 1,
        design: { id: "pocket-atlas", revision: "1" },
        colourSystem: { id: "pocket-atlas", revision: "1" },
        overrides: {},
      }}
    >
      <div style={{ width: 1024 }}>
        <AuthoringSurfaceView settings={slideshowSettings}>
          <div className="sc-slideshow-authoring-surface-stage">
            <ImageBackdropPanel renderer="authoring" />
          </div>
        </AuthoringSurfaceView>
      </div>
      <RuntimeSurfaceView settings={slideshowSettings}>
        <ImageBackdropPanel renderer="runtime" />
      </RuntimeSurfaceView>
    </CourseThemeProvider>,
  );
  return host;
}

function ImageBackdropPanel({ renderer }: { readonly renderer: "authoring" | "runtime" }) {
  return (
    <article
      className={`sc-slide-layout-surface-view sc-slide-layout-surface-${renderer}-view`}
      data-slide-layout-composition="image-backdrop-panel"
      data-slide-layout-orientation="default"
      data-slide-layout-proportion="one-third-two-thirds"
      data-slide-layout-title="visible"
      data-slide-layout-variant="slide-image-backdrop-panel"
      data-surface=""
      data-surface-background-image=""
      data-surface-variant="slide-image-backdrop-panel"
      data-testid={`${renderer}-backdrop-panel`}
      style={{ backgroundImage: 'url("https://example.test/backdrop.png")' }}
    >
      <div
        {...(renderer === "authoring"
          ? { "data-node-view-content-react": "" }
          : { "data-surface-content": "" })}
      >
        <h1 data-slot="slide-title">Image backdrop + inset panel</h1>
        <div data-region-role="main">
          <p>Keep this supporting copy readable over any authored backdrop.</p>
        </div>
      </div>
    </article>
  );
}

function resolveCssColour(element: HTMLElement, property: string): string {
  const probe = document.createElement("span");
  probe.style.color = getComputedStyle(element).getPropertyValue(property);
  element.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

function parseRgb(value: string): Rgb {
  const match = value.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/);
  if (!match) throw new Error(`Expected an RGB colour, received ${value}`);
  return { red: Number(match[1]), green: Number(match[2]), blue: Number(match[3]) };
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(colour: Rgb): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return linear(colour.red) * 0.2126 + linear(colour.green) * 0.7152 + linear(colour.blue) * 0.0722;
}

interface Rgb {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

function requiredElement<T extends Element>(container: ParentNode, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element matching ${selector}`);
  return element;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + 2_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for browser state");
    await new Promise(requestAnimationFrame);
  }
}
