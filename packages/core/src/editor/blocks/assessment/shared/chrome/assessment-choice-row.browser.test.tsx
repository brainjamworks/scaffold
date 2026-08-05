import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/theme/app/AppThemeProvider.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

import { AssessmentChoiceAuthoringRow } from "@/ui/components/app/AssessmentChoiceAuthoringRow/AssessmentChoiceAuthoringRow";
import { AssessmentAuthoringIconAction } from "@/ui/components/app/AssessmentAuthoringIconAction/AssessmentAuthoringIconAction";
import { SelectableChoiceRuntimeRow } from "./SelectableChoiceRuntimeRow";

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
});

describe("assessment choice row ownership and geometry", () => {
  it("fills a narrow authoring lane without shrinking its App action targets", async () => {
    await page.viewport(800, 600);
    host = document.createElement("section");
    host.className = "sc-app radix-themes light";
    host.style.cssText = "container-type: inline-size; width: 155px;";
    document.body.append(host);

    root = createRoot(host);
    root.render(
      <AssessmentChoiceAuthoringRow
        correct
        onToggleCorrect={() => undefined}
        movementControl={
          <button type="button" aria-label="Move choice" className="sc-app-contained-movement-handle" />
        }
        feedbackControl={
          <AssessmentAuthoringIconAction label="Add feedback">i</AssessmentAuthoringIconAction>
        }
        deleteAction={{ label: "Delete choice 1", onAction: () => undefined }}
      >
        <p className="is-empty" data-placeholder="Enter your choice" />
      </AssessmentChoiceAuthoringRow>,
    );

    await waitForCondition(() => host?.querySelector(".sc-app-assessment-choice-row"));

    const row = requireElement<HTMLElement>(host, ".sc-app-assessment-choice-row");
    const targets = Array.from(row.querySelectorAll<HTMLElement>("button"));
    expect(Math.abs(row.getBoundingClientRect().width - host.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
    expect(targets).toHaveLength(4);
    for (const target of targets) {
      expect(target.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      expect(target.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  });

  it("keeps the learner row full-width and native-radio based inside Course scope", async () => {
    host = document.createElement("section");
    host.className = "sc-course sc-course-theme-scaffold-flow-v1 radix-themes light";
    host.style.cssText = [
      "width: 420px",
      "--gray-1: rgb(255 255 255)",
      "--gray-12: rgb(20 20 20)",
      "--gray-a6: rgb(190 190 190)",
      "--gray-a10: rgb(80 80 80)",
      "--accent-9: rgb(79 70 229)",
    ].join(";");
    document.body.append(host);

    root = createRoot(host);
    root.render(
      <SelectableChoiceRuntimeRow
        id="choice-a"
        inputType="radio"
        checked={false}
        disabled={false}
        state={null}
        onSelect={() => undefined}
      >
        Alpha
      </SelectableChoiceRuntimeRow>,
    );

    await waitForCondition(() => host?.querySelector(".sc-course-assessment-choice"));

    const row = requireElement<HTMLElement>(host, ".sc-course-assessment-choice");
    const radio = requireElement<HTMLInputElement>(row, 'input[type="radio"]');
    const indicator = requireElement<HTMLElement>(
      row,
      '.sc-course-assessment-choice__indicator[data-shape="radio"]',
    );
    expect(Math.abs(row.getBoundingClientRect().width - host.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    expect(radio.type).toBe("radio");
    expect(getComputedStyle(indicator).borderRadius).toBe("50%");
    expect(row.querySelector("[class^='sc-app-']")).toBeNull();
  });
});

function requireElement<T extends Element>(rootElement: ParentNode, selector: string): T {
  const element = rootElement.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for assessment choice row");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
