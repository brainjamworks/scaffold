import type { JSONContent } from "@tiptap/core";
import { fireEvent } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { projectCourseStructure } from "@/document/model/course-structure";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { projectImageHotspotLearnerNode } from "@/editor/assessment/image-hotspot/assessment";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import type { AssessmentPort, MediaPort } from "@/host/ports";
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

describe("full-slide Image Hotspot runtime geometry", () => {
  it.each(["scaffold-flow", "pocket-atlas"] as const)(
    "uses a contained full-canvas stage in %s",
    async (design) => {
      await page.viewport(1100, 700);
      const { host } = mountRuntimeSlide({ design, width: 1024, height: 576 });

      await waitForCondition(
        () => host.querySelector('[data-image-hotspot-presentation="full-slide"]') !== null,
      );
      normalizePlayerGeometry(host);
      await waitForCondition(() => requiredElement<HTMLImageElement>(host, "img").naturalWidth > 0);

      const course = requiredElement<HTMLElement>(host, ".sc-course");
      const surface = requiredElement<HTMLElement>(
        host,
        ".sc-slide-image-hotspot-question-surface-runtime-view",
      );
      const interaction = requiredElement<HTMLElement>(
        surface,
        "[data-assessment-interaction-content]",
      );
      const fitStage = requiredElement<HTMLElement>(
        interaction,
        ".sc-course-image-hotspot-fit-stage",
      );
      const canvas = requiredElement<HTMLElement>(interaction, ".sc-course-image-hotspot-canvas");
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
      expect(fitStage.getBoundingClientRect().width).toBeGreaterThan(
        surface.getBoundingClientRect().width * 0.88,
      );
      expect(canvas.getBoundingClientRect().height).toBeGreaterThan(
        interaction.getBoundingClientRect().height * 0.58,
      );
      expect(interaction.scrollHeight).toBeLessThanOrEqual(interaction.clientHeight + 1);
      expect(fitStage.scrollHeight).toBeLessThanOrEqual(fitStage.clientHeight + 1);
      expect(canvas.getBoundingClientRect().left).toBeGreaterThan(
        fitStage.getBoundingClientRect().left,
      );
      expect(canvas.getBoundingClientRect().right).toBeLessThan(
        fitStage.getBoundingClientRect().right,
      );
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
      const framedElement = design === "pocket-atlas" ? fitStage : canvas;
      expect(getComputedStyle(framedElement).borderTopWidth).not.toBe("0px");
    },
  );

  it("preserves keyboard and pointer placement with an explicit disabled explanation", async () => {
    await page.viewport(1100, 700);
    const submit = vi.fn<AssessmentPort["submit"]>(async (request) =>
      assessmentProblemOutcome(
        { feedback: null, isCorrect: true, score: { scaled: 1 }, items: {} },
        { response: request.response },
      ),
    );
    const { host } = mountRuntimeSlide({
      design: "scaffold-flow",
      width: 1024,
      height: 576,
      submit,
    });

    await waitForCondition(
      () => host.querySelector('[data-image-hotspot-presentation="full-slide"]') !== null,
    );
    normalizePlayerGeometry(host);
    const canvas = requiredElement<HTMLElement>(
      host,
      '[data-image-hotspot-canvas-surface="runtime"]',
    );
    await waitForCondition(() => requiredElement<HTMLImageElement>(canvas, "img").naturalWidth > 0);

    canvas.focus();
    await userEvent.keyboard("{ArrowRight}{Enter}");
    await waitForCondition(() => host.querySelectorAll("[data-hotspot-marker-id]").length === 1);

    const rect = canvas.getBoundingClientRect();
    fireEvent.click(canvas, {
      clientX: rect.left + rect.width * 0.28,
      clientY: rect.top + rect.height * 0.34,
    });
    await waitForCondition(() => host.querySelectorAll("[data-hotspot-marker-id]").length === 2);

    expect(canvas).toHaveAttribute("aria-disabled", "true");
    const description = describedText(canvas);
    expect(description).toContain("2 of 2 clicks placed");
    expect(description).toContain("Click limit reached");
    const markers = Array.from(host.querySelectorAll<HTMLElement>("[data-hotspot-marker-id]"));
    expect(markers.map((marker) => marker.getBoundingClientRect().width)).toEqual([44, 44]);
    expect(markers.map((marker) => marker.getBoundingClientRect().height)).toEqual([44, 44]);

    const submitButton = requiredElement<HTMLButtonElement>(
      host,
      '[data-assessment-submission-action="submit"]',
    );
    await waitForCondition(() => !submitButton.disabled);
    submitButton.click();
    await waitForCondition(() => submit.mock.calls.length === 1);
    expect(submit.mock.calls[0]?.[0]).toMatchObject({
      targetId: "target000001",
      response: { kind: "spatial-hotspot" },
    });
  });

  it("contains a long prompt and portrait image in a scaled Pocket Atlas player", async () => {
    await page.viewport(860, 540);
    const { host } = mountRuntimeSlide({
      design: "pocket-atlas",
      width: 760,
      height: 428,
      longPrompt: true,
      portrait: true,
    });

    await waitForCondition(
      () => host.querySelector('[data-image-hotspot-presentation="full-slide"]') !== null,
    );
    normalizePlayerGeometry(host);
    const playerCanvas = requiredElement<HTMLElement>(host, ".sc-slideshow-player__canvas");
    const surface = requiredElement<HTMLElement>(
      host,
      ".sc-slide-image-hotspot-question-surface-runtime-view",
    );
    const prompt = requiredElement<HTMLElement>(surface, '[data-slot="assessment-prompt"]');
    const interaction = requiredElement<HTMLElement>(
      surface,
      "[data-assessment-interaction-content]",
    );
    const fitStage = requiredElement<HTMLElement>(
      interaction,
      ".sc-course-image-hotspot-fit-stage",
    );
    const canvas = requiredElement<HTMLElement>(interaction, ".sc-course-image-hotspot-canvas");
    await waitForCondition(() => requiredElement<HTMLImageElement>(canvas, "img").naturalWidth > 0);

    expect(getComputedStyle(playerCanvas).transform).not.toBe("none");
    expect(prompt.scrollHeight).toBeGreaterThan(prompt.clientHeight);
    expect(getComputedStyle(prompt).overflowY).toBe("auto");
    expect(interaction.getBoundingClientRect().height).toBeGreaterThan(110);
    expect(canvas.getBoundingClientRect().height).toBeLessThanOrEqual(
      fitStage.getBoundingClientRect().height,
    );
    expect(fitStage.scrollHeight).toBeLessThanOrEqual(fitStage.clientHeight + 1);
    const fitStageStyle = getComputedStyle(fitStage);
    const scaleY = fitStage.getBoundingClientRect().height / fitStage.offsetHeight;
    const contentTop =
      fitStage.getBoundingClientRect().top + Number.parseFloat(fitStageStyle.paddingTop) * scaleY;
    const contentBottom =
      fitStage.getBoundingClientRect().bottom -
      Number.parseFloat(fitStageStyle.paddingBottom) * scaleY;
    expect(canvas.getBoundingClientRect().top).toBeGreaterThanOrEqual(contentTop - 1);
    expect(canvas.getBoundingClientRect().bottom).toBeLessThanOrEqual(contentBottom + 1);
    expect(canvas.getBoundingClientRect().width).toBeLessThan(
      fitStage.getBoundingClientRect().width,
    );
    expect(interaction.scrollHeight).toBeLessThanOrEqual(interaction.clientHeight + 1);
  });

  it("keeps forced-colour and reduced-motion rules explicit in both Course themes", () => {
    const flowCanvas = requiredStyleRule(
      ".sc-course.sc-course-theme-scaffold-flow-v1 .sc-course-image-hotspot-canvas",
      "(forced-colors: active)",
    );
    const flowAction = requiredStyleRule(
      ".sc-course.sc-course-theme-scaffold-flow-v1 .sc-course-image-hotspot__icon-action",
      "(prefers-reduced-motion: reduce)",
    );
    const atlasMarker = requiredStyleRule(
      ".sc-course.sc-course-theme-pocket-atlas-v1 .sc-course-image-hotspot-marker",
      "(forced-colors: active)",
    );
    const atlasAction = requiredStyleRule(
      ".sc-course.sc-course-theme-pocket-atlas-v1 .sc-course-image-hotspot__icon-action",
      "(prefers-reduced-motion: reduce)",
    );

    expect(flowCanvas.style.borderColor).toBe("canvastext");
    expect(flowAction.style.transition).toBe("none");
    expect(atlasMarker.style.background).toBe("canvas");
    expect(atlasAction.style.transition).toBe("none");
    expect(atlasAction.style.transform).toBe("none");
  });
});

function mountRuntimeSlide({
  design,
  width,
  height,
  longPrompt = false,
  portrait = false,
  submit,
}: {
  design: "scaffold-flow" | "pocket-atlas";
  width: number;
  height: number;
  longPrompt?: boolean;
  portrait?: boolean;
  submit?: AssessmentPort["submit"];
}) {
  const host = document.createElement("div");
  host.style.cssText = `position:absolute;inset:0 auto auto 0;width:${width}px;height:${height}px;`;
  document.body.append(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  const content = imageHotspotQuestionDocument({ longPrompt, portrait });
  const readiness = checkRuntimeDocumentReadiness(content, runtimeComposition, coreProductAccess);
  if (readiness.status !== "supported") {
    throw new Error(`Expected supported Image Hotspot fixture: ${JSON.stringify(readiness)}`);
  }

  root.render(
    <ScaffoldServicesProvider
      ports={{
        assessment: submit ? { type: "runtime", submit } : null,
        media: testMediaPort(portrait),
      }}
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

function normalizePlayerGeometry(host: HTMLElement) {
  const course = requiredElement<HTMLElement>(host, ".sc-course");
  const player = requiredElement<HTMLElement>(host, ".sc-slideshow-player");
  const viewport = requiredElement<HTMLElement>(player, ".sc-slideshow-player__viewport");
  course.style.cssText += "width:100%;height:100%;min-height:0;";
  player.style.cssText += "width:100%;height:100%;min-height:0;";
  viewport.style.padding = "0";
}

function imageHotspotQuestionDocument({
  longPrompt,
  portrait,
}: {
  longPrompt: boolean;
  portrait: boolean;
}): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-image-hotspot-question");
  if (!definition) throw new Error("Expected slide-image-hotspot-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Surface Image Hotspot question.");
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
      content: [projectImageHotspotLearnerNode(authoredQuestion(question, longPrompt, portrait))],
    },
  ];
  normalizeRuntimeFixtureIds(document);
  return document;
}

function authoredQuestion(question: JSONContent, longPrompt: boolean, portrait: boolean) {
  return {
    ...question,
    attrs: { ...question.attrs, id: "target000001" },
    content: (question.content ?? []).map((child) => {
      if (child.type === "assessment_prompt") {
        return {
          ...child,
          content: Array.from({ length: longPrompt ? 8 : 1 }, (_, index) => ({
            type: "paragraph",
            content: [
              {
                type: "text",
                text: `Identify the relevant region using the evidence in the image${index + 1}.`,
              },
            ],
          })),
        };
      }
      if (child.type !== "image_hotspot_canvas") return child;
      return {
        ...child,
        attrs: {
          data: {
            image: {
              mode: "managed",
              mediaId: portrait ? "portrait-hotspot-image" : "landscape-hotspot-image",
              alt: "Illustrated regional map with marked landmarks",
            },
            hotspots: Array.from({ length: 10 }, (_, index) => ({
              id: `hotsp_${String(index + 1).padStart(6, "0")}`,
              centerX: 10 + (index % 5) * 19,
              centerY: 22 + Math.floor(index / 5) * 52,
              radius: 6,
              label: `Region ${index + 1}`,
            })),
            maxClicks: 2,
          },
        },
      };
    }),
  };
}

function testMediaPort(portrait: boolean): MediaPort {
  const width = portrait ? 600 : 1600;
  const height = portrait ? 1200 : 900;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#dce8f2"/><path d="M0 ${height * 0.62} Q ${width * 0.45} ${height * 0.35} ${width} ${height * 0.55} V${height} H0Z" fill="#6ba37c"/><circle cx="${width * 0.28}" cy="${height * 0.34}" r="${width * 0.09}" fill="#f1bf62"/></svg>`;
  return {
    resolve: async () => `data:image/svg+xml,${encodeURIComponent(svg)}`,
    upload: async () => {
      throw new Error("Uploads are unavailable in this browser fixture.");
    },
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

function describedText(element: HTMLElement): string {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

function requiredElement<ElementType extends Element>(root: ParentNode, selector: string) {
  const element = root.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Expected ${selector}`);
  return element;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (condition()) return;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error("Timed out waiting for full-slide Image Hotspot render.");
}

function requiredStyleRule(selector: string, mediaCondition: string): CSSStyleRule {
  for (const sheet of Array.from(document.styleSheets)) {
    const rule = findStyleRule(sheet.cssRules, selector, mediaCondition);
    if (rule) return rule;
  }
  throw new Error(`Expected ${selector} in ${mediaCondition}.`);
}

function findStyleRule(
  rules: CSSRuleList,
  selector: string,
  mediaCondition: string,
): CSSStyleRule | undefined {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSMediaRule && rule.conditionText === mediaCondition) {
      for (const nested of Array.from(rule.cssRules)) {
        if (!(nested instanceof CSSStyleRule)) continue;
        if (
          nested.selectorText
            .split(",")
            .map((entry) => entry.trim())
            .includes(selector)
        ) {
          return nested;
        }
      }
      continue;
    }
    if ("cssRules" in rule) {
      const nested = findStyleRule((rule as CSSGroupingRule).cssRules, selector, mediaCondition);
      if (nested) return nested;
    }
  }
  return undefined;
}
