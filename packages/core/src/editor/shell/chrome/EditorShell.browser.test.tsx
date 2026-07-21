import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import { EditorShell } from "./EditorShell";

describe("EditorShell rail geometry", () => {
  it("keeps the stage fixed while reserved rail content becomes ready", () => {
    const host = document.createElement("div");
    host.style.width = "800px";
    document.body.append(host);
    const root = createRoot(host);

    try {
      flushSync(() => {
        root.render(
          <EditorShell
            reserveLeftRail
            reserveRightRail
            stage={<main data-testid="stage">Stage</main>}
          />,
        );
      });

      const stage = host.querySelector<HTMLElement>(".sc-editor-stage");
      if (!stage) throw new Error("Expected the editor stage.");
      const before = stage.getBoundingClientRect();

      expect(host.querySelectorAll(".sc-editor-rail-slot")).toHaveLength(2);
      expect(host.querySelectorAll(".sc-editor-rail-viewport")).toHaveLength(0);

      flushSync(() => {
        root.render(
          <EditorShell
            reserveLeftRail
            reserveRightRail
            leftRail={<div>Left tools</div>}
            rightRail={<div>Right tools</div>}
            stage={<main data-testid="stage">Stage</main>}
          />,
        );
      });

      const after = stage.getBoundingClientRect();

      expect(host.querySelectorAll(".sc-editor-rail-viewport")).toHaveLength(2);
      expect(after.left).toBeCloseTo(before.left, 5);
      expect(after.width).toBeCloseTo(before.width, 5);
    } finally {
      flushSync(() => root.unmount());
      host.remove();
    }
  });
});
