// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { CourseButton, CourseIconButton } from "../CourseActions/CourseActions";
import {
  CourseAuthoringTextField,
  CourseCompletionCheckbox,
  CourseMediaSlider,
} from "../CourseInputs/CourseInputs";
import { CourseProgressMeter, CourseStatusBadge } from "../CourseIndicators/CourseIndicators";

describe("Course-owned controls", () => {
  it("maps Course action emphasis without exposing a Radix presentation contract", () => {
    render(
      <>
        <CourseButton emphasis="strong">Start quiz</CourseButton>
        <CourseIconButton aria-label="Next page" emphasis="muted" disabled>
          <span aria-hidden>next</span>
        </CourseIconButton>
      </>,
    );

    expect(screen.getByRole("button", { name: "Start quiz" })).toHaveClass("sc-course-action");
    expect(screen.getByRole("button", { name: "Start quiz" })).toHaveAttribute(
      "data-course-emphasis",
      "strong",
    );
    expect(screen.getByRole("button", { name: "Next page" })).toHaveClass("sc-course-icon-action");
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("owns Course authoring and activity input semantics", () => {
    const onCheckedChange = vi.fn();

    render(
      <>
        <label htmlFor="region-label">Region label</label>
        <CourseAuthoringTextField id="region-label" defaultValue="River" />
        <CourseCompletionCheckbox
          aria-label="Mark item as complete"
          checked={false}
          onCheckedChange={onCheckedChange}
        />
        <CourseMediaSlider
          ariaLabel="Volume"
          ariaValueText="50%"
          min={0}
          max={1}
          step={0.05}
          value={[0.5]}
        />
      </>,
    );

    expect(
      screen.getByLabelText("Region label").closest(".sc-course-authoring-text-field"),
    ).not.toBeNull();
    const checkbox = screen.getByRole("checkbox", { name: "Mark item as complete" });
    expect(checkbox).toHaveClass("sc-course-completion-checkbox");
    fireEvent.click(checkbox);
    expect(onCheckedChange).toHaveBeenCalledWith(true);

    const slider = screen.getByRole("slider", { name: "Volume" });
    expect(slider).toHaveAttribute("aria-valuetext", "50%");
    expect(slider.closest(".sc-course-media-slider")).not.toBeNull();
  });

  it("projects progress and educational status through semantic Course props", () => {
    render(
      <>
        <CourseProgressMeter value={3} max={5} label="3 of 5 cards mastered" />
        <CourseStatusBadge state="completed">Mastered</CourseStatusBadge>
      </>,
    );

    expect(screen.getByRole("progressbar", { name: "3 of 5 cards mastered" })).toHaveClass(
      "sc-course-progress-meter",
    );
    expect(screen.getByText("Mastered")).toHaveClass("sc-course-status-badge");
    expect(screen.getByText("Mastered")).toHaveAttribute("data-course-state", "completed");
  });
});
