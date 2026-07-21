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

const GALLERY_STATES = expandSlideCompositionCases().filter((state) =>
  ["diptych", "triptych"].includes(state.composition),
);

let rendered: RenderedCompositionStateCase | null = null;

afterEach(() => {
  rendered?.dispose();
  rendered = null;
});

describe("Image gallery composition geometry", () => {
  it.each(GALLERY_STATES)("$composition title=$title", async (state) => {
    rendered = await renderCompositionStateCase(state);
    rendered.runtime.host.style.padding = "0";
    const authoringDocument = rendered.authoring.editor.getJSON();
    const runtimeDocument = rendered.runtime.editor.getJSON();
    const authoring = measureCompositionGeometry(rendered.authoring, state);
    const runtime = measureCompositionGeometry(rendered.runtime, state);

    expectCompositionGeometry(authoring);
    expectCompositionGeometry(runtime);
    expectCompositionRendererParity(authoring, runtime);
    expect(rendered.authoring.editor.getJSON()).toEqual(authoringDocument);
    expect(rendered.runtime.editor.getJSON()).toEqual(runtimeDocument);
  });
});
