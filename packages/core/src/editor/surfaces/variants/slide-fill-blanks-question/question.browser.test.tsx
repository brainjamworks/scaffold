import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { projectCourseStructure } from "@/document/model/course-structure";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { projectFillBlanksLearnerNode } from "@/editor/assessment/fill-blanks/assessment";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { AssessmentRuntimeProvider } from "@/runtime/assessment/AssessmentRuntimeProvider";
import { SlideshowPlayer } from "@/runtime/players/slideshow/SlideshowPlayer";
import { checkRuntimeDocumentReadiness } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";

import "@/styles/globals.css";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

const mountedRoots: Root[] = [];
const runtimeComposition = createCoreScaffoldRuntimeComposition();
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("full-slide Fill in Blanks runtime geometry", () => {
  it.each(["scaffold-flow", "pocket-atlas"] as const)(
    "uses a full-width contained reading stage with reachable blanks in %s",
    async (design) => {
      await page.viewport(1100, 700);
      const { host } = mountRuntimeSlide({ blankCount: 4, design });

      await waitForCondition(() =>
        host.querySelector('[data-fill-blanks-presentation="full-slide"]'),
      );
      normalizePlayerGeometry(host);
      const course = requiredElement<HTMLElement>(host, ".sc-course");
      const surface = requiredElement<HTMLElement>(
        host,
        ".sc-slide-fill-blanks-question-surface-runtime-view",
      );
      const body = requiredElement<HTMLElement>(surface, '[data-slot="fill-blanks-body"]');
      const scroll = requiredElement<HTMLElement>(body, ".sc-course-fill-blanks__scroll");
      const inputs = Array.from(body.querySelectorAll<HTMLInputElement>('input[type="text"]'));
      const actions = requiredElement<HTMLElement>(
        surface,
        '[data-slot="assessment-actions-group"]',
      );

      expect(course).toHaveClass(`sc-course-theme-${design}-v1`);
      expect(body.getBoundingClientRect().width).toBeGreaterThan(
        surface.getBoundingClientRect().width * 0.82,
      );
      expect(inputs).toHaveLength(4);
      expect(inputs.every((input) => input.getBoundingClientRect().height >= 44)).toBe(true);
      expect(getComputedStyle(scroll).borderTopWidth).toBe("0px");
      expect(getComputedStyle(scroll).boxShadow).toBe("none");
      expect(scroll.scrollHeight).toBeLessThanOrEqual(scroll.clientHeight + 1);
      expect(surface.scrollHeight).toBeLessThanOrEqual(surface.clientHeight + 1);
      expect(
        Math.abs(actions.getBoundingClientRect().bottom - surface.getBoundingClientRect().bottom),
      ).toBeLessThan(2);

      inputs[0]!.focus({ preventScroll: true });
      expect(inputs[0]).toHaveFocus();
      await userEvent.keyboard("{Tab}");
      expect(inputs[1]).toHaveFocus();
    },
  );

  it.each(["scaffold-flow", "pocket-atlas"] as const)(
    "reserves visible clearance between wrapped blank rows in %s",
    async (design) => {
      await page.viewport(860, 540);
      const { host } = mountRuntimeSlide({
        blankCount: 4,
        design,
        height: 428,
        longAnswers: true,
        paragraphCount: 1,
        width: 760,
      });

      await waitForCondition(() =>
        host.querySelector('[data-fill-blanks-presentation="full-slide"]'),
      );
      normalizePlayerGeometry(host);
      const body = requiredElement<HTMLElement>(
        host,
        '[data-fill-blanks-presentation="full-slide"]',
      );
      const inputs = Array.from(body.querySelectorAll<HTMLInputElement>('input[type="text"]'));
      const rows = Array.from(
        inputs.reduce((tops, input) => {
          tops.add(Math.round(input.getBoundingClientRect().top));
          return tops;
        }, new Set<number>()),
      ).sort((a, b) => a - b);

      expect(rows.length).toBeGreaterThan(1);
      const renderedScale =
        inputs[0]!.getBoundingClientRect().height /
        Number.parseFloat(getComputedStyle(inputs[0]!).height);
      for (const [index, nextRowTop] of rows.slice(1).entries()) {
        const previousRowBottom = Math.max(
          ...inputs
            .filter((input) => Math.abs(input.getBoundingClientRect().top - rows[index]!) < 2)
            .map((input) => input.getBoundingClientRect().bottom),
        );
        expect((nextRowTop - previousRowBottom) / renderedScale).toBeGreaterThanOrEqual(7);
      }
    },
  );

  it("contains long prose and many blanks in the stage without displacing submission", async () => {
    await page.viewport(860, 540);
    const { host } = mountRuntimeSlide({
      blankCount: 12,
      design: "pocket-atlas",
      height: 428,
      longAnswers: true,
      longPrompt: true,
      paragraphCount: 9,
      width: 760,
    });

    await waitForCondition(() =>
      host.querySelector('[data-fill-blanks-presentation="full-slide"]'),
    );
    normalizePlayerGeometry(host);
    const surface = requiredElement<HTMLElement>(
      host,
      ".sc-slide-fill-blanks-question-surface-runtime-view",
    );
    const body = requiredElement<HTMLElement>(surface, '[data-slot="fill-blanks-body"]');
    const scroll = requiredElement<HTMLElement>(body, ".sc-course-fill-blanks__scroll");
    const prompt = requiredElement<HTMLElement>(surface, '[data-slot="assessment-prompt"]');
    const actions = requiredElement<HTMLElement>(surface, '[data-slot="assessment-actions-group"]');

    expect(prompt.scrollHeight).toBeGreaterThan(prompt.clientHeight);
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
    expect(getComputedStyle(scroll).overflowY).toBe("auto");
    expect(body.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      actions.getBoundingClientRect().top + 1,
    );
    expect(surface.scrollHeight).toBeLessThanOrEqual(surface.clientHeight + 1);
    expect(
      Math.abs(actions.getBoundingClientRect().bottom - surface.getBoundingClientRect().bottom),
    ).toBeLessThan(2);
  });

  it("collapses an empty prompt, retains a fallback group name, and preserves IME text", async () => {
    await page.viewport(720, 500);
    const { host } = mountRuntimeSlide({
      blankCount: 2,
      design: "scaffold-flow",
      emptyPrompt: true,
      height: 360,
      legend: "",
      width: 640,
    });

    await waitForCondition(() =>
      host.querySelector('[data-fill-blanks-presentation="full-slide"]'),
    );
    normalizePlayerGeometry(host);
    const surface = requiredElement<HTMLElement>(
      host,
      ".sc-slide-fill-blanks-question-surface-runtime-view",
    );
    const group = requiredElement<HTMLElement>(surface, '[role="group"]');
    const inputs = Array.from(group.querySelectorAll<HTMLInputElement>('input[type="text"]'));
    const first = inputs[0]!;
    const second = inputs[1]!;
    const emptyPrompt = requiredElement<HTMLElement>(
      surface,
      '[data-slot="assessment-prompt"][data-assessment-prompt-empty="true"]',
    );

    expect(group).toHaveAccessibleName("Fill in the blanks response");
    expect(getComputedStyle(emptyPrompt).display).toBe("none");
    expect(emptyPrompt.getBoundingClientRect().height).toBe(0);
    expect(first.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);

    first.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "東" }));
    setNativeInputValue(first, "東京");
    first.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "東京",
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );
    first.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "東京" }));
    await waitForCondition(() => first.value === "東京");
    await userEvent.fill(second, "second answer");
    await waitForCondition(() => second.value === "second answer");
    expect(first).toHaveValue("東京");
  });

  it("keeps forced-colour and reduced-motion rules explicit in both Course themes", () => {
    const flowForced = requiredStyleRule(
      '.sc-course.sc-course-theme-scaffold-flow-v1 [data-full-slide-question-family="fill-blanks"] .sc-course-fill-blank__input',
      "(forced-colors: active)",
    );
    const flowMotion = requiredStyleRule(
      '.sc-course.sc-course-theme-scaffold-flow-v1 [data-full-slide-question-family="fill-blanks"] .sc-course-fill-blank__input',
      "(prefers-reduced-motion: reduce)",
    );
    const atlasForced = requiredStyleRule(
      '.sc-course.sc-course-theme-pocket-atlas-v1 [data-full-slide-question-family="fill-blanks"] .sc-course-fill-blanks__scroll',
      "(forced-colors: active)",
    );
    const atlasMotion = requiredStyleRule(
      '.sc-course.sc-course-theme-pocket-atlas-v1 [data-full-slide-question-family="fill-blanks"] .sc-course-fill-blank__input',
      "(prefers-reduced-motion: reduce)",
    );

    expect(flowForced.style.borderColor).toBe("canvastext");
    expect(flowMotion.style.transition).toBe("none");
    expect(atlasForced.style.boxShadow).toBe("none");
    expect(atlasMotion.style.transition).toBe("none");
  });
});

function mountRuntimeSlide({
  blankCount,
  design,
  emptyPrompt = false,
  height = 576,
  legend = "Complete the passage",
  longAnswers = false,
  longPrompt = false,
  paragraphCount = 2,
  width = 1024,
}: {
  blankCount: number;
  design: "scaffold-flow" | "pocket-atlas";
  emptyPrompt?: boolean;
  height?: number;
  legend?: string;
  longAnswers?: boolean;
  longPrompt?: boolean;
  paragraphCount?: number;
  width?: number;
}) {
  const host = document.createElement("div");
  host.style.cssText = `position:absolute;inset:0 auto auto 0;width:${width}px;height:${height}px;`;
  document.body.append(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  const content = fillBlanksQuestionDocument({
    blankCount,
    emptyPrompt,
    legend,
    longAnswers,
    longPrompt,
    paragraphCount,
  });
  const readiness = checkRuntimeDocumentReadiness(content, runtimeComposition, coreProductAccess);
  if (readiness.status !== "supported") {
    throw new Error(`Expected supported Fill in Blanks fixture: ${JSON.stringify(readiness)}`);
  }

  root.render(
    <ScaffoldServicesProvider ports={{ assessment: null }}>
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

function fillBlanksQuestionDocument({
  blankCount,
  emptyPrompt,
  legend,
  longAnswers,
  longPrompt,
  paragraphCount,
}: {
  blankCount: number;
  emptyPrompt: boolean;
  legend: string;
  longAnswers: boolean;
  longPrompt: boolean;
  paragraphCount: number;
}): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-fill-blanks-question");
  if (!definition) throw new Error("Expected slide-fill-blanks-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Surface Fill in Blanks question.");
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
        projectFillBlanksLearnerNode(
          authoredQuestion(question, {
            blankCount,
            emptyPrompt,
            legend,
            longAnswers,
            longPrompt,
            paragraphCount,
          }),
        ),
      ],
    },
  ];
  normalizeRuntimeFixtureIds(document);
  return document;
}

function authoredQuestion(
  question: JSONContent,
  options: {
    blankCount: number;
    emptyPrompt: boolean;
    legend: string;
    longAnswers: boolean;
    longPrompt: boolean;
    paragraphCount: number;
  },
): JSONContent {
  return {
    ...question,
    attrs: {
      ...question.attrs,
      id: "target000001",
      settings: { ...question.attrs?.["settings"], legend: options.legend },
    },
    content: (question.content ?? []).map((child) => {
      if (child.type === "assessment_prompt") {
        if (options.emptyPrompt) return { ...child, content: [{ type: "paragraph" }] };
        return {
          ...child,
          content: Array.from({ length: options.longPrompt ? 6 : 1 }, (_, index) => ({
            type: "paragraph",
            content: [{ type: "text", text: `Complete the evidence summary ${index + 1}.` }],
          })),
        };
      }
      if (child.type !== "fill_blanks_body") return child;
      return authoredBody(options);
    }),
  };
}

function authoredBody({
  blankCount,
  longAnswers,
  paragraphCount,
}: {
  blankCount: number;
  longAnswers: boolean;
  paragraphCount: number;
}): JSONContent {
  let blankIndex = 0;
  return {
    type: "fill_blanks_body",
    content: Array.from({ length: paragraphCount }, (_, paragraphIndex) => ({
      type: "paragraph",
      content: Array.from({ length: Math.ceil(blankCount / paragraphCount) }, () => {
        blankIndex += 1;
        if (blankIndex > blankCount) return [{ type: "text", text: " Supporting context." }];
        const id = `blank${String(blankIndex).padStart(7, "0")}`;
        return [
          {
            type: "text",
            text: `Evidence statement ${paragraphIndex + 1} uses detailed surrounding prose before gap ${blankIndex} `,
          },
          {
            type: "fill_blank",
            attrs: {
              id,
              placeholder: longAnswers
                ? `a precise multi-word response ${blankIndex}`
                : `term ${blankIndex}`,
            },
          },
          { type: "text", text: ". " },
        ];
      }).flat(),
    })),
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

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (!descriptor?.set) throw new Error("Expected the native input value setter.");
  descriptor.set.call(input, value);
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
    if (performance.now() > deadline)
      throw new Error("Timed out waiting for Fill in Blanks fixture.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
