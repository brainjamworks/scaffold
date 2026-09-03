// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import { quizBlockDefinition } from "@/editor/blocks/assessment/quiz/quiz-definition";

import { builtInSurfaceAuthoringViewMap } from "./surface-authoring-views";

describe("Quiz Surface configuration", () => {
  it("projects the existing Quiz settings beside Surface header and footer settings", () => {
    const view = builtInSurfaceAuthoringViewMap.get("slide-quiz");

    expect(view).toBeDefined();
    expect(view?.quickMenu).toBeUndefined();
    expect(view?.settingsSheet?.title).toBe("Quiz settings");
    expect(view?.settingsSheet?.sections.map(({ id }) => id)).toEqual([
      "behaviour",
      "scoring",
      "timer",
      "surface-regions",
    ]);
    expect(
      view?.settingsSheet?.sections.flatMap(({ items }) =>
        items.map((item) => ("name" in item ? item.name : item.id)),
      ),
    ).toEqual([
      "question.allowBacktracking",
      "question.reviewTiming",
      "question.reviewDetail",
      "question.attemptsPerQuestion",
      "question.isGraded",
      "question.passingScore",
      "question.timer.enabled",
      "question.timer.durationSeconds",
      "surface.header.enabled",
      "surface.footer.enabled",
    ]);
    expect(quizBlockDefinition.quickMenu).toBeUndefined();
  });
});
