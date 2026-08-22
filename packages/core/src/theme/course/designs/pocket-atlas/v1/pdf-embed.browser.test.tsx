import { createRoot, type Root } from "react-dom/client";
import { useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/editor/blocks/resources/pdf-embed/PdfEmbed.css";

import { emptyPdfEmbedData } from "@/editor/blocks/resources/pdf-embed/content";
import { PdfEmbedSurface } from "@/editor/blocks/resources/pdf-embed/PdfEmbedSurface";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";

import "./theme.css";

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: {} },
  Document({
    children,
    className,
    onLoadSuccess,
  }: {
    children: ReactNode;
    className?: string;
    onLoadSuccess?: (result: { numPages: number }) => void;
  }) {
    useEffect(() => onLoadSuccess?.({ numPages: 3 }), [onLoadSuccess]);
    return <div className={className}>{children}</div>;
  },
  Page({
    onLoadSuccess,
    pageNumber,
  }: {
    onLoadSuccess?: (result: {
      originalHeight: number;
      originalWidth: number;
      pageNumber: number;
    }) => void;
    pageNumber: number;
  }) {
    useEffect(
      () => onLoadSuccess?.({ originalHeight: 800, originalWidth: 600, pageNumber }),
      [onLoadSuccess, pageNumber],
    );
    return <div>Rendered PDF page {pageNumber}</div>;
  },
}));

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Pocket Atlas PDF recipe", () => {
  it.each(["light", "dark"] as const)(
    "styles the complete learner viewer accessibly in %s mode",
    async (appearance) => {
      const host = document.createElement("div");
      host.style.width = "640px";
      document.body.append(host);
      const root = createRoot(host);
      mountedRoots.push(root);

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
          <div className="sc-course-pdf-embed">
            <PdfEmbedSurface
              data={emptyPdfEmbedData({
                source: { mode: "external", src: "https://example.com/field-guide.pdf" },
                title: "Field guide",
              })}
              mediaPort={null}
            />
          </div>
        </CourseThemeProvider>,
      );

      await waitForCondition(() => host.textContent?.includes("Rendered PDF page 1") === true);

      const figure = requireElement<HTMLElement>(host, ".sc-course-pdf-embed__figure");
      const caption = requireElement<HTMLElement>(host, ".sc-course-pdf-embed__caption");
      const stage = requireElement<HTMLElement>(host, ".sc-course-pdf-embed__stage");
      const chrome = requireElement<HTMLElement>(host, ".sc-course-pdf-embed__chrome");
      const pager = requireElement<HTMLElement>(host, ".sc-course-pdf-embed__pager");
      const next = requireElement<HTMLButtonElement>(host, '[aria-label="Next page"]');
      const zoomValue = requireElement<HTMLButtonElement>(
        host,
        '[aria-label="PDF zoom set to fit"]',
      );
      const open = requireElement<HTMLAnchorElement>(host, '[aria-label*="in new tab"]');

      expect(getComputedStyle(figure).rowGap).not.toBe("normal");
      expect(getComputedStyle(caption).fontFamily).toContain("Silkscreen");
      expect(Number.parseFloat(getComputedStyle(stage).minHeight)).toBeGreaterThanOrEqual(288);
      expect(getComputedStyle(stage).borderStyle).toBe("solid");
      expect(getComputedStyle(chrome).rowGap).not.toBe("normal");
      expect(getComputedStyle(pager).fontFamily).toContain("Silkscreen");
      expect(next.getBoundingClientRect().width).toBe(44);
      expect(next.getBoundingClientRect().height).toBe(44);
      expect(getComputedStyle(next).paddingInlineStart).toBe("0px");
      expect(Number.parseFloat(getComputedStyle(zoomValue).minWidth)).toBeGreaterThanOrEqual(64);
      expect(open.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);

      const openStyle = getComputedStyle(open);
      expect(contrastRatio(openStyle.color, openStyle.backgroundColor)).toBeGreaterThanOrEqual(4.5);

      const restingBackground = getComputedStyle(next).backgroundColor;
      await userEvent.hover(next);
      await waitForCondition(
        () => getComputedStyle(next).backgroundColor !== restingBackground,
      );
      expect(getComputedStyle(next).backgroundColor).not.toBe(restingBackground);

      next.focus();
      expect(getComputedStyle(next).outlineWidth).toBe("3px");
    },
  );
});

function requireElement<ElementType extends Element>(
  root: ParentNode,
  selector: string,
): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Expected ${selector}`);
  return element;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  const timeoutAt = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() >= timeoutAt) throw new Error("Timed out waiting for Pocket Atlas PDF fixture");
    await new Promise(requestAnimationFrame);
  }
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(parseRgb(foreground));
  const backgroundLuminance = relativeLuminance(parseRgb(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(value: string): [number, number, number] {
  const channels = value
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3) {
    throw new Error(`Expected an RGB colour, received ${value}`);
  }
  return channels as [number, number, number];
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
