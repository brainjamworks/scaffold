import type { JSONContent } from "@tiptap/core";
import { fireEvent } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { projectCourseStructure } from "@/document/model/course-structure";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { projectMatchingLearnerNode } from "@/editor/blocks/assessment/matching/assessment";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { AssessmentRuntimeProvider } from "@/runtime/assessment/AssessmentRuntimeProvider";
import { checkRuntimeDocumentReadiness } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import { SlideshowPlayer } from "@/runtime/players/slideshow/SlideshowPlayer";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import "@/styles/globals.css";
import "@/theme/course/designs/scaffold-flow/v1/assessment-matching.css";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";

const mountedRoots: Root[] = [];
const runtimeComposition = createCoreScaffoldRuntimeComposition();
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("full-slide Matching runtime geometry", () => {
  it("uses the slide as a contained connector board", async () => {
    await page.viewport(1100, 700);
    const host = document.createElement("div");
    host.style.cssText = "position: absolute; inset: 0 auto auto 0; width: 1024px; height: 576px;";
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);
    const initialContent = matchingQuestionDocument();
    const readiness = checkRuntimeDocumentReadiness(
      initialContent,
      runtimeComposition,
      coreProductAccess,
    );
    if (readiness.status !== "supported") {
      throw new Error(
        `Expected supported Matching slide fixture, received ${readiness.status}: ${JSON.stringify(readiness)}`,
      );
    }

    root.render(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <ScaffoldArtifactIdentityProvider artifactId="artifact-1">
          <AssessmentRuntimeProvider>
            <SlideshowPlayer
              artifactId="artifact-1"
              preparedDocument={readiness.preparedDocument}
              structure={requireSlideshowStructure(initialContent)}
            />
          </AssessmentRuntimeProvider>
        </ScaffoldArtifactIdentityProvider>
      </CourseThemeProvider>,
    );

    await waitForCondition(
      () => host.querySelector('[data-matching-presentation="full-slide"]') !== null,
    );
    const courseRoot = requiredElement<HTMLElement>(host, ".sc-course");
    const player = requiredElement<HTMLElement>(host, ".sc-slideshow-player");
    const viewport = requiredElement<HTMLElement>(player, ".sc-slideshow-player__viewport");
    courseRoot.style.width = "100%";
    courseRoot.style.height = "100%";
    courseRoot.style.minHeight = "0";
    player.style.width = "100%";
    player.style.height = "100%";
    player.style.minHeight = "0";
    viewport.style.padding = "0";
    await waitForCondition(
      () =>
        requiredElement<HTMLElement>(player, ".sc-slideshow-player__stage").style.width ===
        "1024px",
    );
    const surface = requiredElement<HTMLElement>(
      player,
      ".sc-assessment-slide-surface-runtime-view",
    );
    const interaction = requiredElement<HTMLElement>(
      surface,
      '[data-matching-presentation="full-slide"]',
    );
    const canvas = requiredElement<HTMLElement>(interaction, ".sc-course-matching__canvas");
    const board = requiredElement<HTMLElement>(interaction, ".sc-course-matching__runtime-board");
    const firstRow = requiredElement<HTMLElement>(board, ".sc-course-matching__runtime-row");
    const firstRowItem = requiredElement<HTMLElement>(firstRow, ".sc-course-matching__item");
    const firstRowTarget = requiredElement<HTMLElement>(firstRow, ".sc-course-matching__target");
    const connectors = requiredElement<SVGElement>(interaction, ".sc-course-matching__connectors");
    const actions = requiredElement<HTMLElement>(surface, '[data-slot="assessment-actions-group"]');
    const submit = requiredElement<HTMLButtonElement>(
      actions,
      '[data-assessment-submission-action="submit"]',
    );

    expect(surface).toHaveClass("sc-slide-matching-question-surface-runtime-view");
    expect(interaction.hasAttribute("data-bounded-scroll")).toBe(false);
    expect(interaction.querySelector("[data-bounded-scroll-frame]")).toBeNull();
    expect(getComputedStyle(canvas).gridTemplateColumns.split(" ")).toHaveLength(3);
    expect(getComputedStyle(connectors).display).toBe("block");
    expect(interaction.getBoundingClientRect().width).toBeGreaterThan(
      surface.getBoundingClientRect().width * 0.88,
    );
    expect(canvas.getBoundingClientRect().width).toBeGreaterThan(
      surface.getBoundingClientRect().width * 0.82,
    );
    expect(firstRowItem.getBoundingClientRect().width).toBeGreaterThan(
      surface.getBoundingClientRect().width * 0.26,
    );
    expect(firstRowTarget.getBoundingClientRect().width).toBeGreaterThan(
      surface.getBoundingClientRect().width * 0.26,
    );
    expect(firstRowItem.getBoundingClientRect().height).toBe(
      firstRowTarget.getBoundingClientRect().height,
    );
    expect(board.scrollHeight).toBeGreaterThan(board.clientHeight);
    expect(getComputedStyle(board).overflowY).toBe("auto");
    expect(interaction.querySelectorAll(".sc-course-matching__runtime-list")).toHaveLength(0);
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
    ).toBeLessThan(2);

    requiredElement<HTMLButtonElement>(
      interaction,
      '[data-item-id="item__000001"][data-matching-draggable-item]',
    ).click();
    const targetPlacement = requiredElement<HTMLButtonElement>(
      interaction,
      '[data-target-id="target_00002"][data-matching-drop-target] .sc-course-matching__place-action',
    );
    await waitForCondition(() => !targetPlacement.hasAttribute("aria-disabled"));
    targetPlacement.click();

    await waitForCondition(
      () =>
        interaction.querySelector(
          '[data-matching-connector-item-id="item__000001"][data-matching-connector-target-id="target_00002"]',
        ) !== null,
    );
    const matchedItem = requiredElement<HTMLElement>(
      interaction,
      '[data-item-id="item__000001"][data-matching-draggable-item]',
    );
    const matchedTarget = requiredElement<HTMLElement>(
      interaction,
      '[data-target-id="target_00002"][data-matching-drop-target]',
    );
    const connector = requiredElement<SVGGraphicsElement>(
      interaction,
      '[data-matching-connector-item-id="item__000001"][data-matching-connector-target-id="target_00002"]',
    );
    const start = requiredElement<SVGCircleElement>(
      connector,
      '[data-matching-connector-endpoint="start"]',
    );
    const end = requiredElement<SVGCircleElement>(
      connector,
      '[data-matching-connector-endpoint="end"]',
    );
    const svgRect = connectors.getBoundingClientRect();
    const itemRect = matchedItem.getBoundingClientRect();
    const targetRect = matchedTarget.getBoundingClientRect();
    const startX = svgRect.left + Number.parseFloat(start.getAttribute("cx") ?? "NaN");
    const startY = svgRect.top + Number.parseFloat(start.getAttribute("cy") ?? "NaN");
    const endX = svgRect.left + Number.parseFloat(end.getAttribute("cx") ?? "NaN");
    const endY = svgRect.top + Number.parseFloat(end.getAttribute("cy") ?? "NaN");

    expect(Math.abs(startX - itemRect.right)).toBeLessThan(18);
    expect(Math.abs(startY - (itemRect.top + itemRect.height / 2))).toBeLessThan(8);
    expect(Math.abs(endX - targetRect.left)).toBeLessThan(18);
    expect(Math.abs(endY - (targetRect.top + targetRect.height / 2))).toBeLessThan(8);

    board.scrollTop = 24;
    fireEvent.scroll(board);
    await waitForCondition(
      () => Number.parseFloat(start.getAttribute("cy") ?? "NaN") < startY - svgRect.top,
    );
    const scrolledItemRect = matchedItem.getBoundingClientRect();
    const scrolledTargetRect = matchedTarget.getBoundingClientRect();
    const scrolledStartY = svgRect.top + Number.parseFloat(start.getAttribute("cy") ?? "NaN");
    const scrolledEndY = svgRect.top + Number.parseFloat(end.getAttribute("cy") ?? "NaN");
    expect(
      Math.abs(scrolledStartY - (scrolledItemRect.top + scrolledItemRect.height / 2)),
    ).toBeLessThan(8);
    expect(
      Math.abs(scrolledEndY - (scrolledTargetRect.top + scrolledTargetRect.height / 2)),
    ).toBeLessThan(8);
  });

  it("keeps full-slide keyboard and pointer-drag behaviour operable", async () => {
    await page.viewport(1100, 700);
    const host = document.createElement("div");
    host.style.cssText = "position: absolute; inset: 0 auto auto 0; width: 1024px; height: 576px;";
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);
    const initialContent = matchingQuestionDocument();
    const readiness = checkRuntimeDocumentReadiness(
      initialContent,
      runtimeComposition,
      coreProductAccess,
    );
    if (readiness.status !== "supported") {
      throw new Error(
        `Expected supported Matching slide fixture, received ${readiness.status}: ${JSON.stringify(readiness)}`,
      );
    }

    root.render(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <ScaffoldArtifactIdentityProvider artifactId="artifact-1">
          <AssessmentRuntimeProvider>
            <SlideshowPlayer
              artifactId="artifact-1"
              preparedDocument={readiness.preparedDocument}
              structure={requireSlideshowStructure(initialContent)}
            />
          </AssessmentRuntimeProvider>
        </ScaffoldArtifactIdentityProvider>
      </CourseThemeProvider>,
    );

    await waitForCondition(
      () => host.querySelector('[data-matching-presentation="full-slide"]') !== null,
    );
    const courseRoot = requiredElement<HTMLElement>(host, ".sc-course");
    const player = requiredElement<HTMLElement>(host, ".sc-slideshow-player");
    const viewport = requiredElement<HTMLElement>(player, ".sc-slideshow-player__viewport");
    courseRoot.style.width = "100%";
    courseRoot.style.height = "100%";
    courseRoot.style.minHeight = "0";
    player.style.width = "100%";
    player.style.height = "100%";
    player.style.minHeight = "0";
    viewport.style.padding = "0";
    await waitForCondition(
      () =>
        requiredElement<HTMLElement>(player, ".sc-slideshow-player__stage").style.width ===
        "1024px",
    );

    const interaction = requiredElement<HTMLElement>(
      host,
      '[data-matching-presentation="full-slide"]',
    );
    const firstItem = requiredElement<HTMLButtonElement>(
      interaction,
      '[data-item-id="item__000001"][data-matching-draggable-item]',
    );
    const firstTargetAction = requiredElement<HTMLButtonElement>(
      interaction,
      '[data-target-id="target_00002"][data-matching-drop-target] .sc-course-matching__place-action',
    );

    firstItem.focus();
    await userEvent.keyboard("{Enter}");
    await waitForCondition(() => !firstTargetAction.hasAttribute("aria-disabled"));
    firstTargetAction.focus();
    await userEvent.keyboard(" ");
    await waitForConnector(interaction, "item__000001", "target_00002");

    const dragItem = requiredElement<HTMLButtonElement>(
      interaction,
      '[data-item-id="item__000002"][data-matching-draggable-item]',
    );
    const dragTarget = visibleUnmatchedTarget(interaction);
    const dragTargetId = dragTarget.getAttribute("data-target-id");
    if (!dragTargetId) throw new Error("Expected a Matching target id.");
    await startPointerDrag(dragItem, centerOf(dragTarget));
    await waitForCondition(
      () => document.querySelector("[data-interaction-drag-overlay]") !== null,
    );
    await finishPointerDrag(centerOf(dragTarget));
    await waitForConnector(interaction, "item__000002", dragTargetId);
  });

  it("keeps Matching reduced-motion and forced-colour theme rules explicit", () => {
    const flowReducedMotionItem = requiredStyleRule(
      ".sc-course.sc-course-theme-scaffold-flow-v1 .sc-course-matching__item",
      "(prefers-reduced-motion: reduce)",
    );
    const flowForcedColourItem = requiredStyleRule(
      ".sc-course.sc-course-theme-scaffold-flow-v1 .sc-course-matching__item",
      "(forced-colors: active)",
    );
    const atlasReducedMotionItem = requiredStyleRule(
      ".sc-course.sc-course-theme-pocket-atlas-v1 .sc-course-matching__item",
      "(prefers-reduced-motion: reduce)",
    );
    const atlasForcedColourTarget = requiredStyleRule(
      ".sc-course.sc-course-theme-pocket-atlas-v1 .sc-course-matching__target",
      "(forced-colors: active)",
    );

    expect(flowReducedMotionItem.style.transition).toBe("none");
    expect(flowForcedColourItem.style.borderColor).toBe("canvastext");
    expect(flowForcedColourItem.style.boxShadow).toBe("none");
    expect(atlasReducedMotionItem.style.transition).toBe("none");
    expect(atlasForcedColourTarget.style.background).toBe("canvas");
    expect(atlasForcedColourTarget.style.color).toBe("canvastext");
  });
});

function matchingQuestionDocument(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-matching-question");
  if (!definition) throw new Error("Expected slide-matching-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Matching Question Surface content.");
  const document = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId: "surface00001",
    initialCourseSectionTitle: "Introduction",
  });
  const courseDocument = document.content?.[0];
  if (courseDocument?.type !== "courseDocument") {
    throw new Error("Expected a Course Document fixture.");
  }
  const courseSection = courseDocument.content?.find((child) => child.type === "courseSection");
  if (!courseSection) throw new Error("Expected a Course Section fixture.");

  courseDocument.content = [
    courseSection,
    {
      ...surface,
      content: [projectMatchingLearnerNode(authoredQuestion(question))],
    },
  ];
  normalizeRuntimeFixtureIds(document);
  return document;
}

function requireSlideshowStructure(content: JSONContent) {
  const structure = projectCourseStructure(content);
  if (!structure || structure.mode !== "slideshow") {
    throw new Error("Expected a valid Slideshow course structure.");
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

function authoredQuestion(question: JSONContent): JSONContent {
  const countries = [
    ["France", "Paris"],
    ["Spain", "Madrid"],
    ["Italy", "Rome"],
    ["Portugal", "Lisbon"],
    ["Germany", "Berlin"],
    ["Greece", "Athens"],
    ["Norway", "Oslo"],
    ["Japan", "Tokyo"],
    ["Canada", "Ottawa"],
    ["Brazil", "Brasilia"],
    ["Kenya", "Nairobi"],
    ["Egypt", "Cairo"],
  ] as const;

  return {
    ...question,
    attrs: { ...question.attrs, id: "target000001" },
    content: (question.content ?? []).map((child) =>
      child.type === "matching_pairs_group"
        ? {
            ...child,
            content: countries.map(([item, target], index) => {
              const suffix = String(index + 1).padStart(6, "0");
              const targetSuffix = String(index + 1).padStart(5, "0");
              return matchingPair(
                `pair__${suffix}`,
                `item__${suffix}`,
                `target_${targetSuffix}`,
                item,
                target,
              );
            }),
          }
        : child,
    ),
  };
}

function matchingPair(
  id: string,
  itemId: string,
  targetId: string,
  itemText: string,
  targetText: string,
): JSONContent {
  return {
    type: "matching_pair",
    attrs: { id },
    content: [
      {
        type: "matching_item",
        attrs: { id: itemId },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: `${itemText} has a longer learner-facing label` }],
          },
        ],
      },
      {
        type: "matching_target",
        attrs: { id: targetId },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: `${targetText} answer card` }],
          },
        ],
      },
    ],
  };
}

function requiredElement<ElementType extends Element>(
  root: ParentNode,
  selector: string,
): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Expected ${selector}`);
  return element;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (condition()) return;
    await new Promise(requestAnimationFrame);
  }
  throw new Error("Timed out waiting for full-slide Matching render");
}

async function waitForConnector(
  interaction: HTMLElement,
  itemId: string,
  targetId: string,
): Promise<void> {
  await waitForCondition(
    () =>
      interaction.querySelector(
        `[data-matching-connector-item-id="${itemId}"][data-matching-connector-target-id="${targetId}"]`,
      ) !== null,
  );
}

function centerOf(element: HTMLElement): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function visibleUnmatchedTarget(interaction: HTMLElement): HTMLElement {
  const board = requiredElement<HTMLElement>(interaction, ".sc-course-matching__runtime-board");
  const boardRect = board.getBoundingClientRect();
  const targets = Array.from(
    interaction.querySelectorAll<HTMLElement>(
      '[data-matching-drop-target]:not([data-target-id="target_00002"])',
    ),
  );
  const visible = targets.find((target) => {
    const rect = target.getBoundingClientRect();
    return (
      target.querySelector(".sc-course-matching__matched-item") === null &&
      rect.top >= boardRect.top &&
      rect.bottom <= boardRect.bottom
    );
  });
  if (!visible) throw new Error("Expected a visible unmatched Matching target.");
  return visible;
}

async function startPointerDrag(
  source: HTMLElement,
  destination: Readonly<{ x: number; y: number }>,
): Promise<void> {
  const start = centerOf(source);
  fireEvent.pointerDown(source, {
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  fireEvent.pointerMove(document, {
    button: 0,
    buttons: 1,
    clientX: start.x + 12,
    clientY: start.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(1);
  fireEvent.pointerMove(document, {
    button: 0,
    buttons: 1,
    clientX: destination.x,
    clientY: destination.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(2);
}

async function finishPointerDrag(point: Readonly<{ x: number; y: number }>): Promise<void> {
  fireEvent.pointerUp(document, {
    buttons: 0,
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(2);
}

async function animationFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function requiredStyleRule(selector: string, mediaCondition?: string): CSSStyleRule {
  for (const sheet of Array.from(document.styleSheets)) {
    const rule = findStyleRule(sheet.cssRules, selector, mediaCondition);
    if (rule) return rule;
  }
  throw new Error(
    `Expected a CSS rule for ${selector}${mediaCondition ? ` in ${mediaCondition}` : ""}.`,
  );
}

function findStyleRule(
  rules: CSSRuleList,
  selector: string,
  mediaCondition?: string,
): CSSStyleRule | undefined {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      if (
        mediaCondition === undefined &&
        rule.selectorText
          .split(",")
          .map((entry) => entry.trim())
          .includes(selector)
      ) {
        return rule;
      }
      continue;
    }

    if (rule instanceof CSSMediaRule) {
      if (mediaCondition === undefined || rule.conditionText === mediaCondition) {
        const nestedRule = findStyleRule(
          rule.cssRules,
          selector,
          mediaCondition === rule.conditionText ? undefined : mediaCondition,
        );
        if (nestedRule) return nestedRule;
      }
    }
  }
  return undefined;
}
