import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import { expandSlideCompositionCases } from "./slide-composition-cases";
import {
  expectCompositionGeometry,
  measureCompositionGeometry,
  renderCompositionStateCase,
  type RenderedCompositionStateCase,
} from "./slide-composition-browser-harness";

let rendered: RenderedCompositionStateCase | null = null;

afterEach(() => {
  rendered?.dispose();
  rendered = null;
});

describe("slide composition browser harness", () => {
  it("mounts and measures Content through actual authoring and runtime renderers", async () => {
    const state = expandSlideCompositionCases().find(
      (candidate) => candidate.composition === "content" && candidate.title === "visible",
    );
    if (!state) throw new Error("Content visible composition state is not registered.");

    rendered = await renderCompositionStateCase(state);
    rendered.runtime.host.style.padding = "0";
    const authoringBefore = rendered.authoring.editor.getJSON();
    const runtimeBefore = rendered.runtime.editor.getJSON();
    const authoring = measureCompositionGeometry(rendered.authoring, state);
    const runtime = measureCompositionGeometry(rendered.runtime, state);

    expectCompositionGeometry(authoring);
    expectCompositionGeometry(runtime);

    expect(authoring.renderer).toBe("authoring");
    expect(runtime.renderer).toBe("runtime");
    expect(authoring.surface).toEqual({ x: 0, y: 0, width: 1024, height: 576 });
    expect(runtime.surface).toEqual({ x: 0, y: 0, width: 1024, height: 576 });
    expect(Object.keys(authoring.participants).sort()).toEqual([
      "content-host",
      "region:main",
      "surface",
      "title",
    ]);
    expect(Object.keys(runtime.participants).sort()).toEqual([
      "content-host",
      "region:main",
      "surface",
      "title",
    ]);
    expect(rendered.authoring.editor.getJSON()).toEqual(authoringBefore);
    expect(rendered.runtime.editor.getJSON()).toEqual(runtimeBefore);

    rendered.dispose();
    expect(rendered.isDisposed()).toBe(true);
    expect(rendered.authoring.editor.isDestroyed).toBe(true);
    expect(rendered.runtime.editor.isDestroyed).toBe(true);
    expect(rendered.host.isConnected).toBe(false);
    rendered = null;
  });

  it("observes hidden titles and title hosts from the raw rendered DOM", async () => {
    for (const composition of ["content", "full-bleed-image", "diptych"] as const) {
      const state = expandSlideCompositionCases().find(
        (candidate) => candidate.composition === composition && candidate.title === "hidden",
      );
      if (!state) throw new Error(`Hidden ${composition} state is not registered.`);

      rendered = await renderCompositionStateCase(state);
      rendered.runtime.host.style.padding = "0";
      for (const mounted of [rendered.authoring, rendered.runtime]) {
        const sample = measureCompositionGeometry(mounted, state);
        expect(sample.participants.title).toBeUndefined();
        expect(sample.rawParticipants.title).toMatchObject({
          display: "none",
          hasLayoutBox: false,
        });
        if (composition === "full-bleed-image" || composition === "diptych") {
          expect(sample.participants["content-host"]).toBeUndefined();
          expect(sample.rawParticipants["content-host"]).toMatchObject({
            display: "none",
            hasLayoutBox: false,
          });
        }
      }
      rendered.dispose();
      rendered = null;
    }
  });
});
