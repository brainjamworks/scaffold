import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import {
  expectCompositionGeometry,
  expectCompositionRendererParity,
  measureCompositionGeometry,
  renderCompositionStateCase,
  type RenderedCompositionStateCase,
} from "./slide-composition-browser-harness";
import { expandSlideCompositionCases } from "./slide-composition-cases";

const ASYMMETRIC_STATES = expandSlideCompositionCases().filter((state) =>
  ["side-title", "editorial"].includes(state.composition),
);
const LONG_SIDE_TITLE =
  "A deliberately long vertical Side title that must remain readable without painting across the main content region";

let rendered: RenderedCompositionStateCase | null = null;

afterEach(() => {
  rendered?.dispose();
  rendered = null;
});

describe("Asymmetric content composition geometry", () => {
  it.each(ASYMMETRIC_STATES)(
    "$composition title=$title orientation=$orientation proportion=$proportion",
    async (state) => {
      rendered = await renderCompositionStateCase(
        state,
        state.composition === "side-title"
          ? { authoringEditable: true, titleText: LONG_SIDE_TITLE }
          : undefined,
      );
      rendered.runtime.host.style.padding = "0";
      let authoringDocument = rendered.authoring.editor.getJSON();
      let runtimeDocument = rendered.runtime.editor.getJSON();
      const authoring = measureCompositionGeometry(rendered.authoring, state);
      const runtime = measureCompositionGeometry(rendered.runtime, state);

      expectCompositionGeometry(authoring);
      expectCompositionGeometry(runtime);
      expectCompositionRendererParity(authoring, runtime);
      if (state.composition === "side-title") {
        for (const mounted of [rendered.authoring, rendered.runtime]) {
          const surface = mounted.host.querySelector<HTMLElement>(
            '[data-slide-layout-composition="side-title"]',
          );
          const title = mounted.host.querySelector<HTMLElement>('[data-slot="slide-title"]');
          const main = mounted.host.querySelector<HTMLElement>('[data-region-role="main"]');
          expect(surface).not.toBeNull();
          expect(title).not.toBeNull();
          expect(main).not.toBeNull();
          const surfaceRect = surface as HTMLElement;
          const titleRect = title as HTMLElement;
          const mainRect = main as HTMLElement;
          const surfaceBounds = surfaceRect.getBoundingClientRect();
          const titleBounds = titleRect.getBoundingClientRect();
          const mainBounds = mainRect.getBoundingClientRect();
          const reversed = state.orientation === "reversed";
          const scale = surfaceBounds.width / 1024;
          expect(getComputedStyle(titleRect).writingMode).toBe(
            reversed ? "vertical-rl" : "vertical-lr",
          );
          expect(getComputedStyle(titleRect).textOrientation).toBe("mixed");
          expect(
            reversed
              ? surfaceBounds.right - titleBounds.right
              : titleBounds.left - surfaceBounds.left,
          ).toBeCloseTo(16 * scale, 1);
          expect(titleBounds.width).toBeCloseTo(48 * scale, 1);
          expect(mainBounds.width).toBeCloseTo(896 * scale, 1);
          expect(
            reversed ? titleBounds.left - mainBounds.right : mainBounds.left - titleBounds.right,
          ).toBeCloseTo(32 * scale, 1);
          expect(surfaceRect.getAttribute("data-slide-layout-proportion")).toBeNull();
          expectLongTitlePaintContained(titleRect, mainRect);
        }
        expect(rendered.authoring.editor.isEditable).toBe(true);
        expect(rendered.authoring.editor.getText()).toContain(LONG_SIDE_TITLE);
        expect(rendered.authoring.editor.getJSON()).toEqual(authoringDocument);
        expect(rendered.runtime.editor.getJSON()).toEqual(runtimeDocument);

        rendered.dispose();
        rendered = await renderCompositionStateCase(state, {
          authoringEditable: true,
          titleText: "",
        });
        authoringDocument = rendered.authoring.editor.getJSON();
        runtimeDocument = rendered.runtime.editor.getJSON();
        const authoringTitle = rendered.authoring.host.querySelector<HTMLElement>(
          '[data-slot="slide-title"]',
        );
        expect(authoringTitle).not.toBeNull();
        expect(authoringTitle?.isContentEditable).toBe(true);
        expect(authoringTitle).toHaveClass("is-empty");
        expect(authoringTitle).toHaveAttribute("data-placeholder", "Slide title");
        expect(authoringTitle?.getBoundingClientRect().height).toBeGreaterThan(0);
        const placeholderStyle = getComputedStyle(authoringTitle as HTMLElement, "::before");
        expect(placeholderStyle.cssFloat).toBe("none");
        expect(placeholderStyle.height).not.toBe("0px");
      }
      expect(rendered.authoring.editor.getJSON()).toEqual(authoringDocument);
      expect(rendered.runtime.editor.getJSON()).toEqual(runtimeDocument);
    },
  );
});

function expectLongTitlePaintContained(title: HTMLElement, main: HTMLElement): void {
  const titleBounds = title.getBoundingClientRect();
  const mainBounds = main.getBoundingClientRect();
  const textNode = title.firstChild;

  expect(textNode).toBeInstanceOf(Text);
  const range = document.createRange();
  range.selectNodeContents(title);
  const textFragments = [...range.getClientRects()];
  range.detach();

  expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);
  expect(textFragments.some((fragment) => rectanglesOverlap(fragment, mainBounds))).toBe(true);
  expect(getComputedStyle(title).overflowX).toBe("auto");

  const visiblePaintFragments = textFragments.map((fragment) => ({
    left: Math.max(fragment.left, titleBounds.left),
    right: Math.min(fragment.right, titleBounds.right),
    top: Math.max(fragment.top, titleBounds.top),
    bottom: Math.min(fragment.bottom, titleBounds.bottom),
  }));
  expect(visiblePaintFragments.every((fragment) => !rectanglesOverlap(fragment, mainBounds))).toBe(
    true,
  );

  title.scrollLeft = 100_000;
  if (title.scrollLeft === 0) title.scrollLeft = -100_000;
  expect(Math.abs(title.scrollLeft)).toBeGreaterThan(0);
  title.scrollLeft = 0;
}

function rectanglesOverlap(
  first: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
  second: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
): boolean {
  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  );
}
