import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { AuthoringSurfaceView } from "@/editor/surfaces/authoring/views/AuthoringSurfaceView";
import { RuntimeSurfaceView } from "@/editor/surfaces/runtime/views/RuntimeSurfaceView";
import "@/editor/surfaces/variants/slide-cover/styles.css";
import "@/styles/globals.css";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";

import "./theme.css";

let root: Root | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

describe("Pocket Atlas Cover recipe", () => {
  it("keeps a bounded display composition aligned in authoring and runtime", async () => {
    const host = renderCover("light");

    await waitForCondition(() => host.querySelector('[data-testid="authoring-cover"]') !== null);

    const authoringCover = requiredElement<HTMLElement>(host, '[data-testid="authoring-cover"]');
    const runtimeCover = requiredElement<HTMLElement>(host, '[data-testid="runtime-cover"]');
    const title = requiredElement<HTMLElement>(authoringCover, "h1");
    const subtitle = requiredElement<HTMLElement>(
      authoringCover,
      '[data-slot="slide-cover-subtitle"] > p',
    );
    const authoringStyle = getComputedStyle(authoringCover);
    const runtimeStyle = getComputedStyle(runtimeCover);

    expect(Number.parseFloat(authoringStyle.paddingInlineStart)).toBeGreaterThanOrEqual(64);
    expect(Number.parseFloat(authoringStyle.paddingBlockStart)).toBeGreaterThanOrEqual(40);
    expect(authoringStyle.padding).toBe(runtimeStyle.padding);
    expect(Number.parseFloat(getComputedStyle(title).fontSize)).toBeGreaterThanOrEqual(60);
    expect(title.getBoundingClientRect().width).toBeLessThan(
      authoringCover.getBoundingClientRect().width,
    );
    expect(subtitle.getBoundingClientRect().width).toBeLessThan(
      authoringCover.getBoundingClientRect().width,
    );
    expect(authoringStyle.borderTopWidth).toBe("0px");
    expect(authoringStyle.boxShadow).toBe("none");
    expect(runtimeStyle.borderTopWidth).toBe("0px");
    expect(runtimeStyle.boxShadow).toBe("none");
    expect(runtimeCover.querySelector('[class*="sc-app-"]')).toBeNull();
  });

  it.each(["light", "dark"] as const)(
    "keeps text AA-legible over the patterned %s cover",
    async (appearance) => {
      const host = renderCover(appearance);

      await waitForCondition(() => host.querySelector('[data-testid="runtime-cover"]') !== null);

      const courseRoot = requiredElement<HTMLElement>(host, ".sc-course");
      const runtimeCover = requiredElement<HTMLElement>(host, '[data-testid="runtime-cover"]');
      const style = getComputedStyle(runtimeCover);
      const foreground = parseRgb(style.color);
      const background = parseRgb(style.backgroundColor);
      const brightestPatternColour = composite(
        parseFirstGradientStop(style.backgroundImage),
        background,
      );

      expect(style.color).toBe(resolveCssColour(courseRoot, "--pa-violet-foreground"));
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(foreground, brightestPatternColour)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

const slideshowSettings = {
  mode: "slideshow",
  overflowMode: "clip",
  surfaceSize: "16x9",
} as const;

function renderCover(appearance: "light" | "dark"): HTMLElement {
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
      <div style={{ width: 640 }}>
        <AuthoringSurfaceView settings={slideshowSettings}>
          <div className="sc-slideshow-authoring-surface-stage">
            <CoverSurface renderer="authoring" />
          </div>
        </AuthoringSurfaceView>
      </div>
      <RuntimeSurfaceView settings={slideshowSettings}>
        <CoverSurface renderer="runtime" />
      </RuntimeSurfaceView>
    </CourseThemeProvider>,
  );
  return host;
}

function CoverSurface({ renderer }: { readonly renderer: "authoring" | "runtime" }) {
  const content = (
    <div
      {...(renderer === "authoring"
        ? { "data-node-view-content-react": "" }
        : { "data-surface-content": "" })}
    >
      <h1>Pocket Atlas</h1>
      <div data-slot="slide-cover-subtitle">
        <p>A field guide to the complete course.</p>
      </div>
    </div>
  );

  return renderer === "authoring" ? (
    <article
      className="sc-slide-cover-surface-view sc-slide-cover-surface-authoring-view"
      data-surface=""
      data-surface-variant="slide-cover"
      data-testid="authoring-cover"
      data-vertical-content-position="middle"
    >
      {content}
    </article>
  ) : (
    <article data-surface="" data-surface-variant="slide-cover">
      <div
        className="sc-slide-cover-surface-view sc-slide-cover-surface-runtime-view"
        data-testid="runtime-cover"
      >
        {content}
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

function parseFirstGradientStop(backgroundImage: string): Rgba {
  const match = backgroundImage.match(
    /rgba?\(\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)(?:\D+(\d*\.?\d+))?/,
  );
  if (!match) throw new Error(`Expected an RGB gradient stop in ${backgroundImage}`);
  return {
    red: Number(match[1]),
    green: Number(match[2]),
    blue: Number(match[3]),
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  };
}

function parseRgb(value: string): Rgba {
  const match = value.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)(?:\D+(\d*\.?\d+))?/);
  if (!match) throw new Error(`Expected an RGB colour, received ${value}`);
  return {
    red: Number(match[1]),
    green: Number(match[2]),
    blue: Number(match[3]),
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  };
}

function composite(foreground: Rgba, background: Rgba): Rgba {
  return {
    red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
    green: foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
    blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
    alpha: 1,
  };
}

function contrastRatio(first: Rgba, second: Rgba): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(colour: Rgba): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return linear(colour.red) * 0.2126 + linear(colour.green) * 0.7152 + linear(colour.blue) * 0.0722;
}

interface Rgba {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
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
