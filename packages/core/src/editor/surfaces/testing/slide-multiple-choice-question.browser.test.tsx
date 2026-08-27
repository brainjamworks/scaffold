import type { JSONContent } from "@tiptap/core";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { projectCourseStructure } from "@/document/model/course-structure";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { projectMcqLearnerNode } from "@/editor/blocks/assessment/mcq/assessment";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import type { AssessmentPort } from "@/host/ports";
import { AssessmentRuntimeProvider } from "@/runtime/assessment/AssessmentRuntimeProvider";
import { checkRuntimeDocumentReadiness } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import { SlideshowPlayer } from "@/runtime/players/slideshow/SlideshowPlayer";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { assessmentProblemOutcome } from "@/runtime/assessment/test-utils";

import "@/styles/globals.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";

const mountedRoots: Root[] = [];
const runtimeComposition = createCoreScaffoldRuntimeComposition();
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("full-slide Multiple Choice runtime geometry", () => {
  it.each(["scaffold-flow", "pocket-atlas"] as const)(
    "uses the full contained choice stage in %s",
    async (design) => {
      await page.viewport(1100, 700);
      const { host } = mountRuntimeSlide({ design, choiceCount: 4 });

      await waitForCondition(
        () => host.querySelector('[data-mcq-presentation="full-slide"]') !== null,
      );
      normalizePlayerGeometry(host);

      const course = requiredElement<HTMLElement>(host, ".sc-course");
      const surface = requiredElement<HTMLElement>(
        host,
        ".sc-slide-multiple-choice-question-surface-runtime-view",
      );
      const interaction = requiredElement<HTMLElement>(
        surface,
        "[data-assessment-interaction-content]",
      );
      const viewport = requiredElement<HTMLElement>(
        interaction,
        ".sc-course-mcq-interaction__viewport",
      );
      const list = requiredElement<HTMLElement>(interaction, ".sc-course-mcq-interaction__list");
      const fieldset = requiredElement<HTMLFieldSetElement>(interaction, "fieldset");
      const choices = Array.from(
        list.querySelectorAll<HTMLElement>(".sc-course-assessment-choice"),
      );
      const actions = requiredElement<HTMLElement>(
        surface,
        '[data-slot="assessment-actions-group"]',
      );
      const submit = requiredElement<HTMLButtonElement>(
        actions,
        '[data-assessment-submission-action="submit"]',
      );

      expect(course).toHaveClass(`sc-course-theme-${design}-v1`);
      expect(interaction.getBoundingClientRect().width).toBeGreaterThan(
        surface.getBoundingClientRect().width * 0.9,
      );
      expect(viewport.getBoundingClientRect().width).toBeGreaterThan(
        surface.getBoundingClientRect().width * 0.8,
      );
      expect(getComputedStyle(list).display).toBe("grid");
      expect(getComputedStyle(list).gridTemplateColumns.split(" ")).toHaveLength(2);
      expect(list.getBoundingClientRect().height).toBeGreaterThan(
        fieldset.getBoundingClientRect().height * 0.75,
      );
      expect(choices).toHaveLength(4);
      for (const choice of choices) {
        expect(choice.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
        expect(choice.getBoundingClientRect().left).toBeGreaterThanOrEqual(
          viewport.getBoundingClientRect().left,
        );
        expect(choice.getBoundingClientRect().right).toBeLessThanOrEqual(
          viewport.getBoundingClientRect().right,
        );
      }
      expect(interaction.scrollHeight).toBeLessThanOrEqual(interaction.clientHeight + 1);
      expect(
        Math.abs(actions.getBoundingClientRect().bottom - surface.getBoundingClientRect().bottom),
      ).toBeLessThan(2);
      expect(
        Math.abs(
          submit.getBoundingClientRect().right -
            (actions.getBoundingClientRect().right -
              Number.parseFloat(getComputedStyle(actions).paddingRight)),
        ),
      ).toBeLessThan(3);
    },
  );

  it("uses deliberate sparse and three-up density without turning choices into a centre card", async () => {
    await page.viewport(1100, 700);
    const sparse = mountRuntimeSlide({ design: "scaffold-flow", choiceCount: 2 });
    await waitForCondition(
      () => sparse.host.querySelector('[data-mcq-presentation="full-slide"]') !== null,
    );
    normalizePlayerGeometry(sparse.host);
    const sparseInteraction = requiredElement<HTMLElement>(
      sparse.host,
      "[data-assessment-interaction-content]",
    );
    const sparseList = requiredElement<HTMLElement>(
      sparseInteraction,
      ".sc-course-mcq-interaction__list",
    );
    expect(sparseList).toHaveAttribute("data-mcq-choice-density", "sparse");
    expect(getComputedStyle(sparseList).gridTemplateColumns.split(" ")).toHaveLength(2);
    expect(sparseList.getBoundingClientRect().width).toBeGreaterThan(
      sparseInteraction.getBoundingClientRect().width * 0.8,
    );

    const threeUp = mountRuntimeSlide({ design: "pocket-atlas", choiceCount: 3 });
    await waitForCondition(
      () => threeUp.host.querySelector('[data-mcq-presentation="full-slide"]') !== null,
    );
    normalizePlayerGeometry(threeUp.host);
    const threeList = requiredElement<HTMLElement>(
      threeUp.host,
      ".sc-course-mcq-interaction__list",
    );
    expect(threeList).toHaveAttribute("data-mcq-choice-density", "standard");
    expect(threeList).toHaveAttribute("data-mcq-choice-count", "3");
    expect(getComputedStyle(threeList).gridTemplateColumns.split(" ")).toHaveLength(3);
  });

  it("contains long rich labels and a high choice count inside the interaction stage", async () => {
    await page.viewport(860, 540);
    const { host } = mountRuntimeSlide({
      design: "pocket-atlas",
      choiceCount: 28,
      longLabels: true,
      longPrompt: true,
      width: 760,
      height: 428,
    });

    await waitForCondition(
      () => host.querySelector('[data-mcq-presentation="full-slide"]') !== null,
    );
    normalizePlayerGeometry(host);
    const surface = requiredElement<HTMLElement>(
      host,
      ".sc-slide-multiple-choice-question-surface-runtime-view",
    );
    const prompt = requiredElement<HTMLElement>(surface, '[data-slot="assessment-prompt"]');
    const interaction = requiredElement<HTMLElement>(
      surface,
      "[data-assessment-interaction-content]",
    );
    const viewport = requiredElement<HTMLElement>(
      interaction,
      ".sc-course-mcq-interaction__viewport",
    );
    const list = requiredElement<HTMLElement>(interaction, ".sc-course-mcq-interaction__list");
    const lastChoice = Array.from(
      list.querySelectorAll<HTMLElement>(".sc-course-assessment-choice"),
    ).at(-1);
    if (!lastChoice) throw new Error("Expected the final choice.");

    expect(prompt.scrollHeight).toBeGreaterThan(prompt.clientHeight);
    expect(getComputedStyle(prompt).overflowY).toBe("auto");
    expect(list).toHaveAttribute("data-mcq-choice-density", "dense");
    expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
    expect(getComputedStyle(viewport).overflowY).toBe("auto");
    expect(interaction.scrollHeight).toBeLessThanOrEqual(interaction.clientHeight + 1);
    expect(
      Array.from(
        list.querySelectorAll<HTMLElement>(".sc-course-selectable-choice-interaction__ordinal"),
        (ordinal) => ordinal.textContent,
      ).slice(-4),
    ).toEqual(["Y", "Z", "AA", "AB"]);
    viewport.scrollTop = viewport.scrollHeight;
    await animationFrames(1);
    expect(lastChoice.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      viewport.getBoundingClientRect().bottom + 1,
    );
    expect(lastChoice.textContent).toContain("supporting evidence");
  });

  it("preserves native keyboard selection, accessible names, targets, and canonical submission", async () => {
    await page.viewport(1100, 700);
    const submit = vi.fn<AssessmentPort["submit"]>(async (request) =>
      assessmentProblemOutcome(
        { feedback: null, isCorrect: true, score: { scaled: 1 }, items: {} },
        { response: request.response },
      ),
    );
    const { host } = mountRuntimeSlide({ design: "scaffold-flow", choiceCount: 4, submit });

    await waitForCondition(
      () => host.querySelector('[data-mcq-presentation="full-slide"]') !== null,
    );
    normalizePlayerGeometry(host);
    const radios = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios).toHaveLength(4);
    expect(radios.every((radio) => radio.required)).toBe(true);
    for (const radio of radios) {
      expect(radio.closest("label")?.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    const submitButton = requiredElement<HTMLButtonElement>(
      host,
      '[data-assessment-submission-action="submit"]',
    );
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveAccessibleDescription("Choose an answer before submitting.");

    radios[0]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    await waitForCondition(() => radios[1]?.checked === true);
    expect(radios[1]).toHaveAccessibleName("Choice 2");

    await waitForCondition(() => !submitButton.disabled);
    submitButton.click();
    await waitForCondition(() => submit.mock.calls.length === 1);
    expect(submit.mock.calls[0]?.[0]).toMatchObject({
      targetId: "target000001",
      response: { kind: "single-select", optionId: "choice_00002" },
    });
  });

  it("keeps forced-colour and reduced-motion rules explicit in both Course themes", () => {
    const flowChoice = requiredStyleRule(
      ".sc-course.sc-course-theme-scaffold-flow-v1 .sc-selectable-choice-slide-surface-view .sc-course-assessment-choice",
      "(forced-colors: active)",
    );
    const flowMotion = requiredStyleRule(
      ".sc-course.sc-course-theme-scaffold-flow-v1 .sc-selectable-choice-slide-surface-view .sc-course-assessment-choice",
      "(prefers-reduced-motion: reduce)",
    );
    const atlasChoice = requiredStyleRule(
      ".sc-course.sc-course-theme-pocket-atlas-v1 .sc-selectable-choice-slide-surface-view .sc-course-assessment-choice",
      "(forced-colors: active)",
    );
    const atlasMotion = requiredStyleRule(
      ".sc-course.sc-course-theme-pocket-atlas-v1 .sc-selectable-choice-slide-surface-view .sc-course-assessment-choice",
      "(prefers-reduced-motion: reduce)",
    );

    expect(flowChoice.style.borderColor).toBe("canvastext");
    expect(flowMotion.style.transition).toBe("none");
    expect(atlasChoice.style.boxShadow).toBe("none");
    expect(atlasMotion.style.transform).toBe("none");
  });
});

function mountRuntimeSlide({
  choiceCount,
  design,
  height = 576,
  longLabels = false,
  longPrompt = false,
  submit,
  width = 1024,
}: {
  choiceCount: number;
  design: "scaffold-flow" | "pocket-atlas";
  height?: number;
  longLabels?: boolean;
  longPrompt?: boolean;
  submit?: AssessmentPort["submit"];
  width?: number;
}) {
  const host = document.createElement("div");
  host.style.cssText = `position:absolute;inset:0 auto auto 0;width:${width}px;height:${height}px;`;
  document.body.append(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  const content = multipleChoiceQuestionDocument({ choiceCount, longLabels, longPrompt });
  const readiness = checkRuntimeDocumentReadiness(content, runtimeComposition, coreProductAccess);
  if (readiness.status !== "supported") {
    throw new Error(`Expected supported Multiple Choice fixture: ${JSON.stringify(readiness)}`);
  }

  root.render(
    <ScaffoldServicesProvider ports={{ assessment: submit ? { type: "runtime", submit } : null }}>
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

function normalizePlayerGeometry(host: HTMLElement) {
  const course = requiredElement<HTMLElement>(host, ".sc-course");
  const player = requiredElement<HTMLElement>(host, ".sc-slideshow-player");
  const viewport = requiredElement<HTMLElement>(player, ".sc-slideshow-player__viewport");
  course.style.cssText += "width:100%;height:100%;min-height:0;";
  player.style.cssText += "width:100%;height:100%;min-height:0;";
  viewport.style.padding = "0";
}

function multipleChoiceQuestionDocument({
  choiceCount,
  longLabels,
  longPrompt,
}: {
  choiceCount: number;
  longLabels: boolean;
  longPrompt: boolean;
}): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-multiple-choice-question");
  if (!definition) throw new Error("Expected slide-multiple-choice-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Surface Multiple Choice question.");
  const document = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId: "surface00001",
    initialCourseSectionTitle: "Introduction",
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
        projectMcqLearnerNode(authoredQuestion(question, choiceCount, longLabels, longPrompt)),
      ],
    },
  ];
  normalizeRuntimeFixtureIds(document);
  return document;
}

function authoredQuestion(
  question: JSONContent,
  choiceCount: number,
  longLabels: boolean,
  longPrompt: boolean,
): JSONContent {
  return {
    ...question,
    attrs: { ...question.attrs, id: "target000001" },
    content: (question.content ?? []).map((child) => {
      if (child.type === "assessment_prompt") {
        return {
          ...child,
          content: Array.from({ length: longPrompt ? 7 : 1 }, (_, index) => ({
            type: "paragraph",
            content: [
              {
                type: "text",
                text: `Which option is best supported by the available evidence${index + 1}?`,
              },
            ],
          })),
        };
      }
      if (child.type !== "assessment_choices_group") return child;
      return {
        ...child,
        content: Array.from({ length: choiceCount }, (_, index) => ({
          type: "selectable_choice",
          attrs: { id: `choice_${String(index + 1).padStart(5, "0")}` },
          content: [
            {
              type: "selectable_choice_body",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: longLabels
                        ? `Choice ${index + 1} with supporting evidence, qualifications, and a realistic multi-line explanation`
                        : `Choice ${index + 1}`,
                    },
                  ],
                },
              ],
            },
          ],
        })),
      };
    }),
  };
}

function courseTheme(design: "scaffold-flow" | "pocket-atlas") {
  return {
    schemaVersion: 1 as const,
    design: { id: design, revision: "1" },
    colourSystem: { id: design === "scaffold-flow" ? "scaffold-indigo" : design, revision: "1" },
    overrides: {},
  };
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

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element ${selector}.`);
  return element;
}

function requiredStyleRule(selector: string, media: string): CSSStyleRule {
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of cssRules(sheet)) {
      const found = findStyleRule(rule, selector, media);
      if (found) return found;
    }
  }
  throw new Error(`Expected style rule ${selector} inside ${media}.`);
}

function findStyleRule(rule: CSSRule, selector: string, media: string): CSSStyleRule | null {
  if (rule instanceof CSSMediaRule) {
    if (!rule.conditionText.includes(media)) return null;
    for (const nested of Array.from(rule.cssRules)) {
      if (nested instanceof CSSStyleRule && nested.selectorText === selector) return nested;
    }
  }
  if ("cssRules" in rule) {
    for (const nested of Array.from((rule as CSSGroupingRule).cssRules)) {
      const found = findStyleRule(nested, selector, media);
      if (found) return found;
    }
  }
  return null;
}

function cssRules(sheet: CSSStyleSheet): CSSRule[] {
  try {
    return Array.from(sheet.cssRules);
  } catch {
    return [];
  }
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 8_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for MCQ fixture.");
    await animationFrames(1);
  }
  await animationFrames(1);
}

async function animationFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
