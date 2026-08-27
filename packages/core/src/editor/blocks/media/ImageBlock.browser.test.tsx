import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";

import "./ImageBlock.css";
import "./ImageBlockAuthoringControls.css";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("ImageBlock authoring presentation", () => {
  it("keeps a selected image free from the Course text-selection paint", async () => {
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
        <div className="ProseMirror-selectednode">
          <div className="sc-course-image-block" data-authoring-frame="block">
            <div className="sc-course-image-block__stage" data-image-state="ready">
              <img
                alt="Pocket Atlas field guide"
                className="sc-course-image-block__media"
                src="data:image/gif;base64,R0lGODlhAQABAAAAACw="
              />
            </div>
          </div>
        </div>
      </CourseThemeProvider>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-image-block__media") !== null);

    const image = requiredElement<HTMLElement>(host, ".sc-course-image-block__media");
    expect(getComputedStyle(image, "::selection").backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });
});

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for ImageBlock state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
