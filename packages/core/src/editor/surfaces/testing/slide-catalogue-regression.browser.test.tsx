import type { Editor as TiptapEditor } from "@tiptap/core";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import { AuthoringSurfaceView } from "@/editor/surfaces/authoring/views/AuthoringSurfaceView";
import { RuntimeSurfaceView } from "@/editor/surfaces/runtime/views/RuntimeSurfaceView";
import "@/styles/globals.css";

import { expandSlideCompositionCases } from "./slide-composition-cases";
import {
  measureCompositionGeometry,
  renderCompositionStateCase,
  renderRegisteredSurfaceVariant,
  type CompositionGeometrySample,
  type IntrinsicRect,
  type RenderedCompositionStateCase,
} from "./slide-composition-browser-harness";

const TITLE_VARIANTS = [
  { variant: "slide-cover", imageSlot: null },
  { variant: "slide-module-cover", imageSlot: null },
  { variant: "slide-image-cover", imageSlot: "slide-image-cover-image" },
  { variant: "slide-image-band", imageSlot: "slide-image-band-image" },
] as const;
const TITLE_TEXT = "Catalogue title";
const IMAGE_ALT = "Catalogue acceptance image";

let rendered: RenderedCompositionStateCase | null = null;
let fluidRoot: Root | null = null;
let fluidHost: HTMLElement | null = null;

afterEach(() => {
  rendered?.dispose();
  rendered = null;
  fluidRoot?.unmount();
  fluidRoot = null;
  fluidHost?.remove();
  fluidHost = null;
});

describe("slide catalogue regression", () => {
  it.each(TITLE_VARIANTS)(
    "keeps $variant specialised with intrinsic authoring/runtime geometry",
    async ({ variant, imageSlot }) => {
      rendered = await renderRegisteredSurfaceVariant(variant, {
        imageAlt: IMAGE_ALT,
        imageUrl: inlineImageUrl(),
        titleText: TITLE_TEXT,
      });
      rendered.runtime.host.style.padding = "0";
      const authoringDocument = rendered.authoring.editor.getJSON();
      const runtimeDocument = rendered.runtime.editor.getJSON();
      const authoring = measureSpecialisedSurface(rendered.authoring.host, variant, imageSlot);
      const runtime = measureSpecialisedSurface(rendered.runtime.host, variant, imageSlot);

      expect(authoring.surface.width / authoring.surface.height).toBeCloseTo(16 / 9, 5);
      expect(runtime.surface.width / runtime.surface.height).toBeCloseTo(16 / 9, 5);
      expect(authoring.titleText).toBe(TITLE_TEXT);
      expect(runtime.titleText).toBe(TITLE_TEXT);
      expect(authoring.imageAlt).toBe(imageSlot ? IMAGE_ALT : null);
      expect(runtime.imageAlt).toBe(imageSlot ? IMAGE_ALT : null);
      expectSpecialisedParity(authoring, runtime);
      expect(rendered.authoring.editor.getJSON()).toEqual(authoringDocument);
      expect(rendered.runtime.editor.getJSON()).toEqual(runtimeDocument);
    },
  );

  it("keeps nested ordinary authoring chrome geometry-neutral while inactive, hovered, and selected", async () => {
    const state = expandSlideCompositionCases().find(
      (candidate) =>
        candidate.composition === "two-columns" &&
        candidate.title === "visible" &&
        candidate.orientation === "default" &&
        candidate.proportion === "equal",
    );
    if (!state) throw new Error("Two columns acceptance state is not registered.");

    rendered = await renderCompositionStateCase(state, {
      authoringEditable: true,
      nestedGrid: true,
    });
    const grid = uniqueElement<HTMLElement>(
      rendered.authoring.host,
      '[data-authoring-frame="grid"][data-id="geometry-nested-grid"]',
    );
    const titlePosition = textPosition(rendered.authoring.editor, "Geometry title");
    const gridPosition = textPosition(rendered.authoring.editor, "Nested grid alpha");

    rendered.authoring.editor.commands.focus();
    rendered.authoring.editor.commands.setTextSelection(titlePosition);
    await waitForCondition(() => !grid.hasAttribute("data-authoring-chrome-active"));
    const inactive = measureCompositionGeometry(rendered.authoring, state);

    await userEvent.hover(grid);
    expect(grid.matches(":hover")).toBe(true);
    const hovered = measureCompositionGeometry(rendered.authoring, state);

    rendered.authoring.editor.commands.setTextSelection(gridPosition);
    await waitForCondition(() => grid.hasAttribute("data-authoring-chrome-active"));
    expect(grid.getAttribute("data-authoring-chrome-active")).toBe("");
    const selected = measureCompositionGeometry(rendered.authoring, state);

    expectParticipantRects(hovered, inactive);
    expectParticipantRects(selected, inactive);
    await userEvent.unhover(grid);
  });

  it.each(["page", "branching"] as const)(
    "keeps $mode authoring/runtime surfaces fluid at two container widths",
    async (mode) => {
      const narrow = await renderFluidShells(mode, 480);
      const wide = await renderFluidShells(mode, 720);

      for (const renderer of ["authoring", "runtime"] as const) {
        expect(narrow[renderer].transform).toBe("none");
        expect(wide[renderer].transform).toBe("none");
        expect(narrow[renderer].width).not.toBeCloseTo(1024, 2);
        expect(wide[renderer].width).not.toBeCloseTo(1024, 2);
        expect(wide[renderer].width - narrow[renderer].width).toBeCloseTo(240, 2);
        expect(narrow[renderer].width).toBeCloseTo(narrow[renderer].availableWidth, 2);
        expect(wide[renderer].width).toBeCloseTo(wide[renderer].availableWidth, 2);
      }
    },
  );
});

interface SpecialisedSurfaceSample {
  readonly imageAlt: string | null;
  readonly participants: Readonly<Record<string, IntrinsicRect>>;
  readonly surface: IntrinsicRect;
  readonly titleText: string;
}

function measureSpecialisedSurface(
  host: HTMLElement,
  variant: string,
  imageSlot: string | null,
): SpecialisedSurfaceSample {
  const surface = uniqueElement<HTMLElement>(host, `[data-surface-variant="${variant}"]`);
  const surfaceBounds = surface.getBoundingClientRect();
  const scaleX = surfaceBounds.width / 1024;
  const scaleY = surfaceBounds.height / 576;
  const heading = uniqueElement<HTMLHeadingElement>(surface, "h1");
  const semanticElements = [
    heading,
    ...surface.querySelectorAll<HTMLElement>('[data-slot="slide-cover-subtitle"]'),
    ...(imageSlot ? [uniqueElement<HTMLElement>(surface, `[data-slot="${imageSlot}"]`)] : []),
  ];
  const participants = Object.fromEntries(
    semanticElements.map((element, index) => [
      `${element.getAttribute("data-slot") ?? "title"}:${index}`,
      normaliseRect(element.getBoundingClientRect(), surfaceBounds, scaleX, scaleY),
    ]),
  );

  for (const rect of Object.values(participants)) {
    expectFiniteContainedRect(rect);
  }

  const image = imageSlot
    ? uniqueElement<HTMLImageElement>(surface, `[data-slot="${imageSlot}"] img`)
    : null;
  return {
    imageAlt: image?.alt ?? null,
    participants,
    surface: { x: 0, y: 0, width: 1024, height: 576 },
    titleText: heading.textContent ?? "",
  };
}

function expectSpecialisedParity(
  authoring: SpecialisedSurfaceSample,
  runtime: SpecialisedSurfaceSample,
): void {
  expect(Object.keys(authoring.participants)).toEqual(Object.keys(runtime.participants));
  for (const key of Object.keys(authoring.participants)) {
    const authoringRect = authoring.participants[key];
    const runtimeRect = runtime.participants[key];
    if (!authoringRect || !runtimeRect) throw new Error(`Missing specialised participant ${key}.`);
    for (const field of ["x", "width", "height"] as const) {
      expect(authoringRect[field]).toBeCloseTo(runtimeRect[field], 1);
    }
  }

  expect(verticalGroupCentre(authoring.participants)).toBeCloseTo(
    verticalGroupCentre(runtime.participants),
    1,
  );
}

function verticalGroupCentre(participants: Readonly<Record<string, IntrinsicRect>>): number {
  const contentRects = Object.entries(participants)
    .filter(([key]) => !key.includes("-image:"))
    .map(([, rect]) => rect);
  const top = Math.min(...contentRects.map((rect) => rect.y));
  const bottom = Math.max(...contentRects.map((rect) => rect.y + rect.height));
  return (top + bottom) / 2;
}

function expectFiniteContainedRect(rect: IntrinsicRect): void {
  for (const value of [rect.x, rect.y, rect.width, rect.height]) {
    expect(Number.isFinite(value)).toBe(true);
  }
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.height).toBeGreaterThan(0);
  expect(rect.x).toBeGreaterThanOrEqual(-0.5);
  expect(rect.y).toBeGreaterThanOrEqual(-0.5);
  expect(rect.x + rect.width).toBeLessThanOrEqual(1024.5);
  expect(rect.y + rect.height).toBeLessThanOrEqual(576.5);
}

function expectParticipantRects(
  actual: CompositionGeometrySample,
  expected: CompositionGeometrySample,
): void {
  expect(Object.keys(actual.participants)).toEqual(Object.keys(expected.participants));
  for (const key of Object.keys(expected.participants) as (keyof typeof expected.participants)[]) {
    const actualRect = actual.participants[key];
    const expectedRect = expected.participants[key];
    if (!actualRect || !expectedRect) throw new Error(`Missing composition participant ${key}.`);
    for (const field of ["x", "y", "width", "height"] as const) {
      expect(actualRect[field]).toBeCloseTo(expectedRect[field], 5);
    }
  }
}

async function renderFluidShells(
  mode: "page" | "branching",
  width: number,
): Promise<
  Record<"authoring" | "runtime", { availableWidth: number; transform: string; width: number }>
> {
  fluidRoot?.unmount();
  fluidHost?.remove();
  fluidHost = document.createElement("div");
  fluidHost.style.position = "absolute";
  fluidHost.style.width = `${width}px`;
  document.body.append(fluidHost);
  fluidRoot = createRoot(fluidHost);
  const settings = { mode, overflowMode: "clip", surfaceSize: "fluid" } as const;
  fluidRoot.render(
    <>
      <div data-fluid-shell="authoring">
        <AuthoringSurfaceView settings={settings}>
          <section data-surface>Fluid authoring content</section>
        </AuthoringSurfaceView>
      </div>
      <div data-fluid-shell="runtime">
        <RuntimeSurfaceView settings={settings}>
          <section data-surface>Fluid runtime content</section>
        </RuntimeSurfaceView>
      </div>
    </>,
  );
  await waitForCondition(() => fluidHost?.querySelectorAll("[data-surface]").length === 2);
  await nextLayoutFrame();

  return Object.fromEntries(
    (["authoring", "runtime"] as const).map((renderer) => {
      const frame = uniqueElement<HTMLElement>(
        fluidHost as HTMLElement,
        `[data-fluid-shell="${renderer}"] > section`,
      );
      const surface = uniqueElement<HTMLElement>(frame, "[data-surface]");
      const frameStyle = getComputedStyle(frame);
      const availableWidth =
        frame.clientWidth -
        Number.parseFloat(frameStyle.paddingLeft) -
        Number.parseFloat(frameStyle.paddingRight);
      return [
        renderer,
        {
          availableWidth,
          transform: getComputedStyle(surface).transform,
          width: surface.getBoundingClientRect().width,
        },
      ];
    }),
  ) as Record<
    "authoring" | "runtime",
    { availableWidth: number; transform: string; width: number }
  >;
}

function textPosition(editor: TiptapEditor, text: string): number {
  let position: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    const index = node.isText ? (node.text?.indexOf(text) ?? -1) : -1;
    if (index >= 0 && position === null) position = pos + index + 1;
  });
  if (position === null) throw new Error(`Could not find text position for ${text}.`);
  return position;
}

function normaliseRect(
  rect: DOMRect,
  surface: DOMRect,
  scaleX: number,
  scaleY: number,
): IntrinsicRect {
  return {
    x: (rect.left - surface.left) / scaleX,
    y: (rect.top - surface.top) / scaleY,
    width: rect.width / scaleX,
    height: rect.height / scaleY,
  };
}

function uniqueElement<T extends Element>(root: ParentNode, selector: string): T {
  const matches = root.querySelectorAll<T>(selector);
  if (matches.length !== 1 || !matches[0]) {
    throw new Error(`Expected one element for ${selector}, found ${matches.length}.`);
  }
  return matches[0];
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for browser state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function nextLayoutFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function inlineImageUrl(): string {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='9'%3E%3Crect width='16' height='9' fill='%2300A689'/%3E%3C/svg%3E";
}
