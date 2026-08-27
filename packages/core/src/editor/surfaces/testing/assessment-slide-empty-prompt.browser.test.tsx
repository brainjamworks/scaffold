import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { projectCourseStructure } from "@/document/model/course-structure";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
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

const completedAssessmentVariants = [
  "slide-categorise-question",
  "slide-sequencing-question",
  "slide-matching-question",
  "slide-image-hotspot-question",
  "slide-multiple-choice-question",
] as const;
const runtimeComposition = createCoreScaffoldRuntimeComposition();
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;
const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("assessment slide prompt geometry", () => {
  it.each(completedAssessmentVariants)(
    "collapses an empty learner prompt for %s without leaving a grid row",
    async (variant) => {
      await page.viewport(1100, 700);
      const host = mountAssessmentSlide({
        design: "scaffold-flow",
        prompt: "",
        variant,
      });

      await waitForCondition(() => host.querySelector(".sc-assessment-slide-surface-runtime-view"));
      normalizePlayerGeometry(host);
      const surface = requiredElement<HTMLElement>(
        host,
        ".sc-assessment-slide-surface-runtime-view",
      );
      const prompt = requiredElement<HTMLElement>(surface, '[data-slot="assessment-prompt"]');
      const interaction = requiredElement<HTMLElement>(
        surface,
        "[data-assessment-interaction-content]",
      );
      const title = requiredElement<HTMLElement>(surface, '[data-slot="assessment-title"]');
      const instructions = requiredElement<HTMLElement>(
        surface,
        '[data-slot="assessment-instructions"]',
      );
      const headerBottom = Math.max(
        title.getBoundingClientRect().bottom,
        instructions.getBoundingClientRect().bottom,
      );

      expect(prompt).toHaveAttribute("data-assessment-prompt-empty", "true");
      expect(getComputedStyle(prompt).display).toBe("none");
      expect(prompt.getBoundingClientRect().height).toBe(0);
      expect(Math.abs(interaction.getBoundingClientRect().top - headerBottom)).toBeLessThan(2);
    },
  );

  it.each(["scaffold-flow", "pocket-atlas"] as const)(
    "keeps the empty and authored prompt states intentional in %s",
    async (design) => {
      await page.viewport(1100, 700);
      const emptyHost = mountAssessmentSlide({
        design,
        prompt: "",
        variant: "slide-multiple-choice-question",
      });
      await waitForCondition(() =>
        emptyHost.querySelector(".sc-assessment-slide-surface-runtime-view"),
      );
      normalizePlayerGeometry(emptyHost);
      const emptyPrompt = requiredElement<HTMLElement>(
        emptyHost,
        '[data-slot="assessment-prompt"]',
      );
      expect(getComputedStyle(emptyPrompt).display).toBe("none");

      const authoredHost = mountAssessmentSlide({
        design,
        prompt: "Which option is supported by the evidence?",
        variant: "slide-multiple-choice-question",
      });
      await waitForCondition(() =>
        authoredHost.querySelector(".sc-assessment-slide-surface-runtime-view"),
      );
      normalizePlayerGeometry(authoredHost);
      const authoredPrompt = requiredElement<HTMLElement>(
        authoredHost,
        '[data-slot="assessment-prompt"]',
      );
      const authoredInteraction = requiredElement<HTMLElement>(
        authoredHost,
        "[data-assessment-interaction-content]",
      );

      expect(authoredPrompt).not.toHaveAttribute("data-assessment-prompt-empty");
      expect(getComputedStyle(authoredPrompt).display).not.toBe("none");
      expect(authoredPrompt.getBoundingClientRect().height).toBeGreaterThan(44);
      expect(authoredInteraction.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        authoredPrompt.getBoundingClientRect().bottom - 1,
      );
    },
  );
});

function mountAssessmentSlide({
  design,
  prompt,
  variant,
}: {
  design: "scaffold-flow" | "pocket-atlas";
  prompt: string;
  variant: (typeof completedAssessmentVariants)[number];
}): HTMLElement {
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;inset:0 auto auto 0;width:1024px;height:576px;";
  document.body.append(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  const content = assessmentSlideDocument(variant, prompt);
  const readiness = checkRuntimeDocumentReadiness(content, runtimeComposition, coreProductAccess);
  if (readiness.status !== "supported") {
    throw new Error(`Expected supported assessment slide fixture: ${JSON.stringify(readiness)}`);
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
  return host;
}

function assessmentSlideDocument(
  variant: (typeof completedAssessmentVariants)[number],
  prompt: string,
): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get(variant);
  if (!definition?.assessmentTargets) {
    throw new Error(`Expected assessment Surface definition for ${variant}.`);
  }
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error(`Expected private assessment owner for ${variant}.`);
  const authoredSurface: JSONContent = {
    ...surface,
    content: [
      {
        ...question,
        attrs: { ...question.attrs, id: "target000001" },
        content: (question.content ?? []).map((child) =>
          child.type === "assessment_prompt"
            ? {
                ...child,
                content: [
                  {
                    type: "paragraph",
                    ...(prompt ? { content: [{ type: "text", text: prompt }] } : {}),
                  },
                ],
              }
            : child,
        ),
      },
    ],
  };
  normalizeRuntimeFixtureIds(authoredSurface);
  const learnerSurface = definition.assessmentTargets.projectLearnerSurface(authoredSurface);
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
  courseDocument.content = [section, learnerSurface];
  normalizeRuntimeFixtureIds(document);
  return document;
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

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 8_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for assessment slide.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
