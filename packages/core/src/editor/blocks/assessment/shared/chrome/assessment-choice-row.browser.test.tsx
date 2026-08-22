import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/editor/bounded-containers/view/bounded-container.css";
import "@/editor/blocks/assessment/shared/nodes/assessment-choices-group.css";
import "@/theme/app/AppThemeProvider.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";
import "@/editor/movement/view/movement-handles.css";

import {
  AssessmentChoiceAddButton,
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
    host.className = "sc-app sc-course sc-course-theme-scaffold-flow-v1 radix-themes light";
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
          <button
            type="button"
            className="sc-app-assessment-choice__authoring-action"
            aria-label="Move choice"
          >
            m
          </button>
        }
        feedbackControl={
          <button
            type="button"
            className="sc-app-assessment-choice__authoring-action"
            aria-label="Add feedback"
          >
            i
          </button>
        }
        deleteAction={{ label: "Delete choice 1", onAction: () => undefined }}
      >
        <p className="is-empty" data-placeholder="Enter your choice" />
      </AssessmentChoiceAuthoringRow>,
    );

    await waitForCondition(() => host?.querySelector(".sc-course-assessment-choice--authoring"));

    const row = requireElement<HTMLElement>(host, ".sc-course-assessment-choice--authoring");
    const targets = Array.from(row.querySelectorAll<HTMLElement>("button"));
    expect(
      Math.abs(row.getBoundingClientRect().width - host.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(1);
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
    expect(targets).toHaveLength(4);
    for (const target of targets) {
      expect(target.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      expect(target.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    expect(row).toHaveClass("sc-app-assessment-choice-authoring-surface");
    expect(row.querySelector(".sc-course-assessment-choice__authoring-action")).toBeNull();
    expect(row.querySelectorAll(".sc-app-assessment-choice__authoring-action")).toHaveLength(4);

    host.setAttribute("data-authoring-movement-silhouette", "");
    row.setAttribute("data-authoring-movement-silhouette-surface", "");
    expect(getComputedStyle(row).outlineStyle).toBe("none");
  });

  it("keeps the learner row full-width and native-radio based inside Course scope", async () => {
    host = document.createElement("section");
    host.className = "sc-app sc-course sc-course-theme-scaffold-flow-v1 radix-themes light";
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
    expect(
      Math.abs(row.getBoundingClientRect().width - host.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(1);
    expect(radio.type).toBe("radio");
    expect(getComputedStyle(indicator).borderRadius).toBe("50%");
    expect(row.querySelector("[class^='sc-app-']")).toBeNull();
  });

  it("matches the add-choice row height and aligns its plus with the movement axis", async () => {
    host = document.createElement("section");
    host.className = "sc-app sc-course sc-course-theme-scaffold-flow-v1 radix-themes light";
    host.style.cssText = [
      "width: 420px",
      "--gray-1: rgb(255 255 255)",
      "--gray-11: rgb(60 60 60)",
      "--gray-12: rgb(20 20 20)",
      "--gray-a6: rgb(190 190 190)",
      "--gray-a7: rgb(160 160 160)",
      "--accent-9: rgb(79 70 229)",
      "--radius-2: 4px",
      "--radius-3: 8px",
      "--radius-full: 8px",
      "--space-1: 4px",
      "--space-3: 12px",
      "--space-4: 16px",
      "--sc-course-author-stroke-width: 1px",
    ].join(";");
    document.body.append(host);

    root = createRoot(host);
    root.render(
      <>
        <AssessmentChoiceAuthoringRow
          correct={false}
          correctnessLabel="Toggle whether Alpha is correct"
          onToggleCorrect={() => undefined}
          movementControl={
            <AssessmentChoiceAuthoringAction
              className={[
                "sc-app-contained-movement-handle",
                "sc-app-compact-movement-handle",
                "sc-app-contained-movement-handle--row-offset",
              ].join(" ")}
              intent="move"
              label="Move choice"
            >
              m
            </AssessmentChoiceAuthoringAction>
          }
          deleteAction={{ label: "Delete choice 1", onAction: () => undefined }}
        >
          Alpha
        </AssessmentChoiceAuthoringRow>
        <AssessmentChoiceAddButton />
      </>,
    );

    await waitForCondition(() => host?.querySelector(".sc-app-assessment-choice-add"));
    const row = requireElement<HTMLElement>(host, ".sc-course-assessment-choice--authoring");
    const movement = requireElement<HTMLElement>(row, ".sc-app-contained-movement-handle");
    const add = requireElement<HTMLElement>(host, ".sc-app-assessment-choice-add");
    const plus = requireElement<SVGElement>(add, "svg");
    const movementRect = movement.getBoundingClientRect();
    const plusRect = plus.getBoundingClientRect();
    const centreDelta = Math.abs(
      movementRect.left + movementRect.width / 2 - (plusRect.left + plusRect.width / 2),
    );

    expect(add.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(centreDelta).toBeLessThanOrEqual(0.5);
  });

  it("keeps authoring and runtime surface geometry in parity while radios stay circular", async () => {
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

    expect(authoring.getBoundingClientRect().height).toBe(54);
    expect(runtime.getBoundingClientRect().height).toBe(54);
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
    expect(getComputedStyle(authoring).borderRadius).toBe("8px");
    expect(getComputedStyle(radioIndicator).borderRadius).toBe("50%");
  });

  it("keeps Pocket Atlas radio semantics and result states visually distinct", async () => {
    host = document.createElement("section");
    host.className = "sc-app sc-course sc-course-theme-pocket-atlas-v1 radix-themes light";
    host.style.cssText = [
      "width: 420px",
      "--pa-ink: rgb(32 22 79)",
      "--pa-paper: rgb(255 252 242)",
      "--pa-paper-raised: rgb(255 255 255)",
      "--pa-violet: rgb(101 70 220)",
      "--pa-keyline: 2px",
      "--sc-course-state-correct-border: rgb(21 128 61)",
      "--sc-course-state-correct-background: rgb(220 252 231)",
      "--sc-course-state-correct-text: rgb(22 101 52)",
      "--sc-course-state-correct-indicator: rgb(21 128 61)",
    ].join(";");
    document.body.append(host);

    root = createRoot(host);
    root.render(
      <AssessmentSelectableChoiceRow
        id="choice-a"
        inputType="radio"
        checked
        disabled
        state="correct"
        submitted
        onSelect={() => undefined}
      >
        Alpha
      </AssessmentSelectableChoiceRow>,
    );

    await waitForCondition(() => host?.querySelector(".sc-course-assessment-choice"));
    const row = requireElement<HTMLElement>(host, ".sc-course-assessment-choice");
    const indicator = requireElement<HTMLElement>(
      row,
      '.sc-course-assessment-choice__indicator[data-shape="radio"]',
    );

    expect(getComputedStyle(row).backgroundColor).toBe("rgb(220, 252, 231)");
    expect(getComputedStyle(row).borderColor).toBe("rgb(21, 128, 61)");
    expect(getComputedStyle(indicator).borderRadius).toBe("50%");
    expect(getComputedStyle(indicator).color).toBe("rgb(21, 128, 61)");
  });

  it("keeps the Pocket Atlas choice shadow inside its scroll lane", async () => {
    const { row, scrollLane } = await mountPocketAtlasChoiceLane();
    const scrollRect = scrollLane.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const shadow = shadowOffset(getComputedStyle(row).boxShadow);

    expect(scrollRect.right - rowRect.right).toBeGreaterThanOrEqual(shadow.inlineEnd);
    expect(scrollRect.bottom - rowRect.bottom).toBeGreaterThanOrEqual(shadow.blockEnd);
  });

  it("keeps the Pocket Atlas choice border visible on hover", async () => {
    const { row, scrollLane } = await mountPocketAtlasChoiceLane();

    await userEvent.hover(row);
    await waitForCondition(() => new DOMMatrix(getComputedStyle(row).transform).m41 <= -2);

    const scrollRect = scrollLane.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    expect(getComputedStyle(row).borderTopWidth).toBe("2px");
    expect(getComputedStyle(row).borderLeftWidth).toBe("2px");
    expect(rowRect.top).toBeGreaterThanOrEqual(scrollRect.top);
    expect(rowRect.left).toBeGreaterThanOrEqual(scrollRect.left);
  });

  it("inherits the Pocket Atlas popover header foreground in dark mode", async () => {
    host = document.createElement("section");
    host.className = "sc-course sc-course-theme-pocket-atlas-v1 radix-themes dark";
    document.body.append(host);

    root = createRoot(host);
    root.render(
      <header className="sc-course-popover-surface__header">
        <h2 className="sc-course-popover-surface__title">Feedback</h2>
      </header>,
    );

    await waitForCondition(() => host?.querySelector(".sc-course-popover-surface__title"));
    const header = requireElement<HTMLElement>(host, ".sc-course-popover-surface__header");
    const title = requireElement<HTMLElement>(host, ".sc-course-popover-surface__title");
    expect(getComputedStyle(title).color).toBe(getComputedStyle(header).color);
  });
});

function requireElement<T extends Element>(rootElement: ParentNode, selector: string): T {
  const element = rootElement.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}`);
  return element;
}

async function mountPocketAtlasChoiceLane(): Promise<{
  row: HTMLElement;
  scrollLane: HTMLElement;
}> {
  host = document.createElement("section");
  host.className = "sc-course sc-course-theme-pocket-atlas-v1 radix-themes light";
  host.style.width = "420px";
  document.body.append(host);

  root = createRoot(host);
  root.render(
    <div className="sc-course-assessment-choices-group" data-bounded-scroll-frame="">
      <div data-bounded-scroll="" className="sc-course-assessment-choices-scroll">
        <fieldset className="sc-course-assessment-choices-fieldset">
          <div className="sc-course-assessment-choices-list">
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
          </div>
        </fieldset>
      </div>
    </div>,
  );

  await waitForCondition(() => host?.querySelector(".sc-course-assessment-choice"));
  return {
    scrollLane: requireElement<HTMLElement>(host, ".sc-course-assessment-choices-scroll"),
    row: requireElement<HTMLElement>(host, ".sc-course-assessment-choice"),
  };
}

function shadowOffset(boxShadow: string): { blockEnd: number; inlineEnd: number } {
  const match = boxShadow.match(/(-?[\d.]+)px\s+(-?[\d.]+)px/);
  if (!match) throw new Error(`Expected a pixel offset shadow, received: ${boxShadow}`);
  return {
    inlineEnd: Math.max(0, Number(match[1])),
    blockEnd: Math.max(0, Number(match[2])),
  };
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline)
      throw new Error("Timed out waiting for assessment choice row");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
