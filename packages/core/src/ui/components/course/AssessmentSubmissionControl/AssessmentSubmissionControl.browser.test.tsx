import { Theme } from "@radix-ui/themes";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

import { AssessmentSupportButton } from "../AssessmentSupportButton/AssessmentSupportButton";
import { AssessmentSupportStatus } from "../AssessmentSupportStatus/AssessmentSupportStatus";
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
  it("keeps both interactive control families at least 44px tall", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    root.render(
      <Theme asChild radius="large">
        <section className="sc-course sc-course-theme-scaffold-flow-v1">
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
    expect(Number.parseFloat(getComputedStyle(support).borderTopLeftRadius)).toBeGreaterThan(0);
    expect(Number.parseFloat(getComputedStyle(submission).borderTopLeftRadius)).toBeGreaterThan(0);
  });

  it("keeps terminal statuses rounded under a non-full Course radius", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    root.render(
      <Theme asChild radius="large">
        <section className="sc-course sc-course-theme-scaffold-flow-v1">
          <AssessmentSupportStatus status="answer-revealed" />
          <AssessmentSubmissionControl state="correct" />
        </section>
      </Theme>,
    );

    await waitForCondition(() =>
      host?.querySelector(".sc-course-assessment-submission-control__status"),
    );

    const support = requireElement<HTMLElement>(host, ".sc-course-assessment-support-status");
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
