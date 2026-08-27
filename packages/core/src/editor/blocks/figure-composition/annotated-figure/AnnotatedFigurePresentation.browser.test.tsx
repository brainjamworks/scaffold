import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";
import "@/styles/globals.css";

import "./AnnotatedFigure.css";
import { AnnotatedFigureSurface } from "./AnnotatedFigureSurface";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Annotated Figure presentation contract", () => {
  it("keeps the empty media stage usable without a Course recipe", async () => {
    const host = document.createElement("div");
    host.className = "sc-course-annotated-figure";
    host.style.width = "640px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <AnnotatedFigureSurface
          data={{ type: "annotated_figure", source: null, alt: "", captionDisplay: "list" }}
          annotations={[]}
          fileUrl={null}
        />
      </CourseThemeProvider>,
    );

    const empty = await waitForElement<HTMLElement>(host, ".sc-course-annotated-figure__empty");
    expect(empty.getBoundingClientRect().height).toBeGreaterThan(300);
  });

  it("gives Pocket Atlas a deliberate empty state and 44px pin target", async () => {
    const host = document.createElement("div");
    host.className = "sc-course-annotated-figure";
    host.style.width = "640px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <AppThemeProvider appearance="light">
        <CourseThemeProvider
          appearance="light"
          theme={{
            schemaVersion: 1,
            design: { id: "pocket-atlas", revision: "1" },
            colourSystem: { id: "pocket-atlas", revision: "1" },
            overrides: {},
          }}
        >
          <AnnotatedFigureSurface
            data={{
              type: "annotated_figure",
              source: { mode: "managed", mediaId: "annotated-figure-pocket" },
              alt: "Pocket Atlas annotated diagram",
              captionDisplay: "list",
            }}
            annotations={[{ id: "pocket-pin", number: 1, x: 50, y: 50 }]}
            fileUrl={twoToOneImageUrl()}
            onActivatePin={() => undefined}
          />
        </CourseThemeProvider>
      </AppThemeProvider>,
    );

    const pin = await waitForElement<HTMLButtonElement>(
      host,
      ".sc-course-annotated-figure__pin-activate",
    );
    await waitForCondition(() => pin.getBoundingClientRect().width > 0);
    const marker = requiredElement<HTMLElement>(pin, ".sc-course-annotated-figure__pin-number");

    expect(pin.getBoundingClientRect().width).toBe(44);
    expect(pin.getBoundingClientRect().height).toBe(44);
    expect(getComputedStyle(pin).borderRadius).toBe("0px");
    expect(marker.getBoundingClientRect().width).toBe(28);
    expect(marker.getBoundingClientRect().height).toBe(28);
    expect(getComputedStyle(marker).borderTopWidth).toBe("2px");
    expect(getComputedStyle(marker).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  it("collapses the authoring caption frame when the figure has no annotations", () => {
    const content = document.createElement("div");
    content.className = "sc-course-annotated-figure__content";
    content.dataset.hasAnnotations = "false";

    const nodeViewContent = document.createElement("div");
    nodeViewContent.dataset.nodeViewContentReact = "";

    const renderer = document.createElement("div");
    renderer.className = "react-renderer";

    const captionFrame = document.createElement("div");
    captionFrame.className = "sc-course-annotated-figure__caption-frame";

    renderer.append(captionFrame);
    nodeViewContent.append(renderer);
    content.append(nodeViewContent);
    document.body.append(content);

    expect(getComputedStyle(captionFrame).display).toBe("none");
  });

  it("reserves a caption row only for the Pocket Atlas list lightbox", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <CourseThemeProvider
        appearance="light"
        theme={{
          schemaVersion: 1,
          design: { id: "pocket-atlas", revision: "1" },
          colourSystem: { id: "pocket-atlas", revision: "1" },
          overrides: {},
        }}
      >
        <div
          className="sc-course-annotated-figure__runtime-lightbox-composition"
          data-caption-display="list"
          data-testid="list-lightbox"
          style={{ blockSize: "480px" }}
        />
        <div
          className="sc-course-annotated-figure__runtime-lightbox-composition"
          data-caption-display="popover"
          data-testid="popover-lightbox"
          style={{ blockSize: "480px" }}
        >
          <AnnotatedFigureSurface
            data={{
              type: "annotated_figure",
              source: { mode: "managed", mediaId: "annotated-figure-lightbox" },
              alt: "Pocket Atlas expanded annotated diagram",
              captionDisplay: "popover",
            }}
            annotations={[{ id: "lightbox-pin", number: 1, x: 50, y: 50 }]}
            fileUrl={twoToOneImageUrl()}
            onActivatePin={() => undefined}
            presentation="lightbox"
          />
        </div>
      </CourseThemeProvider>,
    );

    const list = await waitForElement<HTMLElement>(host, '[data-testid="list-lightbox"]');
    const popover = requiredElement<HTMLElement>(host, '[data-testid="popover-lightbox"]');

    expect(getComputedStyle(list).gridTemplateRows.split(" ")).toHaveLength(2);
    expect(getComputedStyle(popover).gridTemplateRows.split(" ")).toHaveLength(1);

    const pin = requiredElement<HTMLButtonElement>(
      popover,
      ".sc-course-annotated-figure__pin-activate",
    );
    const marker = requiredElement<HTMLElement>(pin, ".sc-course-annotated-figure__pin-number");
    expect(pin.getBoundingClientRect().width).toBe(44);
    expect(pin.getBoundingClientRect().height).toBe(44);
    expect(marker.getBoundingClientRect().width).toBe(28);
    expect(marker.getBoundingClientRect().height).toBe(28);
  });
});

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}

async function waitForElement<T extends Element>(root: ParentNode, selector: string): Promise<T> {
  await waitForCondition(() => root.querySelector(selector));
  return requiredElement<T>(root, selector);
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for browser state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function twoToOneImageUrl(): string {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200'%3E%3Crect width='400' height='200' fill='%2300A689'/%3E%3C/svg%3E";
}
