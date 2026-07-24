import { createRoot, type Root } from "react-dom/client";
import { useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import "@/editor/frame/view/bounded-placement.css";

import { emptyPdfEmbedData } from "./content";
import { PdfEmbedSurface } from "./PdfEmbedSurface";

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
    useEffect(() => {
      onLoadSuccess?.({ numPages: 3 });
    }, [onLoadSuccess]);
    return <div className={className}>{children}</div>;
  },
  Page({
    onLoadSuccess,
    pageNumber,
    scale,
    width,
  }: {
    onLoadSuccess?: (result: {
      originalHeight: number;
      originalWidth: number;
      pageNumber: number;
    }) => void;
    pageNumber: number;
    scale?: number;
    width?: number;
  }) {
    useEffect(() => {
      onLoadSuccess?.({
        originalHeight: 800,
        originalWidth: 600,
        pageNumber,
      });
    }, [onLoadSuccess, pageNumber]);

    const renderedWidth = width ?? 600 * (scale ?? 1);

    return (
      <div className="react-pdf__Page">
        <canvas
          data-pdf-page=""
          style={{
            width: `${renderedWidth}px`,
            height: `${(renderedWidth * 800) / 600}px`,
          }}
        />
      </div>
    );
  },
}));

type RendererKind = "authoring" | "runtime";

interface MountedPdf {
  frame: HTMLElement;
  host: HTMLElement;
  root: Root;
}

const mountedPdfs: MountedPdf[] = [];

afterEach(() => {
  for (const mounted of mountedPdfs.splice(0)) {
    mounted.root.unmount();
    mounted.host.remove();
  }
  document.body.replaceChildren();
});

describe("PDF bounded geometry", () => {
  it.each(["authoring", "runtime"] as const)(
    "fills a finite %s frame while reserving caption and navigation chrome",
    async (kind) => {
      const mounted = await mountPdf({ bounded: true, kind });
      const figure = requiredElement<HTMLElement>(mounted.frame, ".sc-pdf-embed__figure");
      const caption = requiredElement<HTMLElement>(mounted.frame, ".sc-pdf-embed__caption");
      const stage = requiredElement<HTMLElement>(mounted.frame, ".sc-pdf-embed__stage");
      const canvas = requiredElement<HTMLCanvasElement>(mounted.frame, "[data-pdf-page]");
      const chrome = requiredElement<HTMLElement>(mounted.frame, ".sc-pdf-embed__chrome");
      const frameRect = mounted.frame.getBoundingClientRect();
      const figureRect = figure.getBoundingClientRect();
      const captionRect = caption.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const chromeRect = chrome.getBoundingClientRect();

      expect(frameRect.height).toBeCloseTo(300, 0);
      expect(figureRect.height).toBeCloseTo(frameRect.height, 0);
      expect(captionRect.bottom).toBeLessThanOrEqual(stageRect.top + 1);
      expect(stageRect.height).toBeGreaterThan(0);
      expect(stageRect.bottom).toBeLessThanOrEqual(chromeRect.top + 1);
      expect(chromeRect.bottom).toBeLessThanOrEqual(frameRect.bottom + 1);
      expect(canvasRect.width).toBeLessThanOrEqual(stageRect.width + 1);
      expect(canvasRect.height).toBeLessThanOrEqual(stageRect.height + 1);
    },
  );

  it("keeps ordinary page-flow PDF height intrinsic", async () => {
    const mounted = await mountPdf({ bounded: false, kind: "runtime" });
    const stage = requiredElement<HTMLElement>(mounted.frame, ".sc-pdf-embed__stage");
    const canvas = requiredElement<HTMLCanvasElement>(mounted.frame, "[data-pdf-page]");
    const stageRect = stage.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    expect(mounted.frame.hasAttribute("data-bounded-placement")).toBe(false);
    expect(canvasRect.width).toBeCloseTo(stage.clientWidth, 0);
    expect(stageRect.height).toBeGreaterThanOrEqual(canvasRect.height);
    expect(canvasRect.width / canvasRect.height).toBeCloseTo(600 / 800, 2);
  });

  it("contains the lazy-loading fallback inside a short bounded frame", () => {
    const host = document.createElement("div");
    host.style.width = "640px";
    host.style.height = "180px";

    const frame = document.createElement("div");
    frame.className = "sc-pdf-embed";
    frame.dataset["authoringFrame"] = "block";
    frame.dataset["boundedPlacement"] = "fill";

    const fallback = document.createElement("div");
    fallback.className = "sc-pdf-embed__fallback";
    frame.append(fallback);
    host.append(frame);
    document.body.append(host);

    const frameRect = frame.getBoundingClientRect();
    const fallbackRect = fallback.getBoundingClientRect();

    expect(frameRect.height).toBeCloseTo(180, 0);
    expect(fallbackRect.height).toBeCloseTo(frameRect.height, 0);
    expect(fallbackRect.bottom).toBeLessThanOrEqual(frameRect.bottom + 1);
  });

  it("makes an enlarged page keyboard-scrollable instead of clipping it", async () => {
    const mounted = await mountPdf({ bounded: true, kind: "runtime" });
    const stage = requiredElement<HTMLElement>(mounted.frame, ".sc-pdf-embed__stage");

    for (let index = 0; index < 4; index += 1) {
      requiredElement<HTMLButtonElement>(mounted.frame, '[aria-label="Zoom in"]').click();
      await nextLayoutFrames(1);
    }

    await waitForCondition(() =>
      mounted.frame.querySelector('[aria-label="Zoom 125%. Reset to fit"]'),
    );
    await nextLayoutFrames(3);

    const canvas = requiredElement<HTMLCanvasElement>(mounted.frame, "[data-pdf-page]");

    expect(stage.tabIndex).toBe(0);
    expect(getComputedStyle(stage).overflow).toBe("auto");
    expect(canvas.getBoundingClientRect().width).toBeGreaterThan(stage.clientWidth);
    expect(stage.scrollWidth).toBeGreaterThan(stage.clientWidth);
    expect(stage.scrollHeight).toBeGreaterThan(stage.clientHeight);

    stage.scrollLeft = 0;
    await nextLayoutFrames(1);
    expect(canvas.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      stage.getBoundingClientRect().left - 1,
    );

    stage.scrollLeft = stage.scrollWidth - stage.clientWidth;
    await nextLayoutFrames(1);
    expect(canvas.getBoundingClientRect().right).toBeLessThanOrEqual(
      stage.getBoundingClientRect().right + 1,
    );
  });
});

async function mountPdf(input: { bounded: boolean; kind: RendererKind }): Promise<MountedPdf> {
  const host = document.createElement("div");
  host.style.width = "640px";
  if (input.bounded) host.style.height = "300px";

  const frame = document.createElement("div");
  frame.className = "sc-pdf-embed";
  frame.setAttribute(
    input.kind === "authoring" ? "data-authoring-frame" : "data-runtime-frame",
    "block",
  );
  if (input.bounded) frame.dataset["boundedPlacement"] = "fill";

  host.append(frame);
  document.body.append(host);
  const root = createRoot(frame);
  root.render(
    <PdfEmbedSurface
      data={emptyPdfEmbedData({
        source: {
          mode: "external",
          src: "https://example.com/sample.pdf",
        },
        title: "Course handbook",
      })}
      editable={input.kind === "authoring"}
      mediaPort={null}
      {...(input.kind === "authoring" ? { onAdd: () => undefined } : {})}
    />,
  );

  const mounted = { frame, host, root };
  mountedPdfs.push(mounted);
  await waitForCondition(() => frame.querySelector("[data-pdf-page]"));
  await nextLayoutFrames(3);
  return mounted;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const matches = root.querySelectorAll<T>(selector);
  if (matches.length !== 1 || !matches[0]) {
    throw new Error(`Expected one element for ${selector}, found ${matches.length}.`);
  }
  return matches[0];
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for PDF browser state.");
    await nextLayoutFrames(1);
  }
}

async function nextLayoutFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
