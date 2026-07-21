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

const CONTENT_FLOW_COMPOSITIONS = new Set([
  "content",
  "two-columns",
  "three-columns",
  "two-stacked",
  "centred-stage",
]);
const CONTENT_FLOW_STATES = expandSlideCompositionCases().filter((state) =>
  CONTENT_FLOW_COMPOSITIONS.has(state.composition),
);

let rendered: RenderedCompositionStateCase | null = null;

afterEach(() => {
  rendered?.dispose();
  rendered = null;
});

describe("Content flow composition geometry", () => {
  it.each(CONTENT_FLOW_STATES)(
    "$composition title=$title orientation=$orientation proportion=$proportion",
    async (state) => {
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
    },
  );
});
