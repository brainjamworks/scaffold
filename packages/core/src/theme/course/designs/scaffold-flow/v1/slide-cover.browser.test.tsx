import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { AuthoringSurfaceView } from "@/editor/surfaces/authoring/views/AuthoringSurfaceView";
import "@/editor/surfaces/authoring/variants/slide-cover.css";
import { RuntimeSurfaceView } from "@/editor/surfaces/runtime/views/RuntimeSurfaceView";
import "@/editor/surfaces/view/variants/slide-cover.css";
import "@/styles/globals.css";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import "./theme.css";

let root: Root | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

describe("Scaffold Flow Cover recipe", () => {
  it("keeps the Course canvas aligned through scaled authoring and runtime", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    root.render(
      <CourseThemeProvider appearance="light" theme={createDefaultPersistedCourseTheme()}>
        <div data-testid="authoring-host" style={{ width: 640 }}>
          <AuthoringSurfaceView settings={slideshowSettings}>
            <div className="sc-slideshow-authoring-surface-stage">
              <CoverSurface renderer="authoring" />
            </div>
          </AuthoringSurfaceView>
        </div>
        <RuntimeSurfaceView settings={slideshowSettings}>
          <CoverSurface renderer="runtime" />
        </RuntimeSurfaceView>
      </CourseThemeProvider>,
    );

    await waitForCondition(() => {
      const view = host.querySelector<HTMLElement>(".scaffold-authoring-surface-view");
      return Number(view?.dataset["authoringSlideScale"] ?? "1") < 1;
    });

    const authoringView = requiredElement<HTMLElement>(host, ".scaffold-authoring-surface-view");
    const authoringSurface = requiredElement<HTMLElement>(
      authoringView,
      '[data-surface-variant="slide-cover"]',
    );
    const runtimeView = requiredElement<HTMLElement>(host, ".scaffold-runtime-surface-view");
    const runtimeSurface = requiredElement<HTMLElement>(
      runtimeView,
      '[data-surface-variant="slide-cover"]',
    );
    const runtimeCover = requiredElement<HTMLElement>(
      runtimeSurface,
      ".sc-slide-cover-surface-view",
    );
    const authoringStyle = getComputedStyle(authoringSurface);
    const runtimeStyle = getComputedStyle(runtimeSurface);

    expect(Number(authoringView.dataset["authoringSlideScale"])).toBeLessThan(1);
    expect(authoringStyle.backgroundColor).toBe(runtimeStyle.backgroundColor);
    expect(authoringStyle.borderRadius).toBe(runtimeStyle.borderRadius);
    expect(authoringStyle.boxShadow).toBe(runtimeStyle.boxShadow);
    expect(authoringStyle.boxShadow).not.toBe("none");
    expect(authoringStyle.padding).toBe(getComputedStyle(runtimeCover).padding);
    expect(runtimeSurface.querySelector('[class*="sc-app-"]')).toBeNull();
  });
});

const slideshowSettings = {
  mode: "slideshow",
  overflowMode: "clip",
  surfaceSize: "16x9",
} as const;

function CoverSurface({ renderer }: { readonly renderer: "authoring" | "runtime" }) {
  const content = (
    <div
      {...(renderer === "authoring"
        ? { "data-node-view-content-react": "" }
        : { "data-surface-content": "" })}
    >
      <h1>Course-owned Cover</h1>
      <div data-slot="slide-cover-subtitle">
        <p>Shared presentation</p>
      </div>
    </div>
  );

  return renderer === "authoring" ? (
    <article
      className="sc-slide-cover-surface-view sc-slide-cover-surface-authoring-view"
      data-surface=""
      data-surface-variant="slide-cover"
      data-vertical-content-position="middle"
    >
      {content}
    </article>
  ) : (
    <article data-surface="" data-surface-variant="slide-cover">
      <div className="sc-slide-cover-surface-view sc-slide-cover-surface-runtime-view">
        {content}
      </div>
    </article>
  );
}

function requiredElement<T extends Element>(container: ParentNode, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element matching ${selector}`);
  return element;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + 2_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for browser state");
    await new Promise(requestAnimationFrame);
  }
}
