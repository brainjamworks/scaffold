import { useState } from "react";
import { render as renderBrowserReact } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/theme/course/styles.css";

import { CourseThemePortalBoundary, CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { OverlayBoundary } from "@/ui/overlays/OverlayBoundary";

import { Lightbox } from "./Lightbox";

const LARGE_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='1200' viewBox='0 0 1600 1200'%3E%3Crect width='1600' height='1200' fill='%236546dc'/%3E%3C/svg%3E";

const mountedRoots: Array<{ unmount: () => Promise<void> }> = [];

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) await root.unmount();
  document.body.replaceChildren();
});

describe("Lightbox in a browser", () => {
  it("reserves separate space for the caption and image position", async () => {
    await page.viewport(1440, 783);
    const rendered = await renderBrowserReact(<ThemedLightbox design="pocket-atlas" />);
    mountedRoots.push(rendered);

    const caption = await waitForElement(".sc-lightbox-caption");
    const status = await waitForElement(".sc-lightbox-status");
    const captionRect = caption.getBoundingClientRect();
    const statusRect = status.getBoundingClientRect();

    expect(captionRect.bottom).toBeLessThanOrEqual(statusRect.top);
  });

  it("keeps every lightbox action at least 44 pixels square", async () => {
    const rendered = await renderBrowserReact(<ThemedLightbox design="scaffold-flow" />);
    mountedRoots.push(rendered);

    await waitForElement(".sc-lightbox-button--close");
    const actions = document.querySelectorAll<HTMLElement>(".sc-lightbox-button");

    expect(actions).toHaveLength(3);
    for (const action of actions) {
      const style = getComputedStyle(action);
      expect(Number.parseFloat(style.width)).toBeGreaterThanOrEqual(44);
      expect(Number.parseFloat(style.height)).toBeGreaterThanOrEqual(44);
    }
  });

  it("applies the Pocket Atlas learner presentation", async () => {
    const rendered = await renderBrowserReact(<ThemedLightbox design="pocket-atlas" />);
    mountedRoots.push(rendered);

    const previous = await waitForElement(".sc-lightbox-button--prev");
    const caption = await waitForElement(".sc-lightbox-caption");
    const status = await waitForElement(".sc-lightbox-status");
    const previousStyle = getComputedStyle(previous);

    expect(previousStyle.borderTopWidth).toBe("2px");
    expect(previousStyle.borderRadius).toBe("0px");
    expect(previousStyle.boxShadow).not.toBe("none");
    expect(getComputedStyle(caption).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(status).fontFamily).toContain("Silkscreen");
  });

  it("applies the Scaffold Flow learner presentation", async () => {
    const rendered = await renderBrowserReact(<ThemedLightbox design="scaffold-flow" />);
    mountedRoots.push(rendered);

    const previous = await waitForElement(".sc-lightbox-button--prev");
    const caption = await waitForElement(".sc-lightbox-caption");
    const status = await waitForElement(".sc-lightbox-status");
    const previousStyle = getComputedStyle(previous);

    expect(previousStyle.borderTopWidth).toBe("1px");
    expect(previousStyle.borderRadius).not.toBe("0px");
    expect(previousStyle.boxShadow).toBe("none");
    expect(getComputedStyle(caption).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(status).fontFamily).toContain("Satoshi");
  });
});

function ThemedLightbox({ design }: Readonly<{ design: "pocket-atlas" | "scaffold-flow" }>) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  return (
    <CourseThemeProvider
      appearance="light"
      theme={{
        schemaVersion: 1,
        design: { id: design, revision: "1" },
        colourSystem: {
          id: design === "pocket-atlas" ? "pocket-atlas" : "scaffold-indigo",
          revision: "1",
        },
        overrides: {},
      }}
    >
      <div ref={setContainer}>
        <OverlayBoundary
          container={container}
          hostBoundary={CourseThemePortalBoundary}
          kind="viewport"
        >
          <Lightbox
            ariaLabel="Course image viewer"
            items={[
              {
                key: "first",
                src: LARGE_IMAGE,
                alt: "First course image",
                caption: "A caption that must remain readable below the expanded course image.",
              },
              {
                key: "second",
                src: LARGE_IMAGE,
                alt: "Second course image",
              },
            ]}
            onOpenChange={() => undefined}
            open
          />
        </OverlayBoundary>
      </div>
    </CourseThemeProvider>
  );
}

async function waitForElement(selector: string): Promise<HTMLElement> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return element;
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error(`Timed out waiting for ${selector}.`);
}
