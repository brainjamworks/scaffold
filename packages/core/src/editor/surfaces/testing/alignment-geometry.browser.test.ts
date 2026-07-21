import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";
import "@/editor/rich-text/view/text-alignment.css";
import "../view/variants/slide-cover.css";
import "../view/variants/slide-image-band.css";
import "../view/variants/slide-image-cover.css";

type Renderer = "authoring" | "runtime";
type VerticalPosition = "top" | "middle" | "bottom";
type CapableVariant = "slide-cover" | "slide-image-cover" | "slide-image-band";

const RENDERERS = ["authoring", "runtime"] as const;
const VERTICAL_CASES = [
  ["top", 0],
  ["middle", 0.5],
  ["bottom", 1],
] as const;
const CAPABLE_VARIANTS = ["slide-cover", "slide-image-cover", "slide-image-band"] as const;

afterEach(() => {
  document.body.replaceChildren();
});

describe("fixed-template alignment geometry", () => {
  it.each([
    ["left", "right"],
    ["center", "left"],
    ["right", "center"],
  ] as const)("positions title %s and subtitle %s independently", (titleAlign, subtitleAlign) => {
    const authoring = renderSurface("authoring", "slide-cover", "middle");
    const runtime = renderSurface("runtime", "slide-cover", "middle");

    for (const rendered of [authoring, runtime]) {
      rendered.title.dataset.textAlign = titleAlign;
      rendered.subtitleText.dataset.textAlign = subtitleAlign;

      expectHorizontalAlignment(rendered.title, rendered.content, titleAlign);
      expectHorizontalAlignment(rendered.subtitleText, rendered.subtitle, subtitleAlign);
    }

    expect(horizontalOffset(authoring.title, authoring.content)).toBeCloseTo(
      horizontalOffset(runtime.title, runtime.content),
      0,
    );
    expect(horizontalOffset(authoring.subtitleText, authoring.subtitle)).toBeCloseTo(
      horizontalOffset(runtime.subtitleText, runtime.subtitle),
      0,
    );
  });
});

describe("capable Surface vertical content geometry", () => {
  it.each(CAPABLE_VARIANTS)("positions %s content at Top, Middle, and Bottom", (variant) => {
    const samples = RENDERERS.flatMap((renderer) =>
      VERTICAL_CASES.map(([position, factor]) => ({
        factor,
        position,
        renderer,
        rendered: renderSurface(renderer, variant, position),
      })),
    );

    for (const { factor, rendered } of samples) {
      const contentRect = rendered.content.getBoundingClientRect();
      const computed = getComputedStyle(rendered.content);
      const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
      const firstRect = rendered.firstContent.getBoundingClientRect();
      const lastRect = rendered.lastContent.getBoundingClientRect();
      const groupHeight = lastRect.bottom - firstRect.top;
      const innerHeight = contentRect.height - paddingTop - paddingBottom;
      const expectedOffset = paddingTop + (innerHeight - groupHeight) * factor;

      expect(firstRect.top - contentRect.top).toBeCloseTo(expectedOffset, 0);
    }

    for (const [position] of VERTICAL_CASES) {
      const authoring = samples.find(
        (sample) => sample.renderer === "authoring" && sample.position === position,
      );
      const runtime = samples.find(
        (sample) => sample.renderer === "runtime" && sample.position === position,
      );

      expect(authoring).toBeDefined();
      expect(runtime).toBeDefined();
      expect(verticalOffset(authoring!.rendered)).toBeCloseTo(verticalOffset(runtime!.rendered), 0);
    }
  });
});

function renderSurface(renderer: Renderer, variant: CapableVariant, position: VerticalPosition) {
  const host = document.createElement("div");
  host.className = `scaffold-${renderer}-surface-view`;

  const surface = document.createElement("div");
  surface.dataset.surface = "";
  surface.dataset.surfaceVariant = variant;
  surface.dataset.verticalContentPosition = position;
  surface.style.cssText = "width: 1000px; height: 562px;";

  const variantView = renderer === "authoring" ? surface : document.createElement("div");
  variantView.classList.add(`sc-${variant}-surface-view`);
  if (renderer === "authoring") {
    variantView.classList.add(`sc-${variant}-surface-authoring-view`);
  } else {
    variantView.classList.add(`sc-${variant}-surface-runtime-view`);
    surface.append(variantView);
  }

  const content = document.createElement("div");
  if (renderer === "authoring") {
    content.dataset.nodeViewContentReact = "";
  } else {
    content.dataset.surfaceContent = "";
  }

  const title = document.createElement("h1");
  title.style.cssText = "height: 40px; max-width: 240px;";
  const subtitle = document.createElement("div");
  subtitle.dataset.slot = "slide-cover-subtitle";
  subtitle.style.height = "20px";
  const subtitleText = document.createElement("p");
  subtitleText.style.cssText = "height: 20px; max-width: 320px; margin-block: 0;";
  subtitle.append(subtitleText);

  let firstContent: HTMLElement = title;
  let lastContent: HTMLElement = subtitle;
  if (variant === "slide-cover") {
    content.append(title, subtitle);
  } else {
    const stack = document.createElement("div");
    stack.style.cssText = "width: 240px; height: 60px;";
    content.append(stack);
    firstContent = stack;
    lastContent = stack;

    const media = document.createElement("div");
    media.dataset.slot =
      variant === "slide-image-cover" ? "slide-image-cover-image" : "slide-image-band-image";
    variantView.append(media);
  }

  variantView.append(content);
  host.append(surface);
  document.body.append(host);

  return { content, firstContent, lastContent, subtitle, subtitleText, title };
}

function expectHorizontalAlignment(
  child: HTMLElement,
  parent: HTMLElement,
  alignment: "left" | "center" | "right",
) {
  const parentRect = parent.getBoundingClientRect();
  const childRect = child.getBoundingClientRect();
  const factor = alignment === "left" ? 0 : alignment === "center" ? 0.5 : 1;

  expect(childRect.left - parentRect.left).toBeCloseTo(
    (parentRect.width - childRect.width) * factor,
    0,
  );
}

function horizontalOffset(child: HTMLElement, parent: HTMLElement): number {
  return child.getBoundingClientRect().left - parent.getBoundingClientRect().left;
}

function verticalOffset(rendered: ReturnType<typeof renderSurface>): number {
  return (
    rendered.firstContent.getBoundingClientRect().top - rendered.content.getBoundingClientRect().top
  );
}
