import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import "@/theme/course/designs/scaffold-flow/v1/checklist.css";
import "@/theme/course/designs/scaffold-flow/v1/comparison.css";
import "@/theme/course/designs/scaffold-flow/v1/flashcard.css";
import "@/theme/course/designs/scaffold-flow/v1/gallery.css";
import "@/theme/course/designs/scaffold-flow/v1/glossary.css";
import "@/theme/course/designs/scaffold-flow/v1/numbered-list.css";
import "@/theme/course/designs/scaffold-flow/v1/timeline.css";

const mountedRoots: Root[] = [];
const roundnessValues = ["square", "subtle", "rounded", "full"] as const;
const deleteActions = [
  ["timeline", "sc-course-timeline__delete"],
  ["flashcard", "sc-course-flashcard__delete"],
  ["numbered-list", "sc-course-numbered-list__delete"],
  ["checklist", "sc-course-checklist__delete"],
  ["glossary", "sc-course-glossary__delete"],
  ["comparison", "sc-course-comparison__delete"],
  ["gallery", "sc-course-gallery__delete"],
] as const;

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Course-embedded delete actions", () => {
  it("adapts every migrated delete action to Course roundness", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    root.render(
      <AppThemeProvider appearance="light">
        <main>
          {roundnessValues.map((roundness) => (
            <CourseThemeProvider
              key={roundness}
              theme={courseThemeWithRoundness(roundness)}
              appearance="light"
            >
              <section data-roundness={roundness}>
                {deleteActions.map(([name, className]) => (
                  <button
                    key={name}
                    type="button"
                    className={className}
                    data-delete-action={name}
                    style={{ width: 44, height: 44 }}
                  >
                    Delete {name}
                  </button>
                ))}
              </section>
            </CourseThemeProvider>
          ))}
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(
      () => host.querySelectorAll("[data-delete-action]").length === deleteActions.length * 4,
    );

    for (const [name] of deleteActions) {
      const radii = Object.fromEntries(
        roundnessValues.map((roundness) => {
          const action = requiredElement<HTMLElement>(
            host,
            `[data-roundness="${roundness}"] [data-delete-action="${name}"]`,
          );
          return [roundness, Number.parseFloat(getComputedStyle(action).borderTopLeftRadius)];
        }),
      ) as Record<(typeof roundnessValues)[number], number>;

      expect(radii.square).toBe(0);
      expect(radii.subtle).toBeGreaterThan(radii.square);
      expect(radii.rounded).toBeGreaterThan(radii.subtle);
      expect(radii.rounded).toBeLessThan(22);
      expect(radii.full).toBeGreaterThanOrEqual(22);
    }
  });
});

function courseThemeWithRoundness(roundness: (typeof roundnessValues)[number]) {
  return {
    ...createDefaultPersistedCourseTheme(),
    overrides: { design: { roundness } },
  };
}

function requiredElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for delete actions.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
