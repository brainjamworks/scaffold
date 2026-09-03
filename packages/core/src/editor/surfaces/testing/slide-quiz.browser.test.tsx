import {
  EmbeddedNodeIdSchema,
  QuizAttemptStateSchema,
  QuizSettingsSchema,
} from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { projectCourseStructure } from "@/document/model/course-structure";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { projectCategoriseLearnerNode } from "@/editor/blocks/assessment/categorise/assessment";
import { projectDragDropLearnerNode } from "@/editor/blocks/assessment/drag-drop/assessment";
import { projectDropdownLearnerNode } from "@/editor/blocks/assessment/dropdown/assessment";
import { projectFillBlanksLearnerNode } from "@/editor/blocks/assessment/fill-blanks/assessment";
import { projectImageHotspotLearnerNode } from "@/editor/assessment/image-hotspot/assessment";
import { projectMatchingLearnerNode } from "@/editor/blocks/assessment/matching/assessment";
import { projectMcqLearnerNode } from "@/editor/blocks/assessment/mcq/assessment";
import { projectMultiselectLearnerNode } from "@/editor/blocks/assessment/multiselect/assessment";
import { projectSequencingLearnerNode } from "@/editor/blocks/assessment/sequencing/assessment";
import { SURFACE_CATEGORISE_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-categorise-question-node";
import { SURFACE_DRAG_DROP_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-drag-drop-question-node";
import { SURFACE_DROPDOWN_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-dropdown-question-node";
import { SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-fill-blanks-question-node";
import { SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-image-hotspot-question-node";
import { SURFACE_MATCHING_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-matching-question-node";
import { SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-multiple-choice-question-node";
import { SURFACE_MULTISELECT_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-multiselect-question-node";
import { SURFACE_SEQUENCING_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-sequencing-question-node";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { createQuizQuestion } from "@/editor/surfaces/model/templates/assessment/slide-quiz";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import type { AssessmentPort, MediaPort } from "@/host/ports";
import { AssessmentRuntimeProvider } from "@/runtime/assessment/AssessmentRuntimeProvider";
import { assessmentQuizOutcome } from "@/runtime/assessment/test-utils";
import { SlideshowPlayer } from "@/runtime/players/slideshow/SlideshowPlayer";
import { checkRuntimeDocumentReadiness } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";

import "@/styles/globals.css";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

const mountedRoots: Root[] = [];
const runtimeComposition = createCoreScaffoldRuntimeComposition();
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;
const QUIZ_ID = "quiz00000001";
const QUESTION_IDS = ["questn_00001", "questn_00002"] as const;
const QUESTION_FAMILY_GEOMETRY = [
  {
    family: "categorise",
    expectedOverflow: "auto",
    presentationSelector: '[data-categorise-presentation="full-slide"]',
    scrollProperty: "overflowX",
    scrollSelector: ".sc-course-categorise__bin-grid",
  },
  {
    family: "sequencing",
    expectedOverflow: "auto",
    presentationSelector: '[data-sequencing-presentation="full-slide"]',
    scrollProperty: "overflowY",
    scrollSelector: ".sc-course-sequencing__scroll",
  },
  {
    family: "matching",
    expectedOverflow: "auto",
    presentationSelector: '[data-matching-presentation="full-slide"]',
    scrollProperty: "overflowY",
    scrollSelector: ".sc-course-matching__runtime-board",
  },
  {
    family: "image-hotspot",
    expectedOverflow: "hidden",
    presentationSelector: '[data-image-hotspot-presentation="full-slide"]',
    scrollProperty: "overflowY",
    scrollSelector:
      '.sc-course-image-hotspot-fit-stage[data-image-hotspot-presentation="full-slide"]',
  },
  {
    family: "mcq",
    expectedOverflow: "auto",
    presentationSelector: '[data-mcq-presentation="full-slide"]',
    scrollProperty: "overflowY",
    scrollSelector: ".sc-course-selectable-choice-interaction__viewport",
  },
  {
    family: "multiselect",
    expectedOverflow: "auto",
    presentationSelector: '[data-multiselect-presentation="full-slide"]',
    scrollProperty: "overflowY",
    scrollSelector: ".sc-course-selectable-choice-interaction__viewport",
  },
  {
    family: "dropdown",
    expectedOverflow: "auto",
    presentationSelector: '[data-dropdown-presentation="full-slide"]',
    scrollProperty: "overflowY",
    scrollSelector: ".sc-course-dropdown-interaction__focal",
  },
  {
    family: "drag-drop",
    expectedOverflow: "auto",
    presentationSelector: '[data-drag-drop-presentation="full-slide"]',
    scrollProperty: "overflowY",
    scrollSelector: ".sc-course-drag-drop-tray",
  },
  {
    family: "fill-blanks",
    expectedOverflow: "auto",
    presentationSelector: '[data-fill-blanks-presentation="full-slide"]',
    scrollProperty: "overflowY",
    scrollSelector: ".sc-course-fill-blanks__scroll",
  },
] as const;
const QUESTION_FAMILY_THEME_GEOMETRY = (["scaffold-flow", "pocket-atlas"] as const).flatMap(
  (design) => QUESTION_FAMILY_GEOMETRY.map((entry) => ({ ...entry, design })),
);

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("full-slide Quiz runtime geometry", () => {
  it.each(["scaffold-flow", "pocket-atlas"] as const)(
    "uses a contained full-canvas Quiz composition in %s",
    async (design) => {
      await page.viewport(1100, 700);
      const { host } = mountQuiz({ design, choiceCount: 4 });
      await waitForCondition(() => host.querySelector(".sc-slide-quiz-surface-runtime-view"));
      normalizePlayerGeometry(host);

      const surface = requiredElement<HTMLElement>(host, ".sc-slide-quiz-surface-runtime-view");
      const aggregate = requiredElement<HTMLElement>(surface, "[data-surface-quiz]");
      const state = requiredElement<HTMLElement>(surface, ".sc-course-slide-quiz__state");
      const dock = requiredElement<HTMLElement>(surface, ".sc-course-slide-quiz__action-dock");
      const start = requiredElement<HTMLButtonElement>(
        surface,
        "button.sc-course-quiz__primary-action",
      );

      expect(requiredElement(host, ".sc-course")).toHaveClass(`sc-course-theme-${design}-v1`);
      expect(surface.getBoundingClientRect().height).toBeGreaterThan(540);
      expect(aggregate).toHaveAttribute("data-node", "surface_quiz");
      expect(surface.querySelector('[data-node="quiz"]')).toBeNull();
      expect(surface.querySelector("[data-block-runtime-frame]")).toBeNull();
      expect(state.getBoundingClientRect().width).toBeGreaterThan(
        surface.getBoundingClientRect().width * 0.5,
      );
      expect(start.getBoundingClientRect().right).toBeGreaterThan(
        surface.getBoundingClientRect().right - 72,
      );
      expect(start.getBoundingClientRect().bottom).toBeGreaterThan(
        surface.getBoundingClientRect().bottom - 72,
      );
      expect(
        Math.abs(dock.getBoundingClientRect().bottom - surface.getBoundingClientRect().bottom),
      ).toBeLessThan(2);

      start.click();
      await waitForCondition(() => host.querySelector('[data-quiz-status="in_progress"]'));
      const stage = surface;
      const prompt = requiredElement<HTMLElement>(stage, '[data-slot="assessment-prompt"]');
      const interaction = requiredElement<HTMLElement>(
        stage,
        '[data-mcq-presentation="full-slide"]',
      );
      const questionStage = requiredElement<HTMLElement>(
        surface,
        `[data-surface-quiz] > [data-surface-assessment-question][data-id="${QUESTION_IDS[0]}"]`,
      );
      const questionActions = requiredElement<HTMLElement>(
        questionStage,
        '[data-slot="assessment-actions-group"]',
      );
      const controls = requiredElement<HTMLElement>(surface, ".sc-course-quiz__runtime-controls");
      const standaloneSubmissions = Array.from(
        surface.querySelectorAll<HTMLElement>(".sc-assessment-control-layout__submission"),
      );

      expect(getComputedStyle(questionStage).display).toBe("contents");
      expect(getComputedStyle(questionActions).borderBlockStartWidth).toBe("0px");
      expect(getComputedStyle(questionActions).backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(stage.getBoundingClientRect().width).toBeGreaterThan(
        surface.getBoundingClientRect().width * 0.94,
      );
      expect(prompt.getBoundingClientRect().width).toBeGreaterThan(
        stage.getBoundingClientRect().width * 0.85,
      );
      expect(interaction.getBoundingClientRect().width).toBeGreaterThan(
        stage.getBoundingClientRect().width * 0.85,
      );
      expect(interaction.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        prompt.getBoundingClientRect().bottom - 1,
      );
      expect(stage.scrollHeight).toBeLessThanOrEqual(stage.clientHeight + 1);
      expect(
        standaloneSubmissions.every((element) => getComputedStyle(element).display === "none"),
      ).toBe(true);
      expect(
        Math.abs(dock.getBoundingClientRect().bottom - surface.getBoundingClientRect().bottom),
      ).toBeLessThan(2);
      const progress = requiredElement<HTMLElement>(surface, ".sc-course-slide-quiz__progress");
      const surfaceCenter =
        surface.getBoundingClientRect().left + surface.getBoundingClientRect().width / 2;
      const progressCenter =
        progress.getBoundingClientRect().left + progress.getBoundingClientRect().width / 2;
      expect(progressCenter).toBeLessThan(
        surfaceCenter - surface.getBoundingClientRect().width * 0.2,
      );
      expect(
        requiredElement<HTMLButtonElement>(controls, "button[aria-label='Next question']"),
      ).toBeDisabled();
      expect(
        requiredElement<HTMLButtonElement>(host, "button[aria-label='Next slide']"),
      ).toBeDisabled();
    },
  );

  it("contains long prompts and dense choices, preserves keyboard flow, and keeps final submit bottom-right", async () => {
    await page.viewport(760, 500);
    const { host } = mountQuiz({
      design: "pocket-atlas",
      choiceCount: 18,
      height: 430,
      longLabels: true,
      longPrompt: true,
      width: 720,
    });
    await waitForCondition(() => host.querySelector(".sc-slide-quiz-surface-runtime-view"));
    normalizePlayerGeometry(host);
    requiredElement<HTMLButtonElement>(host, "button.sc-course-quiz__primary-action").click();
    await waitForCondition(() => host.querySelector('[data-quiz-status="in_progress"]'));

    const surface = requiredElement<HTMLElement>(host, ".sc-slide-quiz-surface-runtime-view");
    const prompt = requiredElement<HTMLElement>(surface, '[data-slot="assessment-prompt"]');
    const viewport = requiredElement<HTMLElement>(
      surface,
      ".sc-course-selectable-choice-interaction__viewport",
    );
    const firstInteraction = requiredElement<HTMLElement>(
      surface,
      '[data-mcq-presentation="full-slide"]',
    );
    const visibleRadios = Array.from(
      firstInteraction.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    );

    expect(prompt.scrollHeight).toBeGreaterThan(prompt.clientHeight);
    expect(getComputedStyle(prompt).overflowY).toBe("auto");
    expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
    expect(getComputedStyle(viewport).overflowY).toBe("auto");
    const scrollHint = requiredElement<HTMLElement>(firstInteraction, "[data-bounded-scroll-hint]");
    await waitForCondition(() => viewport.hasAttribute("data-bounded-scroll-overflow"));
    expect(getComputedStyle(scrollHint).visibility).toBe("visible");
    viewport.scrollTop = viewport.scrollHeight;
    viewport.dispatchEvent(new Event("scroll"));
    await waitForCondition(() => viewport.hasAttribute("data-bounded-scroll-end"));
    expect(getComputedStyle(scrollHint).visibility).toBe("hidden");
    visibleRadios[0]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    await waitForCondition(
      () =>
        firstInteraction
          .querySelectorAll<HTMLElement>(".sc-course-assessment-choice")[1]
          ?.hasAttribute("data-selected") === true,
    );
    const next = requiredElement<HTMLButtonElement>(surface, "button[aria-label='Next question']");
    expect(next).toBeEnabled();
    next.click();
    await waitForCondition(
      () => surface.getAttribute("data-active-question-id") === QUESTION_IDS[1],
    );
    expect(surface).toHaveAttribute("data-active-question-id", QUESTION_IDS[1]);
    const secondInteraction = requiredElement<HTMLElement>(
      surface,
      '[data-mcq-presentation="full-slide"]',
    );
    const secondRadio = secondInteraction.querySelector<HTMLInputElement>('input[type="radio"]');
    if (!secondRadio) throw new Error("Expected the final question choices.");
    secondRadio.click();
    await waitForCondition(() => {
      const button = surface.querySelector<HTMLButtonElement>(
        "button.sc-course-quiz__primary-action",
      );
      return button?.textContent?.includes("Submit quiz") && !button.disabled;
    });
    const submit = requiredElement<HTMLButtonElement>(
      surface,
      "button.sc-course-quiz__primary-action",
    );
    const dock = requiredElement<HTMLElement>(surface, ".sc-course-slide-quiz__action-dock");
    expect(submit.textContent).toContain("Submit quiz");
    expect(submit.getBoundingClientRect().right).toBeGreaterThan(
      dock.getBoundingClientRect().right - 72,
    );
    expect(surface.scrollHeight).toBeLessThanOrEqual(surface.clientHeight + 1);
  });

  it("keeps an unconfigured hotspot question local to Quiz setup without trapping the learner", async () => {
    await page.viewport(1100, 700);
    const { host } = mountQuiz({
      design: "pocket-atlas",
      choiceCount: 4,
      questions: [unconfiguredHotspotQuestion(QUESTION_IDS[0])],
    });
    await waitForCondition(() => host.querySelector(".sc-slide-quiz-surface-runtime-view"));
    normalizePlayerGeometry(host);

    const surface = requiredElement<HTMLElement>(host, ".sc-slide-quiz-surface-runtime-view");
    const start = requiredElement<HTMLButtonElement>(
      surface,
      "button.sc-course-quiz__primary-action",
    );
    const nextSlide = requiredElement<HTMLButtonElement>(host, "button[aria-label='Next slide']");

    expect(start).toBeDisabled();
    expect(surface).toHaveTextContent("1 question needs an image before this quiz can begin.");
    await waitForCondition(() => !nextSlide.disabled);
    expect(nextSlide).toBeEnabled();
  });

  it.each(QUESTION_FAMILY_THEME_GEOMETRY)(
    "gives nested $family content its family full-slide presenter and bounded viewport in $design",
    async ({
      design,
      expectedOverflow,
      family,
      presentationSelector,
      scrollProperty,
      scrollSelector,
    }) => {
      await page.viewport(1100, 700);
      const { host } = mountQuiz({
        design,
        choiceCount: 4,
        questions: [familyQuestion(family, QUESTION_IDS[0])],
      });
      await waitForCondition(() => host.querySelector(".sc-slide-quiz-surface-runtime-view"));
      normalizePlayerGeometry(host);
      requiredElement<HTMLButtonElement>(host, "button.sc-course-quiz__primary-action").click();
      await waitForCondition(() => host.querySelector('[data-quiz-status="in_progress"]'));

      const surface = requiredElement<HTMLElement>(host, ".sc-slide-quiz-surface-runtime-view");
      const interaction = requiredElement<HTMLElement>(surface, presentationSelector);
      const stageFamily = family === "mcq" ? "multiple-choice" : family;
      await waitForCondition(
        () => interaction.matches(scrollSelector) || interaction.querySelector(scrollSelector),
      );
      const scroll = interaction.matches(scrollSelector)
        ? interaction
        : requiredElement<HTMLElement>(interaction, scrollSelector);
      const prompt = requiredElement<HTMLElement>(
        surface,
        `[data-surface-quiz] > [data-surface-assessment-question][data-id="${QUESTION_IDS[0]}"] [data-slot="assessment-prompt"]`,
      );

      expect(interaction.getBoundingClientRect().width).toBeGreaterThan(
        surface.getBoundingClientRect().width * 0.84,
      );
      expect(interaction.getBoundingClientRect().height).toBeGreaterThan(
        surface.getBoundingClientRect().height * 0.35,
      );
      expect(interaction.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        prompt.getBoundingClientRect().bottom - 1,
      );
      expect(surface.className).not.toMatch(
        /sc-(?:selectable-choice|dropdown|fill-blanks)-slide-surface|sc-slide-(?:categorise|sequencing|matching|image-hotspot|multiple-choice|multiselect|dropdown|fill-blanks)-question-surface/,
      );
      expect(
        surface.querySelector(
          `[data-full-slide-question-stage][data-full-slide-question-family="${stageFamily}"]`,
        ),
      ).not.toBeNull();
      expect(
        getComputedStyle(
          requiredElement<HTMLElement>(
            surface,
            `[data-surface-quiz] > [data-full-slide-question-stage][data-full-slide-question-family="${stageFamily}"]`,
          ),
        ).display,
      ).toBe("contents");
      expect(getComputedStyle(scroll)[scrollProperty]).toBe(expectedOverflow);
      expect(surface.scrollHeight).toBeLessThanOrEqual(surface.clientHeight + 1);
    },
  );

  it("keeps reviewed content contained, navigation bottom-docked, and unlocks Surface exit", async () => {
    await page.viewport(1100, 700);
    const { host } = mountQuiz({
      choiceCount: 4,
      design: "pocket-atlas",
      fullReview: true,
    });
    await waitForCondition(() => host.querySelector(".sc-slide-quiz-surface-runtime-view"));
    normalizePlayerGeometry(host);
    requiredElement<HTMLButtonElement>(host, "button.sc-course-quiz__primary-action").click();
    await waitForCondition(() => host.querySelector('[data-quiz-status="in_progress"]'));

    const surface = requiredElement<HTMLElement>(host, ".sc-slide-quiz-surface-runtime-view");
    const firstInteraction = requiredElement<HTMLElement>(
      surface,
      '[data-mcq-presentation="full-slide"]',
    );
    requiredElement<HTMLInputElement>(firstInteraction, 'input[type="radio"]').click();
    const next = requiredElement<HTMLButtonElement>(surface, "button[aria-label='Next question']");
    await waitForCondition(() => !next.disabled);
    next.click();
    await waitForCondition(
      () => surface.getAttribute("data-active-question-id") === QUESTION_IDS[1],
    );
    const secondInteraction = requiredElement<HTMLElement>(
      surface,
      '[data-mcq-presentation="full-slide"]',
    );
    requiredElement<HTMLInputElement>(secondInteraction, 'input[type="radio"]').click();
    await waitForCondition(() => {
      const submit = surface.querySelector<HTMLButtonElement>(
        "button.sc-course-quiz__primary-action",
      );
      return submit?.textContent?.includes("Submit quiz") && !submit.disabled;
    });
    requiredElement<HTMLButtonElement>(surface, "button.sc-course-quiz__primary-action").click();
    await waitForCondition(() => surface.getAttribute("data-quiz-status") === "completed");

    const completion = requiredElement<HTMLElement>(
      surface,
      '[data-testid="quiz-completion-summary"]',
    );
    expect(completion).toHaveTextContent("Quiz complete");
    expect(completion).toHaveTextContent("2 / 2");
    expect(completion).toHaveTextContent("100%");
    expect(surface.querySelector('[data-testid="quiz-answer-review-context"]')).toBeNull();
    expect(surface.querySelector('[data-mcq-presentation="full-slide"]')).toBeNull();
    requiredElement<HTMLButtonElement>(surface, "button[aria-label='Review answers']").click();
    await waitForCondition(() => surface.hasAttribute("data-quiz-reviewing-answers"));

    const reviewContext = requiredElement<HTMLElement>(
      surface,
      '[data-testid="quiz-answer-review-context"]',
    );
    const stage = surface;
    const controls = requiredElement<HTMLElement>(
      surface,
      '[data-testid="quiz-answer-review-controls"]',
    );
    const dock = requiredElement<HTMLElement>(surface, ".sc-course-slide-quiz__action-dock");

    expect(surface).toHaveAttribute("data-quiz-status", "completed");
    expect(surface).toHaveAttribute("data-quiz-reviewing-answers", "true");
    expect(surface.getAttribute("data-active-question-id")).toBe(QUESTION_IDS[0]);
    expect(reviewContext.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      stage.getBoundingClientRect().top,
    );
    expect(reviewContext.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      stage.getBoundingClientRect().bottom,
    );
    expect(
      Math.abs(dock.getBoundingClientRect().bottom - surface.getBoundingClientRect().bottom),
    ).toBeLessThan(2);
    expect(requiredElement(controls, "button[aria-label='Next question']")).toBeVisible();
    expect(requiredElement(dock, "button[aria-label='Quiz summary']")).toBeVisible();
    expect(
      requiredElement<HTMLButtonElement>(host, "button[aria-label='Next slide']"),
    ).toBeEnabled();
  });

  it.each(["scaffold-flow", "pocket-atlas"] as const)(
    "preserves effective Quiz action targets in a 0.625-scale %s player",
    async (design) => {
      await page.viewport(700, 440);
      const { host } = mountQuiz({
        choiceCount: 4,
        design,
        height: 360,
        width: 640,
      });
      await waitForCondition(() => host.querySelector(".sc-slide-quiz-surface-runtime-view"));
      normalizePlayerGeometry(host);
      const canvas = requiredElement<HTMLElement>(host, ".sc-slideshow-player__canvas");
      await waitForCondition(
        () => Number(canvas.style.getPropertyValue("--sc-slideshow-canvas-inverse-scale")) > 1,
      );

      const start = requiredElement<HTMLButtonElement>(
        host,
        "button.sc-course-quiz__primary-action",
      );
      expect(start.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      expect(start.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      start.click();
      await waitForCondition(() => host.querySelector('[data-quiz-status="in_progress"]'));

      const surface = requiredElement<HTMLElement>(host, ".sc-slide-quiz-surface-runtime-view");
      const choice = requiredElement<HTMLElement>(surface, ".sc-course-assessment-choice");
      const next = requiredElement<HTMLButtonElement>(
        surface,
        "button[aria-label='Next question']",
      );
      expect(choice.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      expect(next.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      expect(surface.scrollHeight).toBeLessThanOrEqual(surface.clientHeight + 1);
    },
  );
});

function mountQuiz({
  choiceCount,
  design,
  fullReview = false,
  height = 576,
  longLabels = false,
  longPrompt = false,
  questions,
  width = 1024,
}: {
  choiceCount: number;
  design: "scaffold-flow" | "pocket-atlas";
  fullReview?: boolean;
  height?: number;
  longLabels?: boolean;
  longPrompt?: boolean;
  questions?: JSONContent[];
  width?: number;
}) {
  const host = document.createElement("div");
  host.style.cssText = `position:absolute;inset:0 auto auto 0;width:${width}px;height:${height}px;`;
  document.body.append(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  const content = quizDocument({
    choiceCount,
    fullReview,
    longLabels,
    longPrompt,
    ...(questions ? { questions } : {}),
  });
  const readiness = checkRuntimeDocumentReadiness(content, runtimeComposition, coreProductAccess);
  if (readiness.status !== "supported") {
    throw new Error(`Expected supported Quiz fixture: ${JSON.stringify(readiness)}`);
  }

  root.render(
    <ScaffoldServicesProvider
      ports={{ assessment: createQuizPort({ fullReview }), media: quizMediaPort() }}
    >
      <CourseThemeProvider appearance="light" theme={courseTheme(design)}>
        <ScaffoldArtifactIdentityProvider artifactId="artifact-1">
          <AssessmentRuntimeProvider>
            <SlideshowPlayer
              artifactId="artifact-1"
              preparedDocument={readiness.preparedDocument}
              structure={requireSlideshowStructure(content)}
            />
          </AssessmentRuntimeProvider>
        </ScaffoldArtifactIdentityProvider>
      </CourseThemeProvider>
    </ScaffoldServicesProvider>,
  );
  return { host };
}

function quizDocument({
  choiceCount,
  fullReview,
  longLabels,
  longPrompt,
  questions,
}: {
  choiceCount: number;
  fullReview: boolean;
  longLabels: boolean;
  longPrompt: boolean;
  questions?: JSONContent[];
}): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-quiz");
  if (!definition) throw new Error("Expected slide-quiz Surface definition.");
  const afterDefinition = builtInSurfaceVariantRegistry.get("slide-cover");
  if (!afterDefinition) throw new Error("Expected slide-cover Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const quiz = surface.content?.[0];
  if (!quiz) throw new Error("Expected Quiz Surface content.");
  const document = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId: "surface00001",
    initialCourseSectionTitle: "Assessment",
  });
  const courseDocument = document.content?.[0];
  const section = courseDocument?.content?.find((child) => child.type === "courseSection");
  if (courseDocument?.type !== "courseDocument" || !section) {
    throw new Error("Expected a Slideshow document fixture.");
  }

  courseDocument.content = [
    section,
    {
      ...surface,
      content: [
        {
          ...quiz,
          attrs: {
            ...quiz.attrs,
            id: QUIZ_ID,
            settings: QuizSettingsSchema.parse({
              ...(fullReview ? { reviewDetail: "full_review" } : {}),
            }),
          },
          content: questions ?? [
            question(QUESTION_IDS[0], "one", choiceCount, longLabels, longPrompt),
            question(QUESTION_IDS[1], "two", 2, false, false),
          ],
        },
      ],
    },
    afterDefinition.createSurface({
      surfaceId: EmbeddedNodeIdSchema.parse("surface00002"),
    }),
  ];
  normalizeRuntimeFixtureIds(document);
  return document;
}

function question(
  id: string,
  ordinal: string,
  choiceCount: number,
  longLabels: boolean,
  longPrompt: boolean,
): JSONContent {
  const authored = createQuizQuestion(SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE);
  return projectMcqLearnerNode({
    ...authored,
    attrs: { ...authored.attrs, id },
    content: (authored.content ?? []).map((child) => {
      if (child.type === "assessment_prompt") {
        return {
          ...child,
          content: Array.from({ length: longPrompt ? 6 : 1 }, (_, index) =>
            paragraph(`Question ${ordinal}: choose the strongest supported answer ${index + 1}.`),
          ),
        };
      }
      if (child.type !== "assessment_choices_group") return child;
      return {
        ...child,
        content: Array.from({ length: choiceCount }, (_, index) => ({
          type: "selectable_choice",
          attrs: { id: `choice_${ordinal}${String(index + 1).padStart(2, "0")}` },
          content: [
            {
              type: "selectable_choice_body",
              content: [
                paragraph(
                  longLabels
                    ? `Answer ${ordinal} ${index + 1} with qualifications and realistic supporting detail that wraps across several lines`
                    : `Answer ${ordinal} ${index + 1}`,
                ),
              ],
            },
          ],
        })),
      };
    }),
  });
}

function sequencingQuestion(id: string): JSONContent {
  const authored = createQuizQuestion(SURFACE_SEQUENCING_QUESTION_NODE_TYPE);
  let itemIndex = 0;
  return projectSequencingLearnerNode({
    ...authored,
    attrs: { ...authored.attrs, id },
    content: (authored.content ?? []).map((child) => {
      if (child.type === "assessment_prompt") {
        return { ...child, content: [paragraph("Arrange the project phases in delivery order.")] };
      }
      if (child.type !== "sequencing_items_group") return child;
      return {
        ...child,
        content: (child.content ?? []).map((item) => {
          itemIndex += 1;
          return {
            ...item,
            content: [paragraph(`Project phase ${itemIndex} with enough detail to test the rail`)],
          };
        }),
      };
    }),
  });
}

function familyQuestion(
  family: (typeof QUESTION_FAMILY_GEOMETRY)[number]["family"],
  id: string,
): JSONContent {
  if (family === "mcq") return question(id, "one", 4, false, false);
  if (family === "sequencing") return sequencingQuestion(id);
  if (family === "drag-drop") return dragDropQuestion(id);

  const definitions = {
    categorise: {
      nodeType: SURFACE_CATEGORISE_QUESTION_NODE_TYPE,
      project: projectCategoriseLearnerNode,
    },
    dropdown: {
      nodeType: SURFACE_DROPDOWN_QUESTION_NODE_TYPE,
      project: projectDropdownLearnerNode,
    },
    "fill-blanks": {
      nodeType: SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE,
      project: projectFillBlanksLearnerNode,
    },
    "image-hotspot": {
      nodeType: SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE,
      project: projectImageHotspotLearnerNode,
    },
    matching: {
      nodeType: SURFACE_MATCHING_QUESTION_NODE_TYPE,
      project: projectMatchingLearnerNode,
    },
    multiselect: {
      nodeType: SURFACE_MULTISELECT_QUESTION_NODE_TYPE,
      project: projectMultiselectLearnerNode,
    },
  } as const;
  const fixture = definitions[family];
  const authored = createQuizQuestion(fixture.nodeType);
  const withFixtureContent =
    family === "image-hotspot"
      ? {
          ...authored,
          content: (authored.content ?? []).map((child) =>
            child.type === "image_hotspot_canvas"
              ? {
                  ...child,
                  attrs: {
                    ...child.attrs,
                    data: {
                      image: {
                        mode: "managed",
                        mediaId: "quiz-hotspot-image",
                        alt: "Simple landscape diagram",
                      },
                      hotspots: [],
                      maxClicks: 1,
                    },
                  },
                }
              : child,
          ),
        }
      : authored;
  return fixture.project({
    ...withFixtureContent,
    attrs: { ...withFixtureContent.attrs, id },
  });
}

function dragDropQuestion(id: string): JSONContent {
  const authored = createQuizQuestion(SURFACE_DRAG_DROP_QUESTION_NODE_TYPE);
  const markers = [
    { id: "marker000001", label: "Northern harbour", visualOverride: null },
    { id: "marker000002", label: "Old lighthouse", visualOverride: null },
  ];
  return projectDragDropLearnerNode({
    ...authored,
    attrs: {
      ...authored.attrs,
      id,
      assessment: {
        correctPlacements: markers.map((marker, index) => ({
          markerId: marker.id,
          geometry: { kind: "circle", centerX: 25 + index * 50, centerY: 50, radius: 8 },
        })),
        feedbackByMarkerId: {},
        summaryFeedback: null,
      },
    },
    content: (authored.content ?? []).map((child) => {
      if (child.type === "assessment_prompt") {
        return { ...child, content: [paragraph("Place each harbour marker on the chart.")] };
      }
      if (child.type !== "drag_drop_canvas") return child;
      return {
        ...child,
        attrs: {
          ...child.attrs,
          id: "canvas000001",
          data: {
            image: {
              mode: "managed",
              mediaId: "quiz-drag-drop-image",
              alt: "Harbour chart",
            },
            imageAspectRatio: 16 / 9,
            defaultMarkerVisual: { kind: "preset", preset: "dot" },
            markers,
          },
        },
      };
    }),
  });
}

function unconfiguredHotspotQuestion(id: string): JSONContent {
  const authored = createQuizQuestion(SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE);
  return projectImageHotspotLearnerNode({
    ...authored,
    attrs: { ...authored.attrs, id },
  });
}

function quizHotspotImage(): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#dce8f2"/><path d="M0 560 Q720 280 1600 500 V900 H0Z" fill="#6ba37c"/><circle cx="440" cy="300" r="120" fill="#f1bf62"/></svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function quizMediaPort(): MediaPort {
  return {
    resolve: async () => quizHotspotImage(),
    upload: async () => {
      throw new Error("Uploads are unavailable in the Quiz browser fixture.");
    },
  };
}

function createQuizPort({ fullReview = false }: { fullReview?: boolean } = {}): AssessmentPort {
  return {
    type: "runtime",
    submit: vi.fn(),
    quiz: {
      startAttempt: vi.fn(async ({ groupId }) =>
        assessmentQuizOutcome(
          QuizAttemptStateSchema.parse({
            attemptId: "attempt-1",
            groupId,
            status: "in_progress",
            currentTargetId: QUESTION_IDS[0],
            submittedTargetIds: [],
            startedAt: "2026-08-29T12:00:00.000Z",
            finishedAt: null,
            expiresAt: null,
            score: null,
            successStatus: null,
            resultsByTargetId: {},
            answerReviewAuthorized: false,
          }),
        ),
      ),
      submitQuestion: vi.fn(),
      finishAttempt: vi.fn(async ({ attemptId, groupId }) =>
        assessmentQuizOutcome(
          QuizAttemptStateSchema.parse({
            attemptId,
            groupId,
            status: "completed",
            currentTargetId: null,
            submittedTargetIds: [...QUESTION_IDS],
            startedAt: "2026-08-29T12:00:00.000Z",
            finishedAt: "2026-08-29T12:05:00.000Z",
            expiresAt: null,
            score: { scaled: 1, raw: 2, min: 0, max: 2 },
            successStatus: null,
            resultsByTargetId: {},
            answerReviewAuthorized: fullReview,
          }),
        ),
      ),
    },
  };
}

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function courseTheme(design: "scaffold-flow" | "pocket-atlas") {
  return {
    schemaVersion: 1 as const,
    design: { id: design, revision: "1" },
    colourSystem: { id: design === "scaffold-flow" ? "scaffold-indigo" : design, revision: "1" },
    overrides: {},
  };
}

function normalizePlayerGeometry(host: HTMLElement) {
  const course = requiredElement<HTMLElement>(host, ".sc-course");
  const player = requiredElement<HTMLElement>(host, ".sc-slideshow-player");
  const viewport = requiredElement<HTMLElement>(player, ".sc-slideshow-player__viewport");
  course.style.cssText += "width:100%;height:100%;min-height:0;";
  player.style.cssText += "width:100%;height:100%;min-height:0;";
  viewport.style.padding = "0";
}

function requireSlideshowStructure(content: JSONContent) {
  const structure = projectCourseStructure(content);
  if (!structure || structure.mode !== "slideshow") {
    throw new Error("Expected a valid Slideshow structure.");
  }
  return structure;
}

function normalizeRuntimeFixtureIds(content: JSONContent): void {
  const seen = new Set<string>();
  const stack = [content];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type !== "doc" && node.type !== "text") {
      const id = node.attrs?.id;
      if (!EmbeddedNodeIdSchema.safeParse(id).success || seen.has(String(id))) {
        node.attrs = { ...node.attrs, id: createEmbeddedNodeId() };
      }
      seen.add(String(node.attrs?.id));
    }
    stack.push(...(node.content ?? []));
  }
}

function requiredElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 8_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for Quiz fixture.");
    await animationFrames(1);
  }
  await animationFrames(1);
}

async function animationFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
