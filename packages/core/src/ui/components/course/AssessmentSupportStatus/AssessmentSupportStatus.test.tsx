// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { AssessmentSupportStatus } from "./AssessmentSupportStatus";

describe("AssessmentSupportStatus", () => {
  it("announces the revealed answer without exposing a button", () => {
    render(<AssessmentSupportStatus status="answer-revealed" />);

    const status = screen.getByRole("status", { name: "Answer revealed" });
    expect(status).toHaveClass("sc-course-assessment-support-status");
    expect(status).not.toHaveAttribute("tabindex");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
