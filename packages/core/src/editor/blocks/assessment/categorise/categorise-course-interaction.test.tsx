// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useMemo } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { pageAssessmentExperience } from "@/editor/blocks/assessment/shared/model/assessment-capability";
import { useAssessmentProblemFacade } from "@/runtime/assessment/runtime-facade";
import {
  createAssessmentRuntimeTestRoot,
  hasAssessmentRegistration,
  localAssessmentResponse,
  setAssessmentResponseField,
} from "@/runtime/assessment/test-utils";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";

import { categoriseResponseCodec } from "./assessment";
import { CategoriseCourseInteraction } from "./categorise-course-interaction";

const assessmentTargetId = "target000001";
const problemId = `artifact:artifact-1/block:${assessmentTargetId}`;

function CategoriseTargetRegistration() {
  const registration = useMemo(
    () => ({
      authoredBlockId: assessmentTargetId,
      targetId: assessmentTargetId,
      interactionKind: "classify" as const,
      response: categoriseResponseCodec,
      config: {
        experience: pageAssessmentExperience,
        settings: {
          feedbackMode: "on_submit" as const,
          isGraded: true,
          showAnswer: true,
          points: 1,
          maxAttempts: null,
        },
        hintsTotal: 0,
        learningEventDefinition: {
          interaction: {
            kind: "classify" as const,
            categories: [{ id: "category0001", label: "Animals" }],
            items: [{ id: "item00000001", label: "Otter" }],
          },
        },
      },
    }),
    [],
  );
  useAssessmentProblemFacade(registration);
  return null;
}

function FullSlideCategoriseTargetRegistration() {
  const registration = useMemo(
    () => ({
      authoredBlockId: assessmentTargetId,
      targetId: assessmentTargetId,
      interactionKind: "classify" as const,
      response: categoriseResponseCodec,
      config: {
        experience: pageAssessmentExperience,
        settings: {
          feedbackMode: "on_submit" as const,
          isGraded: true,
          showAnswer: true,
          points: 1,
          maxAttempts: null,
        },
        hintsTotal: 0,
        learningEventDefinition: {
          interaction: {
            kind: "classify" as const,
            categories: [
              { id: "category0001", label: "Animals" },
              { id: "category0002", label: "Plants" },
              { id: "category0003", label: "Minerals" },
              { id: "category0004", label: "Weather" },
              { id: "category0005", label: "Landforms" },
              { id: "category0006", label: "Materials" },
            ],
            items: [
              { id: "item00000001", label: "Otter" },
              { id: "item00000002", label: "Fern" },
              { id: "item00000003", label: "Granite" },
            ],
          },
        },
      },
    }),
    [],
  );
  useAssessmentProblemFacade(registration);
  return null;
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("CategoriseCourseInteraction", () => {
  it("updates the classify response through its supplied target identity without NodeView props", async () => {
    let assessmentStore: AssessmentStoreApi | null = null;

    render(
      createAssessmentRuntimeTestRoot({
        children: (
          <>
            <CategoriseTargetRegistration />
            <CategoriseCourseInteraction
              assessmentTargetId={assessmentTargetId}
              content={{
                categories: [{ id: "category0001", html: "<p>Animals</p>", label: "Animals" }],
                items: [{ id: "item00000001", html: "<p>Otter</p>", label: "Otter" }],
              }}
              presentation="inline"
            />
          </>
        ),
        onStore: (store) => {
          assessmentStore = store;
        },
      }),
    );

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });
    expect(setAssessmentResponseField(assessmentStore, problemId, "placements", {})).toBe(true);
    await waitFor(() => {
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({ placements: {} });
    });
    const currentItem = screen.getByRole("button", { name: "Select Otter for placement" });
    const category = screen.getByRole("button", { name: "Animals, 0 items" });
    expect(currentItem).toHaveAttribute("aria-pressed", "false");
    expect(category).toBeDisabled();
    fireEvent.click(currentItem);
    expect(currentItem).toHaveAttribute("aria-pressed", "true");
    expect(currentItem).toHaveAttribute("data-selected");
    expect(category).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Place Otter in Animals" }));

    await waitFor(() => {
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({
        placements: { item00000001: "category0001" },
      });
    });
    expect(screen.getByText("All items placed")).toBeInTheDocument();
    expect(document.querySelector("[data-current-item]")).not.toBeInTheDocument();
    expect(document.querySelector('[data-categorise-presentation="inline"]')).not.toBeNull();
  });

  it("lets learners browse every item in the inline presentation before placing one", () => {
    render(
      createAssessmentRuntimeTestRoot({
        children: (
          <>
            <FullSlideCategoriseTargetRegistration />
            <CategoriseCourseInteraction
              assessmentTargetId={assessmentTargetId}
              content={{
                categories: [
                  { id: "category0001", html: "<p>Animals</p>", label: "Animals" },
                  { id: "category0002", html: "<p>Plants</p>", label: "Plants" },
                  { id: "category0003", html: "<p>Minerals</p>", label: "Minerals" },
                  { id: "category0004", html: "<p>Weather</p>", label: "Weather" },
                  { id: "category0005", html: "<p>Landforms</p>", label: "Landforms" },
                  { id: "category0006", html: "<p>Materials</p>", label: "Materials" },
                ],
                items: [
                  { id: "item00000001", html: "<p>Otter</p>", label: "Otter" },
                  { id: "item00000002", html: "<p>Fern</p>", label: "Fern" },
                  { id: "item00000003", html: "<p>Granite</p>", label: "Granite" },
                ],
              }}
              presentation="inline"
            />
          </>
        ),
      }),
    );

    const currentItemContent = () =>
      document.querySelector<HTMLElement>(
        "[data-current-item] .sc-course-categorise__source-item-content",
      )?.textContent;
    const initialItem = currentItemContent();
    if (!initialItem) throw new Error("Expected an initial Categorise item.");
    const previous = screen.getByRole("button", { name: "Previous Categorise item" });
    const next = screen.getByRole("button", { name: "Next Categorise item" });

    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Item 1 of 3, not placed");
    expect(
      document.querySelector("[data-current-item] .sc-course-categorise__source-placement-state"),
    ).not.toBeInTheDocument();
    expect(document.querySelector("[data-current-item]")).not.toHaveAttribute(
      "data-item-transition",
    );
    expect(screen.getByText("1 of 3")).not.toHaveAttribute("role");
    fireEvent.click(screen.getByRole("button", { name: /Select .* for placement/ }));
    expect(document.querySelector("[data-current-item]")).toHaveAttribute("data-selected");
    fireEvent.click(next, { detail: 1 });
    expect(screen.getByRole("status")).toHaveTextContent("Item 2 of 3, not placed");
    expect(currentItemContent()).not.toBe(initialItem);
    const forwardDeparture = document.querySelector<HTMLElement>("[data-departing-item]");
    const forwardTrack = document.querySelector<HTMLElement>("[data-item-carousel-track]");
    expect(forwardTrack).toHaveAttribute("data-item-transition", "forward");
    expect(forwardTrack).toContainElement(forwardDeparture);
    expect(forwardTrack).toContainElement(document.querySelector("[data-current-item]"));
    expect(forwardDeparture).not.toHaveAttribute("data-item-transition");
    expect(forwardDeparture).toHaveTextContent(initialItem);
    expect(document.querySelector("[data-current-item]")).not.toHaveAttribute(
      "data-item-transition",
    );
    expect(document.querySelector("[data-current-item]")).not.toHaveAttribute("data-selected");
    expect(document.querySelector("[data-current-item]")).toHaveAttribute("aria-pressed", "false");
    expect(previous).toBeEnabled();
    if (!forwardTrack) throw new Error("Expected the item carousel track.");
    fireEvent.transitionEnd(forwardTrack, { propertyName: "transform" });
    expect(document.querySelector("[data-departing-item]")).not.toBeInTheDocument();

    fireEvent.click(previous, { detail: 1 });
    expect(screen.getByRole("status")).toHaveTextContent("Item 1 of 3, not placed");
    expect(currentItemContent()).toBe(initialItem);
    const backwardDeparture = document.querySelector<HTMLElement>("[data-departing-item]");
    const backwardTrack = document.querySelector<HTMLElement>("[data-item-carousel-track]");
    expect(backwardTrack).toHaveAttribute("data-item-transition", "backward");
    expect(backwardDeparture).not.toHaveAttribute("data-item-transition");
    expect(document.querySelector("[data-current-item]")).not.toHaveAttribute(
      "data-item-transition",
    );
    if (!backwardTrack) throw new Error("Expected the item carousel track.");
    fireEvent.transitionEnd(backwardTrack, { propertyName: "transform" });

    fireEvent.click(next, { detail: 0 });
    expect(document.querySelector("[data-departing-item]")).not.toBeInTheDocument();
    expect(document.querySelector("[data-current-item]")).not.toHaveAttribute(
      "data-item-transition",
    );
  });

  it("swaps Categorise items immediately when reduced motion is requested", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    render(
      createAssessmentRuntimeTestRoot({
        children: (
          <>
            <FullSlideCategoriseTargetRegistration />
            <CategoriseCourseInteraction
              assessmentTargetId={assessmentTargetId}
              content={{
                categories: [
                  { id: "category0001", html: "<p>Animals</p>", label: "Animals" },
                  { id: "category0002", html: "<p>Plants</p>", label: "Plants" },
                ],
                items: [
                  { id: "item00000001", html: "<p>Otter</p>", label: "Otter" },
                  { id: "item00000002", html: "<p>Fern</p>", label: "Fern" },
                ],
              }}
              presentation="full-slide"
            />
          </>
        ),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Next Categorise item" }), { detail: 1 });

    expect(screen.getByRole("button", { name: "Select Fern for placement" })).toBeInTheDocument();
    expect(document.querySelector("[data-item-carousel-track]")).not.toBeInTheDocument();
    expect(document.querySelector("[data-departing-item]")).not.toBeInTheDocument();
  });

  it("presents one full-slide item at a time with direct category targets", async () => {
    render(
      createAssessmentRuntimeTestRoot({
        children: (
          <>
            <FullSlideCategoriseTargetRegistration />
            <CategoriseCourseInteraction
              assessmentTargetId={assessmentTargetId}
              content={{
                categories: [
                  { id: "category0001", html: "<p>Animals</p>", label: "Animals" },
                  { id: "category0002", html: "<p>Plants</p>", label: "Plants" },
                  { id: "category0003", html: "<p>Minerals</p>", label: "Minerals" },
                  { id: "category0004", html: "<p>Weather</p>", label: "Weather" },
                  { id: "category0005", html: "<p>Landforms</p>", label: "Landforms" },
                  { id: "category0006", html: "<p>Materials</p>", label: "Materials" },
                ],
                items: [
                  { id: "item00000001", html: "<p>Otter</p>", label: "Otter" },
                  { id: "item00000002", html: "<p>Fern</p>", label: "Fern" },
                  { id: "item00000003", html: "<p>Granite</p>", label: "Granite" },
                ],
              }}
              presentation="full-slide"
            />
          </>
        ),
      }),
    );

    expect(screen.getByText("Sort this item")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Item 1 of 3, not placed");
    expect(document.querySelectorAll(".sc-course-categorise__source-item")).toHaveLength(1);
    const firstItem = document.querySelector<HTMLElement>("[data-current-item]");
    const firstItemContent = firstItem?.querySelector<HTMLElement>(
      ".sc-course-categorise__source-item-content",
    );
    if (!firstItem || !firstItemContent?.textContent) {
      throw new Error("Expected a current Categorise item.");
    }
    const currentLabel = firstItemContent.textContent.trim();
    expect(firstItem).toHaveAttribute("aria-pressed", "false");
    expect(firstItem).not.toHaveAttribute("data-selected");
    const categories = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".sc-course-categorise__category-choice"),
    );
    expect(categories).toHaveLength(6);
    expect(categories.every((category) => category.hasAttribute("disabled"))).toBe(true);
    expect(document.querySelectorAll("[data-categorise-category-preview]")).toHaveLength(6);

    fireEvent.click(firstItem);
    expect(firstItem).toHaveAttribute("aria-pressed", "true");
    expect(firstItem).toHaveAttribute("data-selected");
    expect(categories.every((category) => !category.hasAttribute("disabled"))).toBe(true);
    expect(document.querySelectorAll("[data-placement-ready]")).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: `Place ${currentLabel} in Animals` }), {
      detail: 1,
    });

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Item 1 of 2, not placed"),
    );
    expect(document.querySelectorAll(".sc-course-categorise__source-item")).toHaveLength(2);
    const departingItem = document.querySelector<HTMLElement>("[data-departing-item]");
    expect(document.querySelector("[data-item-carousel-track]")).toHaveAttribute(
      "data-item-transition",
      "forward",
    );
    expect(departingItem).not.toHaveAttribute("data-item-transition");
    expect(departingItem).toHaveTextContent(currentLabel);
    expect(document.querySelector("[data-current-item]")).not.toHaveAttribute(
      "data-item-transition",
    );
    expect(document.querySelector("[data-current-item]")).toHaveAttribute("aria-pressed", "false");
    expect(document.querySelector("[data-current-item]")).not.toHaveAttribute("data-selected");
    const animalsPreview = document.querySelector<HTMLElement>(
      '[data-id="category0001"] [data-categorise-category-preview]',
    );
    expect(animalsPreview).not.toBeNull();
    expect(animalsPreview).toHaveTextContent(currentLabel);
    expect(screen.getByRole("button", { name: "Previous Categorise item" })).toBeDisabled();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(
      document.querySelector("[data-current-item] .sc-course-categorise__source-placement-state"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review Animals, 1 item" }));
    const reviewDialog = await screen.findByRole("dialog", { name: "Items in Animals" });
    expect(reviewDialog).toBeInTheDocument();
    expect(within(reviewDialog).getByText(currentLabel)).toBeInTheDocument();
    expect(document.querySelector('[data-categorise-presentation="full-slide"]')).toHaveAttribute(
      "data-category-count",
      "6",
    );
  });
});
