import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/theme/app/AppThemeProvider.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

import {
  AssessmentChoiceAuthoringAction,
  AssessmentChoiceAuthoringRow,
} from "@/ui/components/course/AssessmentChoiceAuthoringRow/AssessmentChoiceAuthoringRow";
import { AssessmentSelectableChoiceRow } from "@/ui/components/course/AssessmentSelectableChoiceRow/AssessmentSelectableChoiceRow";

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
});

describe("assessment choice row ownership and geometry", () => {
  it("fills a narrow authoring lane without shrinking its Course action targets", async () => {
    await page.viewport(800, 600);
    host = document.createElement("section");
    host.className = "sc-course sc-course-theme-scaffold-flow-v1 radix-themes light";
    host.style.cssText = [
      "container-type: inline-size",
      "width: 155px",
      "--gray-1: rgb(255 255 255)",
      "--gray-9: rgb(130 130 130)",
      "--gray-11: rgb(60 60 60)",
      "--gray-12: rgb(20 20 20)",
      "--gray-a3: rgb(230 230 230)",
      "--gray-a6: rgb(190 190 190)",
      "--accent-9: rgb(79 70 229)",
      "--accent-11: rgb(55 48 163)",
      "--radius-2: 4px",
      "--radius-3: 8px",
      "--radius-full: 8px",
      "--space-3: 8px",
      "--space-4: 12px",
    ].join(";");
    document.body.append(host);

    root = createRoot(host);
    root.render(
      <AssessmentChoiceAuthoringRow
        correct
        correctnessLabel="Toggle whether choice 1 is correct"
        onToggleCorrect={() => undefined}
        movementControl={
          <AssessmentChoiceAuthoringAction intent="move" label="Move choice">
            m
          </AssessmentChoiceAuthoringAction>
        }
        feedbackControl={
          <AssessmentChoiceAuthoringAction intent="feedback" label="Add feedback">
            i
          </AssessmentChoiceAuthoringAction>
        }
        deleteAction={{ label: "Delete choice 1", onAction: () => undefined }}
      >
        <p className="is-empty" data-placeholder="Enter your choice" />
      </AssessmentChoiceAuthoringRow>,
    );

    await waitForCondition(() => host?.querySelector(".sc-course-assessment-choice--authoring"));

    const row = requireElement<HTMLElement>(host, ".sc-course-assessment-choice--authoring");
    const targets = Array.from(row.querySelectorAll<HTMLElement>("button"));
    expect(Math.abs(row.getBoundingClientRect().width - host.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
    expect(targets).toHaveLength(4);
    for (const target of targets) {
      expect(target.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      expect(target.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    expect(row.querySelector("[class*='sc-app-']")).toBeNull();
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
      <AssessmentSelectableChoiceRow
        id="choice-a"
        inputType="radio"
        checked={false}
        disabled={false}
        state={null}
        onSelect={() => undefined}
      >
        Alpha
      </AssessmentSelectableChoiceRow>,
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

  it("keeps authoring and runtime surface roundness in parity while radios stay circular", async () => {
    host = document.createElement("section");
    host.className = "sc-course sc-course-theme-scaffold-flow-v1 radix-themes light";
    host.style.cssText = [
      "width: 420px",
      "--gray-1: rgb(255 255 255)",
      "--gray-11: rgb(60 60 60)",
      "--gray-12: rgb(20 20 20)",
      "--gray-a6: rgb(190 190 190)",
      "--gray-a10: rgb(80 80 80)",
      "--accent-9: rgb(79 70 229)",
      "--radius-2: 4px",
      "--radius-3: 8px",
      "--radius-full: 8px",
      "--space-3: 8px",
      "--space-4: 12px",
    ].join(";");
    document.body.append(host);

    root = createRoot(host);
    root.render(
      <>
        <AssessmentChoiceAuthoringRow
          correct={false}
          correctnessLabel="Toggle whether Alpha is correct"
          onToggleCorrect={() => undefined}
          deleteAction={{ label: "Delete choice 1", onAction: () => undefined }}
        >
          Alpha
        </AssessmentChoiceAuthoringRow>
        <AssessmentSelectableChoiceRow
          id="choice-a"
          inputType="radio"
          checked={false}
          disabled={false}
          state={null}
          onSelect={() => undefined}
        >
          Alpha
        </AssessmentSelectableChoiceRow>
      </>,
    );

    await waitForCondition(
      () => host?.querySelectorAll(".sc-course-assessment-choice").length === 2,
    );
    const [authoring, runtime] = Array.from(
      host.querySelectorAll<HTMLElement>(".sc-course-assessment-choice"),
    );
    if (!authoring || !runtime) throw new Error("Expected authoring and runtime choice rows");
    const radioIndicator = requireElement<HTMLElement>(
      runtime,
      '.sc-course-assessment-choice__indicator[data-shape="radio"]',
    );

    expect(getComputedStyle(authoring).borderRadius).toBe(getComputedStyle(runtime).borderRadius);
    expect(getComputedStyle(radioIndicator).borderRadius).toBe("50%");

    host.style.setProperty("--radius-3", "0px");
    host.style.setProperty("--radius-full", "0px");
    expect(getComputedStyle(authoring).borderRadius).toBe("0px");
    expect(getComputedStyle(runtime).borderRadius).toBe("0px");
    expect(getComputedStyle(radioIndicator).borderRadius).toBe("50%");

    host.style.setProperty("--radius-3", "8px");
    host.style.setProperty("--radius-full", "9999px");
    expect(getComputedStyle(authoring).borderRadius).toBe(getComputedStyle(runtime).borderRadius);
    expect(Number.parseFloat(getComputedStyle(authoring).borderRadius)).toBeGreaterThan(100);
    expect(getComputedStyle(radioIndicator).borderRadius).toBe("50%");
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
