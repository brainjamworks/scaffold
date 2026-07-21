import { afterEach, describe, expect, it } from "vite-plus/test";

import "./layout.css";

afterEach(() => {
  document.body.replaceChildren();
});

describe("bounded Section vertical content geometry", () => {
  it.each(["top", "middle", "bottom"] as const)(
    "preserves a generic fill occupant at %s",
    (position) => {
      const { viewport, content } = renderSectionViewport(position, {
        fill: true,
        height: "100%",
      });

      expect(viewport.getBoundingClientRect().height).toBeCloseTo(200, 0);
      expect(content.getBoundingClientRect().height).toBeCloseTo(200, 0);
      expect(getComputedStyle(viewport).alignContent).toBe("normal");
    },
  );

  it.each(["middle", "bottom"] as const)(
    "keeps oversized %s content reachable from its leading edge",
    (position) => {
      const { viewport, content } = renderSectionViewport(position, { height: "400px" });
      const viewportRect = viewport.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();

      expect(contentRect.top).toBeCloseTo(viewportRect.top, 0);
      expect(viewport.scrollHeight - viewport.clientHeight).toBeGreaterThanOrEqual(200);

      viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight;
      expect(content.getBoundingClientRect().bottom).toBeCloseTo(
        viewport.getBoundingClientRect().bottom,
        0,
      );
    },
  );

  it.each([
    ["top", 0],
    ["middle", 80],
    ["bottom", 160],
  ] as const)("positions bounded %s content when it fits", (position, expectedOffset) => {
    const { viewport, content } = renderSectionViewport(position, { height: "40px" });

    expect(content.getBoundingClientRect().top - viewport.getBoundingClientRect().top).toBeCloseTo(
      expectedOffset,
      0,
    );
  });

  it("keeps positioning an ordinary stack when only nested content has a fill marker", () => {
    const { viewport, content } = renderSectionViewport("bottom", { height: "40px" });
    const nestedFillMarker = document.createElement("div");
    nestedFillMarker.dataset.boundedPlacement = "fill";
    content.append(nestedFillMarker);

    expect(content.getBoundingClientRect().top - viewport.getBoundingClientRect().top).toBeCloseTo(
      160,
      0,
    );
  });
});

function renderSectionViewport(
  position: "top" | "middle" | "bottom",
  contentOptions: { fill?: boolean; height: string },
) {
  const region = document.createElement("div");
  region.dataset.node = "region";

  const boundedOwner = document.createElement("div");
  boundedOwner.dataset.boundedPlacement = "fill";

  const section = document.createElement("div");
  section.className = "sc-layout-section";
  section.dataset.verticalContentPosition = position;

  const sectionView = document.createElement("div");
  const viewport = document.createElement("div");
  viewport.className = "sc-layout-section__content";
  viewport.dataset.boundedViewport = "fill";
  viewport.style.cssText = "height: 200px; width: 200px; padding: 0; gap: 0; overflow: auto;";

  const content = document.createElement("div");
  content.style.height = contentOptions.height;
  if (contentOptions.fill) content.dataset.boundedPlacement = "fill";

  viewport.append(content);
  sectionView.append(viewport);
  section.append(sectionView);
  boundedOwner.append(section);
  region.append(boundedOwner);
  document.body.append(region);

  return { content, viewport };
}
