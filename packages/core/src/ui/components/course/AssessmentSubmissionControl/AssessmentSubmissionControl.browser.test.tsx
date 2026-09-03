import { Theme } from "@radix-ui/themes";
import { createRoot, type Root } from "react-dom/client";
import type { CSSProperties } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

import { AssessmentSupportButton } from "../AssessmentSupportButton/AssessmentSupportButton";
import { AssessmentSubmissionControl } from "./AssessmentSubmissionControl";

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
});

describe("assessment Course control geometry", () => {
  it.each(["sc-course-theme-scaffold-flow-v1", "sc-course-theme-pocket-atlas-v1"] as const)(
    "keeps support controls separate and exactly 44px tall in %s",
    async (themeClass) => {
      host = document.createElement("div");
      document.body.append(host);
      root = createRoot(host);
      root.render(
        <Theme asChild radius="large">
          <section className={`sc-course ${themeClass}`}>
            <AssessmentSupportButton intent="hint">Show a hint</AssessmentSupportButton>
            <AssessmentSupportButton intent="feedback">Show feedback</AssessmentSupportButton>
            <AssessmentSubmissionControl state="submit" disabled onAction={() => {}} />
          </section>
        </Theme>,
      );

      await waitForCondition(() =>
        host?.querySelector(".sc-course-assessment-submission-control__button"),
      );

      const supportControls = Array.from(
        host.querySelectorAll<HTMLElement>(".sc-course-assessment-support-button"),
      );
      expect(supportControls).toHaveLength(2);
      const support = supportControls[0]!;
      const adjacentSupport = supportControls[1]!;
      const submission = requireElement<HTMLElement>(
        host,
        ".sc-course-assessment-submission-control__button",
      );

      expect(support.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      expect(adjacentSupport.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      expect(submission.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      expect(getComputedStyle(support).boxSizing).toBe("border-box");
      expect(getComputedStyle(support).marginLeft).toBe("0px");
      expect(adjacentSupport.getBoundingClientRect().left).toBeGreaterThanOrEqual(
        support.getBoundingClientRect().right,
      );
    },
  );

  it.each(["sc-course-theme-scaffold-flow-v1", "sc-course-theme-pocket-atlas-v1"] as const)(
    "preserves 44px support and submit targets after slideshow scaling in %s",
    async (themeClass) => {
      host = document.createElement("div");
      document.body.append(host);
      root = createRoot(host);
      const scaledCanvasStyle = {
        "--sc-slideshow-canvas-inverse-scale": 2.56,
        transform: "scale(0.390625)",
        transformOrigin: "top left",
      } as CSSProperties;
      root.render(
        <Theme asChild radius="large">
          <section className={`sc-course ${themeClass}`} style={scaledCanvasStyle}>
            <AssessmentSupportButton intent="hint">Show a hint</AssessmentSupportButton>
            <AssessmentSubmissionControl state="submit" disabled onAction={() => {}} />
          </section>
        </Theme>,
      );

      await waitForCondition(() =>
        host?.querySelector(".sc-course-assessment-submission-control__button"),
      );

      const support = requireElement<HTMLElement>(host, ".sc-course-assessment-support-button");
      const submission = requireElement<HTMLElement>(
        host,
        ".sc-course-assessment-submission-control__button",
      );

      expect(support.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      expect(submission.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    },
  );

  it("keeps the answer toggle and terminal status rounded under a non-full Course radius", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    root.render(
      <Theme asChild radius="large">
        <section className="sc-course sc-course-theme-scaffold-flow-v1">
          <AssessmentSupportButton intent="answer" aria-pressed="true">
            Show answer
          </AssessmentSupportButton>
          <AssessmentSubmissionControl state="correct" />
        </section>
      </Theme>,
    );

    await waitForCondition(() =>
      host?.querySelector(".sc-course-assessment-submission-control__status"),
    );

    const support = requireElement<HTMLElement>(host, ".sc-course-assessment-support-button");
    const submission = requireElement<HTMLElement>(
      host,
      ".sc-course-assessment-submission-control__status",
    );

    expect(Number.parseFloat(getComputedStyle(support).borderTopLeftRadius)).toBeGreaterThanOrEqual(
      support.getBoundingClientRect().height / 2,
    );
    expect(
      Number.parseFloat(getComputedStyle(submission).borderTopLeftRadius),
    ).toBeGreaterThanOrEqual(submission.getBoundingClientRect().height / 2);
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
    if (performance.now() > deadline) throw new Error("Timed out waiting for assessment controls");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
