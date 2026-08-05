// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { AssessmentControlLayout } from "./AssessmentControlLayout";

describe("AssessmentControlLayout", () => {
  it("keeps support before submission in explicit structural zones", () => {
    const { container } = render(
      <AssessmentControlLayout
        support={<button type="button">Hint</button>}
        submission={<span>Attempt 1</span>}
      />,
    );

    const layout = container.querySelector('[data-slot="assessment-controls"]');
    expect(layout).toBeInstanceOf(HTMLElement);
    const support = layout?.querySelector('[data-assessment-control-zone="support"]');
    const submission = layout?.querySelector('[data-assessment-control-zone="submission"]');
    if (!support || !submission) throw new Error("Expected both assessment control zones");

    expect(support).toContainElement(screen.getByRole("button", { name: "Hint" }));
    expect(submission).toHaveTextContent("Attempt 1");
    expect(support.compareDocumentPosition(submission) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(submission).toHaveAttribute("contenteditable", "false");
    expect(layout?.querySelector(".sc-course-assessment-control-layout")).toBeNull();
  });
});
