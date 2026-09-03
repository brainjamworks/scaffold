import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { projectCourseStructure } from "@/document/model/course-structure";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { projectDropdownLearnerNode } from "@/editor/assessment/dropdown/assessment";
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

describe("full-slide Dropdown runtime geometry", () => {
  it.each(["scaffold-flow", "pocket-atlas"] as const)(
    "uses a full-width stage with a measured response focal point in %s",
    async (design) => {
      await page.viewport(1100, 700);
      const { host } = mountRuntimeSlide({ design, optionCount: 4 });

      await waitForCondition(() => host.querySelector('[data-dropdown-presentation="full-slide"]'));
      normalizePlayerGeometry(host);
      const course = requiredElement<HTMLElement>(host, ".sc-course");
      const surface = requiredElement<HTMLElement>(
        host,
        ".sc-slide-dropdown-question-surface-runtime-view",
      );
      const stage = requiredElement<HTMLElement>(surface, "[data-assessment-interaction-content]");
      const focal = requiredElement<HTMLElement>(stage, ".sc-course-dropdown-interaction__focal");
      const select = requiredElement<HTMLElement>(focal, ".sc-course-dropdown-select");
      const trigger = requiredElement<HTMLElement>(select, '[role="combobox"]');
      const actions = requiredElement<HTMLElement>(
        surface,
        '[data-slot="assessment-actions-group"]',
      );

      expect(course).toHaveClass(`sc-course-theme-${design}-v1`);
      expect(stage.getBoundingClientRect().width).toBeGreaterThan(
        surface.getBoundingClientRect().width * 0.9,
      );
      expect(focal.getBoundingClientRect().width).toBeGreaterThan(420);
      expect(focal.getBoundingClientRect().width).toBeLessThan(
        stage.getBoundingClientRect().width * 0.8,
      );
      expect(select.getBoundingClientRect().width).toBeGreaterThanOrEqual(
        focal.getBoundingClientRect().width - 12,
      );
      expect(trigger.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      expect(stage.scrollHeight).toBeLessThanOrEqual(stage.clientHeight + 1);
      expect(
        Math.abs(actions.getBoundingClientRect().bottom - surface.getBoundingClientRect().bottom),
      ).toBeLessThan(2);
    },
  );

  it("contains a long, high-count menu in the player overlay boundary", async () => {
    await page.viewport(860, 540);
    const { host } = mountRuntimeSlide({
      design: "pocket-atlas",
      height: 428,
      label: "Choose the most accurate account of the evidence",
      longOptions: true,
      longPrompt: true,
      optionCount: 18,
      width: 760,
    });

    await waitForCondition(() => host.querySelector('[data-dropdown-presentation="full-slide"]'));
    normalizePlayerGeometry(host);
    const surface = requiredElement<HTMLElement>(
      host,
      ".sc-slide-dropdown-question-surface-runtime-view",
    );
    const prompt = requiredElement<HTMLElement>(surface, '[data-slot="assessment-prompt"]');
    const trigger = requiredElement<HTMLElement>(surface, '[role="combobox"]');
    const playerViewport = requiredElement<HTMLElement>(host, ".sc-slideshow-player__viewport");

    expect(prompt.scrollHeight).toBeGreaterThan(prompt.clientHeight);
    await userEvent.click(trigger);
    await waitForCondition(() => document.querySelector(".sc-course-dropdown-select__content"));
    const menu = requiredElement<HTMLElement>(document, ".sc-course-dropdown-select__content");
    const menuViewport = requiredElement<HTMLElement>(menu, ".sc-course-dropdown-select__viewport");
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="option"]'));
    const menuRect = menu.getBoundingClientRect();
    const boundaryRect = playerViewport.getBoundingClientRect();

    expect(items).toHaveLength(18);
    expect(menuRect.left).toBeGreaterThanOrEqual(boundaryRect.left - 1);
    expect(menuRect.right).toBeLessThanOrEqual(boundaryRect.right + 1);
    expect(menuRect.top).toBeGreaterThanOrEqual(boundaryRect.top - 1);
    expect(menuRect.bottom).toBeLessThanOrEqual(boundaryRect.bottom + 1);
    expect(menuViewport.scrollHeight).toBeGreaterThan(menuViewport.clientHeight);
    expect(items.every((item) => item.getBoundingClientRect().height >= 44)).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).toBe(trigger);
    await userEvent.click(trigger);
    const option = requiredElement<HTMLElement>(document, '[role="option"]:nth-of-type(14)');
    await userEvent.click(option);
    await waitForCondition(() => trigger.textContent?.includes("Option 14"));
    expect(document.activeElement).toBe(trigger);
  });

  it("preserves an accessible empty-label fallback and a 44px scaled trigger", async () => {
    await page.viewport(720, 500);
    const { host } = mountRuntimeSlide({
      design: "scaffold-flow",
      emptyPrompt: true,
      height: 360,
      label: "",
      optionCount: 4,
      width: 640,
    });

    await waitForCondition(() => host.querySelector('[data-dropdown-presentation="full-slide"]'));
    normalizePlayerGeometry(host);
    const surface = requiredElement<HTMLElement>(
      host,
      ".sc-slide-dropdown-question-surface-runtime-view",
    );
    const trigger = requiredElement<HTMLElement>(surface, '[role="combobox"]');

    expect(trigger).toHaveAccessibleName("Dropdown response");
    expect(trigger.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    const emptyPrompt = requiredElement<HTMLElement>(
      surface,
      '[data-slot="assessment-prompt"][data-assessment-prompt-empty="true"]',
    );
    expect(getComputedStyle(emptyPrompt).display).toBe("none");
    expect(emptyPrompt.getBoundingClientRect().height).toBe(0);
  });

  it("keeps forced-colour and reduced-motion rules explicit in both Course themes", () => {
    const flowForced = requiredStyleRule(
      '.sc-course.sc-course-theme-scaffold-flow-v1 [data-full-slide-question-family="dropdown"] .sc-course-dropdown-select__trigger',
      "(forced-colors: active)",
    );
    const flowMotion = requiredStyleRule(
      '.sc-course.sc-course-theme-scaffold-flow-v1 [data-full-slide-question-family="dropdown"] .sc-course-dropdown-select__trigger',
      "(prefers-reduced-motion: reduce)",
    );
    const atlasForced = requiredStyleRule(
      '.sc-course.sc-course-theme-pocket-atlas-v1 [data-full-slide-question-family="dropdown"] .sc-course-dropdown-select__trigger',
      "(forced-colors: active)",
    );
    const atlasMotion = requiredStyleRule(
      '.sc-course.sc-course-theme-pocket-atlas-v1 [data-full-slide-question-family="dropdown"] .sc-course-dropdown-select__trigger',
      "(prefers-reduced-motion: reduce)",
    );

    expect(flowForced.style.borderColor).toBe("canvastext");
    expect(flowMotion.style.transition).toBe("none");
    expect(atlasForced.style.boxShadow).toBe("none");
    expect(atlasMotion.style.transform).toBe("none");
  });
});

function mountRuntimeSlide({
  design,
  emptyPrompt = false,
  height = 576,
  label = "Choose an answer",
  longOptions = false,
  longPrompt = false,
  optionCount,
  width = 1024,
}: {
  design: "scaffold-flow" | "pocket-atlas";
  emptyPrompt?: boolean;
  height?: number;
  label?: string;
  longOptions?: boolean;
  longPrompt?: boolean;
  optionCount: number;
  width?: number;
}) {
  const host = document.createElement("div");
  host.style.cssText = `position:absolute;inset:0 auto auto 0;width:${width}px;height:${height}px;`;
  document.body.append(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  const content = dropdownQuestionDocument({
    emptyPrompt,
    label,
    longOptions,
    longPrompt,
    optionCount,
  });
  const readiness = checkRuntimeDocumentReadiness(content, runtimeComposition, coreProductAccess);
  if (readiness.status !== "supported") {
    throw new Error(`Expected supported Dropdown fixture: ${JSON.stringify(readiness)}`);
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

function dropdownQuestionDocument({
  emptyPrompt,
  label,
  longOptions,
  longPrompt,
  optionCount,
}: {
  emptyPrompt: boolean;
  label: string;
  longOptions: boolean;
  longPrompt: boolean;
  optionCount: number;
}): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-dropdown-question");
  if (!definition) throw new Error("Expected slide-dropdown-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Surface Dropdown question.");
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
        projectDropdownLearnerNode(
          authoredQuestion(question, { emptyPrompt, label, longOptions, longPrompt, optionCount }),
        ),
      ],
    },
  ];
  normalizeRuntimeFixtureIds(document);
  return document;
}

function authoredQuestion(
  question: JSONContent,
  {
    emptyPrompt,
    label,
    longOptions,
    longPrompt,
    optionCount,
  }: {
    emptyPrompt: boolean;
    label: string;
    longOptions: boolean;
    longPrompt: boolean;
    optionCount: number;
  },
): JSONContent {
  return {
    ...question,
    attrs: {
      ...question.attrs,
      id: "target000001",
      settings: {
        ...question.attrs?.["settings"],
        label,
        placeholder: "Choose one option",
      },
    },
    content: (question.content ?? []).map((child) => {
      if (child.type === "assessment_prompt") {
        if (emptyPrompt) return { ...child, content: [{ type: "paragraph" }] };
        return {
          ...child,
          content: Array.from({ length: longPrompt ? 6 : 1 }, (_, index) => ({
            type: "paragraph",
            content: [
              {
                type: "text",
                text: `Which account best explains the available evidence${index + 1}?`,
              },
            ],
          })),
        };
      }
      if (child.type !== "dropdown_choices_group") return child;
      return {
        ...child,
        content: Array.from({ length: optionCount }, (_, index) => ({
          type: "dropdown_choice",
          attrs: { id: `choice_${String(index + 1).padStart(5, "0")}` },
          content: [
            {
              type: "dropdown_choice_label",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: longOptions
                        ? `Option ${index + 1} with qualifications, supporting evidence, and a realistic multi-line explanation`
                        : `Option ${index + 1}`,
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
    if (performance.now() > deadline) throw new Error("Timed out waiting for Dropdown fixture.");
    await animationFrames(1);
  }
  await animationFrames(1);
}

async function animationFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
