import type { JSONContent } from "@tiptap/core";
import { fireEvent } from "@testing-library/react";
import { render as renderBrowserReact } from "vitest-browser-react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "./document-navigator/document-navigator.css";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { ScaffoldAuthoringApp } from "@/editor/shell/authoring/ScaffoldAuthoringApp";
import type { ArtifactSavePayload, LearnerPublicationPort } from "@/host/ports";

describe("Course Outline Surface movement", () => {
  it("centers empty Course Section content vertically", async () => {
    const rendered = await renderBrowserReact(
      <ScaffoldAuthoringApp
        application={createScaffoldApplication()}
        artifact={{
          id: "outline-empty-section-alignment",
          title: "Outline empty Section alignment",
          mode: "slideshow",
          content: sectionedSlideshow(),
        }}
        productAccess={{ scaffoldPlusAuthorized: false }}
        services={{
          artifactPersistence: {
            saveArtifact: vi.fn(async (_payload: ArtifactSavePayload) => ({
              artifactRevision: "outline-empty-section-alignment-revision" as const,
            })),
          },
          learnerPublication: learnerPublication(),
          media: null,
        }}
      />,
    );

    try {
      requireElement<HTMLButtonElement>('button[aria-label="Show Document Outline"]').click();
      await expect.element(page.getByText("No slides yet")).toBeVisible();
      const emptySection = sectionGroup("Section 2");
      if (!emptySection) throw new Error("Expected the empty Course Section.");
      const target = requireElementFrom<HTMLElement>(
        emptySection,
        ".sc-document-outline-drop-target--visible",
      );
      const content = requireElementFrom<HTMLElement>(target, ".sc-course-outline-empty-section");
      const targetRect = target.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const topGap = contentRect.top - targetRect.top;
      const bottomGap = targetRect.bottom - contentRect.bottom;
      const targetStyle = getComputedStyle(target);

      expect(Number.parseFloat(targetStyle.paddingTop)).toBeGreaterThan(0);
      expect(targetStyle.paddingBottom).toBe(targetStyle.paddingTop);
      expect(Math.abs(topGap - bottomGap)).toBeLessThan(1);
    } finally {
      await rendered.unmount();
    }
  });

  it("moves only a Surface through the keyboard drag session and preserves its stable ID", async () => {
    const saveArtifact = vi.fn(async (_payload: ArtifactSavePayload) => ({
      artifactRevision: "outline-move-revision" as const,
    }));
    const rendered = await renderBrowserReact(
      <ScaffoldAuthoringApp
        application={createScaffoldApplication()}
        artifact={{
          id: "outline-surface-movement",
          title: "Outline Surface movement",
          mode: "slideshow",
          content: sectionedSlideshow(),
        }}
        productAccess={{ scaffoldPlusAuthorized: false }}
        services={{
          artifactPersistence: { saveArtifact },
          learnerPublication: learnerPublication(),
          media: null,
        }}
      />,
    );

    try {
      requireElement<HTMLButtonElement>('button[aria-label="Show Document Outline"]').click();
      await expect.element(page.getByRole("heading", { name: "Section 1" })).toBeVisible();
      await expect
        .poll(() => document.querySelectorAll('button[aria-label^="Move Surface "]').length)
        .toBe(3);
      expect(document.querySelector('button[aria-label^="Move Surface Section"]')).toBeNull();

      const handle = requireElement<HTMLButtonElement>('button[aria-label^="Move Surface "]');
      const sourceId = handle.getAttribute("data-course-outline-surface-drag-id");
      const sourceLabel = handle.getAttribute("aria-label")?.replace("Move Surface ", "") ?? "";
      const sourceCard = requireElement<HTMLElement>(
        `[data-course-outline-surface-slot="${sourceId}"] .sc-document-navigator-surface-card`,
      );
      const sourceSlide = requireElement<HTMLElement>(
        `[data-course-outline-surface-slot="${sourceId}"] .sc-document-navigator-surface-card-selection`,
      );
      const sourceSubtitle = requireElement<HTMLElement>(
        `[data-course-outline-surface-slot="${sourceId}"] .sc-document-navigator-surface-meta`,
      );
      const sourceCardRect = sourceCard.getBoundingClientRect();
      const sourceSlideRect = sourceSlide.getBoundingClientRect();
      const sourceSubtitleRect = sourceSubtitle.getBoundingClientRect();
      expect(sourceId).toBe("surface00001");
      handle.focus();
      await userEvent.keyboard("{Space}");
      await expect
        .poll(() => Boolean(document.querySelector("[data-interaction-drag-overlay]")))
        .toBe(true);
      const overlay = requireElement<HTMLElement>("[data-interaction-drag-overlay]");
      const overlayGhost = requireElement<HTMLElement>(
        ".sc-course-outline-slide-ghost--overlay .sc-course-outline-slide-ghost__visual",
      );
      expect(overlay.textContent).toContain(sourceLabel);
      expect(overlay.querySelector(".sc-course-outline-slide-ghost__footer")).toBeNull();
      expect(overlay.querySelector(".sc-document-navigator-surface-actions")).toBeNull();
      expect(sourceCard).toHaveAttribute("data-interaction-drag-placeholder");
      expect(Math.abs(overlay.getBoundingClientRect().width - sourceCardRect.width)).toBeLessThan(
        1,
      );
      expect(
        Math.abs(
          overlay.getBoundingClientRect().height -
            (sourceSlideRect.height + sourceSubtitleRect.height),
        ),
      ).toBeLessThan(1);
      expect(overlay.getBoundingClientRect().height).toBeLessThan(sourceCardRect.height);
      expect(
        Math.abs(
          overlayGhost.getBoundingClientRect().height - overlay.getBoundingClientRect().height,
        ),
      ).toBeLessThan(1);
      for (let step = 0; step < 120 && !activeDestination()?.startsWith("section:"); step += 1) {
        await userEvent.keyboard("{ArrowDown}");
        await animationFrames(1);
      }
      const sectionTarget = activeDropTarget();
      expect(sectionTarget?.getAttribute("data-destination")).toMatch(/^section:/);
      expect(sectionTarget).toHaveClass("sc-document-outline-drop-target--section");
      expect(sectionTarget?.getBoundingClientRect().height).toBeGreaterThanOrEqual(64);
      await expect.poll(() => dragAnnouncement()).toContain("is over Move into Section 2");

      for (let step = 0; step < 120 && activeDestination() !== "after:surface00003"; step += 1) {
        await userEvent.keyboard("{ArrowDown}");
        await animationFrames(1);
      }
      await expect
        .poll(() =>
          Boolean(document.querySelector('.sc-document-outline-drop-target[data-active="true"]')),
        )
        .toBe(true);
      await expect.poll(() => activeDestination()).toBe("after:surface00003");
      expect(
        requireElement<HTMLElement>(
          '[data-course-outline-surface-slot="surface00003"] .sc-document-navigator-surface-card',
        )
          .getAnimations()
          .some((animation) => animation.playState === "running"),
      ).toBe(true);
      const insertionTarget = activeDropTarget();
      const insertionItem = insertionTarget?.closest<HTMLElement>('[role="listitem"]');
      expect(insertionTarget).toHaveClass("sc-document-outline-drop-target--insertion");
      expect(getComputedStyle(insertionTarget!, "::before").content).toBe("none");
      expect(insertionTarget?.getBoundingClientRect().left).toBeGreaterThanOrEqual(
        insertionItem?.getBoundingClientRect().left ?? Number.POSITIVE_INFINITY,
      );
      await expect.poll(() => sectionVisualSurfaceIds("Section 1")).toEqual([]);
      await expect
        .poll(() => sectionVisualSurfaceIds("Section 3"))
        .toEqual(["surface00002", "surface00003", "surface00001"]);
      const projectedSlide = requireElement<HTMLElement>(
        '[data-course-outline-surface-projection="surface00001"]',
      );
      expect(projectedSlide).toHaveClass("sc-course-outline-slide-ghost--projection");
      expect(projectedSlide.textContent).toContain(sourceLabel);
      expect(
        Math.abs(projectedSlide.getBoundingClientRect().height - sourceCardRect.height),
      ).toBeLessThan(1);
      expect(
        Math.abs(projectedSlide.getBoundingClientRect().width - sourceCardRect.width),
      ).toBeLessThan(1);
      const projectedVisual = requireElement<HTMLElement>(
        '[data-course-outline-surface-projection="surface00001"] .sc-course-outline-slide-ghost__visual',
      );
      expect(
        Math.abs(
          projectedVisual.getBoundingClientRect().height -
            (sourceSlideRect.height + sourceSubtitleRect.height),
        ),
      ).toBeLessThan(1);
      expect(projectedVisual.getBoundingClientRect().height).toBeLessThan(
        projectedSlide.getBoundingClientRect().height,
      );
      expect(
        requireElement<HTMLElement>(
          `[data-course-outline-surface-slot="${sourceId}"]`,
        ).getBoundingClientRect().height,
      ).toBeLessThan(1);
      expect(projectedSlide.getBoundingClientRect().height).toBeGreaterThan(100);
      expect(projectedSlide.getBoundingClientRect().width).toBeGreaterThan(100);
      expect(sectionMemberSurfaceIds("Section 1")).toContain(sourceId);
      expect(sectionMemberSurfaceIds("Section 3")).not.toContain(sourceId);
      expect(saveArtifact).not.toHaveBeenCalled();
      handle.focus();
      await userEvent.keyboard("{Space}");
      await expect
        .poll(() => Boolean(document.querySelector("[data-interaction-drag-overlay]")))
        .toBe(false);

      await expect
        .poll(() => document.querySelector(".sc-document-outline-status")?.textContent)
        .toContain("Moved");
      await expect.poll(() => sectionMemberLabels("Section 3").length).toBe(3);
      expect(sectionMemberSurfaceIds("Section 3")).toContain(sourceId);
      await expect
        .poll(() => document.activeElement?.getAttribute("data-course-outline-surface-drag-id"))
        .toBe(sourceId);
      await expect.poll(() => saveArtifact.mock.calls.length).toBe(1);
      expect(sectionMemberLabels("Section 1")).toHaveLength(0);
      expect(sectionMemberLabels("Section 2")).toHaveLength(0);
      expect(sectionMemberLabels("Section 3")).toHaveLength(3);

      const undo = requireElement<HTMLButtonElement>('button[aria-label="Undo"]');
      await expect.poll(() => undo.disabled).toBe(false);
      undo.click();
      await expect.poll(() => sectionMemberSurfaceIds("Section 1")).toContain(sourceId);

      const redo = requireElement<HTMLButtonElement>('button[aria-label="Redo"]');
      await expect.poll(() => redo.disabled).toBe(false);
      redo.click();
      await expect.poll(() => sectionMemberSurfaceIds("Section 3")).toContain(sourceId);
    } finally {
      await rendered.unmount();
    }
  });

  it("projects the slide order while pointer dragging before the document commit", async () => {
    const saveArtifact = vi.fn(async (_payload: ArtifactSavePayload) => ({
      artifactRevision: "outline-pointer-move-revision" as const,
    }));
    const rendered = await renderBrowserReact(
      <ScaffoldAuthoringApp
        application={createScaffoldApplication()}
        artifact={{
          id: "outline-pointer-surface-movement",
          title: "Outline pointer Surface movement",
          mode: "slideshow",
          content: sectionedSlideshow(),
        }}
        productAccess={{ scaffoldPlusAuthorized: false }}
        services={{
          artifactPersistence: { saveArtifact },
          learnerPublication: learnerPublication(),
          media: null,
        }}
      />,
    );

    try {
      requireElement<HTMLButtonElement>('button[aria-label="Show Document Outline"]').click();
      await expect.element(page.getByRole("heading", { name: "Section 1" })).toBeVisible();
      const handle = requireElement<HTMLButtonElement>(
        'button[data-course-outline-surface-drag-id="surface00001"]',
      );
      const targetSelector =
        '.sc-document-outline-drop-target[data-destination="section:section00002:end"]';
      const start = centerOf(handle.getBoundingClientRect());
      const sourceRect = requireElement<HTMLElement>(
        '[data-course-outline-surface-slot="surface00001"] .sc-document-navigator-surface-card',
      ).getBoundingClientRect();
      const sourceCenter = centerOf(sourceRect);
      fireEvent.pointerDown(handle, {
        button: 0,
        buttons: 1,
        clientX: start.x,
        clientY: start.y,
        isPrimary: true,
        pointerId: 1,
        pointerType: "mouse",
      });
      await movePointer({ x: start.x, y: start.y + 6 }, 1);
      await expect
        .poll(() => Boolean(document.querySelector("[data-interaction-drag-overlay]")))
        .toBe(true);

      let pointer = start;
      for (
        let attempt = 0;
        attempt < 12 && activeDestination() !== "section:section00002:end";
        attempt += 1
      ) {
        const targetRect = requireElement<HTMLElement>(targetSelector).getBoundingClientRect();
        pointer = pointerForSourceCenter(start, sourceCenter, centerOf(targetRect));
        await movePointer(pointer, 1);
      }

      await expect.poll(() => activeDestination()).toBe("section:section00002:end");
      expect(document.querySelector(".sc-course-outline-slide-ghost--overlay")).not.toBeNull();
      await expect.poll(() => sectionVisualSurfaceIds("Section 1")).toEqual([]);
      await expect.poll(() => sectionVisualSurfaceIds("Section 2")).toEqual(["surface00001"]);
      await expect
        .poll(() => sectionVisualSurfaceIds("Section 3"))
        .toEqual(["surface00002", "surface00003"]);
      const projectedSlide = requireElement<HTMLElement>(
        '[data-course-outline-surface-projection="surface00001"]',
      );
      const emptySectionSurfaceList = sectionGroup("Section 2")?.querySelector<HTMLElement>(
        ".sc-course-section-surfaces",
      );
      if (!emptySectionSurfaceList) throw new Error("Expected the empty Section Surface list.");
      expect(
        Math.abs(projectedSlide.getBoundingClientRect().height - sourceRect.height),
      ).toBeLessThan(1);
      expect(
        Math.abs(
          emptySectionSurfaceList.getBoundingClientRect().height -
            projectedSlide.getBoundingClientRect().height,
        ),
      ).toBeLessThan(1);
      expect(
        getComputedStyle(requireElement<HTMLElement>(targetSelector), "::before").content,
      ).toBe("none");
      expect(saveArtifact).not.toHaveBeenCalled();

      pointer = pointerForSourceCenter(
        start,
        sourceCenter,
        centerOf(requireElement<HTMLElement>(targetSelector).getBoundingClientRect()),
      );
      fireEvent.pointerUp(document, {
        buttons: 0,
        clientX: pointer.x,
        clientY: pointer.y,
        isPrimary: true,
        pointerId: 1,
        pointerType: "mouse",
      });
      await animationFrames(2);

      await expect.poll(() => sectionMemberSurfaceIds("Section 2")).toContain("surface00001");
      await expect.poll(() => saveArtifact.mock.calls.length).toBe(1);
      expect(document.querySelector("[data-course-outline-surface-projection]")).toBeNull();
    } finally {
      await rendered.unmount();
    }
  });

  it("does not present a no-op Surface destination", async () => {
    const rendered = await renderBrowserReact(
      <ScaffoldAuthoringApp
        application={createScaffoldApplication()}
        artifact={{
          id: "outline-no-op-surface-movement",
          title: "Outline no-op Surface movement",
          mode: "slideshow",
          content: sectionedSlideshow(),
        }}
        productAccess={{ scaffoldPlusAuthorized: false }}
        services={{
          artifactPersistence: {
            saveArtifact: vi.fn(async (_payload: ArtifactSavePayload) => ({
              artifactRevision: "outline-no-op-revision" as const,
            })),
          },
          learnerPublication: learnerPublication(),
          media: null,
        }}
      />,
    );
    let cueObserver: MutationObserver | null = null;

    try {
      requireElement<HTMLButtonElement>('button[aria-label="Show Document Outline"]').click();
      await expect.element(page.getByRole("heading", { name: "Section 1" })).toBeVisible();
      const handle = requireElement<HTMLButtonElement>(
        'button[data-course-outline-surface-drag-id="surface00001"]',
      );
      const sourceCard = requireElement<HTMLElement>(
        '[data-course-outline-surface-slot="surface00001"] .sc-document-navigator-surface-card',
      );
      const noOpTarget = requireElement<HTMLElement>(
        '.sc-document-outline-drop-target[data-destination="before:surface00002"]',
      );
      const visibleGenericCues: string[] = [];
      cueObserver = new MutationObserver(() => {
        for (const target of document.querySelectorAll<HTMLElement>(
          '.sc-course-section-surfaces .sc-document-outline-drop-target[data-active="true"]',
        )) {
          if (getComputedStyle(target, "::before").content !== "none") {
            visibleGenericCues.push(target.dataset.destination ?? "unknown");
          }
        }
      });
      cueObserver.observe(document, {
        attributeFilter: ["data-active"],
        attributes: true,
        subtree: true,
      });

      const start = centerOf(handle.getBoundingClientRect());
      const sourceCenter = centerOf(sourceCard.getBoundingClientRect());
      fireEvent.pointerDown(handle, {
        button: 0,
        buttons: 1,
        clientX: start.x,
        clientY: start.y,
        isPrimary: true,
        pointerId: 1,
        pointerType: "mouse",
      });
      await movePointer({ x: start.x, y: start.y + 6 }, 1);
      await expect
        .poll(() => Boolean(document.querySelector("[data-interaction-drag-overlay]")))
        .toBe(true);

      const noOpPoint = pointerForSourceCenter(
        start,
        sourceCenter,
        centerOf(noOpTarget.getBoundingClientRect()),
      );
      await movePointer(noOpPoint, 1);
      await animationFrames(2);

      expect(visibleGenericCues).toEqual([]);
      expect(activeDestination()).not.toBe("before:surface00002");
      fireEvent.pointerUp(document, {
        buttons: 0,
        clientX: noOpPoint.x,
        clientY: noOpPoint.y,
        isPrimary: true,
        pointerId: 1,
        pointerType: "mouse",
      });
      await expect
        .poll(() => Boolean(document.querySelector("[data-interaction-drag-overlay]")))
        .toBe(false);
    } finally {
      cueObserver?.disconnect();
      await rendered.unmount();
    }
  });
});

function sectionedSlideshow(): JSONContent {
  const first = createScaffoldDocumentContent({
    mode: "slideshow",
    initialCourseSectionTitle: "Section 1",
    surfaceId: "surface00001",
  });
  const second = createScaffoldDocumentContent({
    mode: "slideshow",
    initialCourseSectionTitle: "Section 3",
    surfaceId: "surface00002",
  });
  const third = createScaffoldDocumentContent({
    mode: "slideshow",
    initialCourseSectionTitle: "Section 3",
    surfaceId: "surface00003",
  });
  const course = first.content?.[0];
  const firstSurface = course?.content?.[1];
  const secondSurface = second.content?.[0]?.content?.[1];
  const thirdSurface = third.content?.[0]?.content?.[1];
  if (!course || !firstSurface || !secondSurface || !thirdSurface) {
    throw new Error("Expected slideshow Surface fixtures");
  }
  course.content = [
    { type: "courseSection", attrs: { id: "section00001", title: "Section 1" } },
    firstSurface,
    { type: "courseSection", attrs: { id: "section00002", title: "Section 2" } },
    { type: "courseSection", attrs: { id: "section00003", title: "Section 3" } },
    secondSurface,
    thirdSurface,
  ];
  return first;
}

function sectionMemberLabels(sectionLabel: string): string[] {
  const section = sectionGroup(sectionLabel);
  return Array.from(
    section?.querySelectorAll<HTMLButtonElement>('button[aria-label^="Select Surface "]') ?? [],
  ).map((button) => button.getAttribute("aria-label")?.replace("Select Surface ", "") ?? "");
}

function sectionMemberSurfaceIds(sectionLabel: string): Array<string | null> {
  const section = sectionGroup(sectionLabel);
  return Array.from(
    section?.querySelectorAll<HTMLElement>("[data-course-outline-surface-drag-id]") ?? [],
  ).map((handle) => handle.getAttribute("data-course-outline-surface-drag-id"));
}

function sectionVisualSurfaceIds(sectionLabel: string): string[] {
  const section = sectionGroup(sectionLabel);
  return Array.from(
    section?.querySelectorAll<HTMLElement>(
      "[data-course-outline-surface-slot], [data-course-outline-surface-projection]",
    ) ?? [],
  ).flatMap((item) => {
    if (item.hasAttribute("data-course-outline-projected-source")) return [];
    return [
      item.getAttribute("data-course-outline-surface-projection") ??
        item.getAttribute("data-course-outline-surface-slot") ??
        "",
    ];
  });
}

function sectionGroup(sectionLabel: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>(".sc-course-section-group")).find(
      (section) =>
        section.querySelector(".sc-course-section-title")?.textContent?.trim() === sectionLabel,
    ) ?? null
  );
}

function activeDestination(): string | null {
  return activeDropTarget()?.getAttribute("data-destination") ?? null;
}

function activeDropTarget(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '.sc-document-outline-drop-target[data-active="true"]',
  );
}

function dragAnnouncement(): string {
  return (
    document.querySelector<HTMLElement>('[id^="scaffold-dnd-announcement-"]')?.textContent ?? ""
  );
}

function learnerPublication(): LearnerPublicationPort {
  return {
    getStatus: async () => ({
      currentArtifactRevision: "outline-move-revision",
      publishedArtifactRevision: null,
      publishedAt: null,
    }),
    publish: async (payload) => ({
      currentArtifactRevision: payload.sourceArtifactRevision,
      publishedArtifactRevision: payload.sourceArtifactRevision,
      publishedAt: "2026-08-11T08:00:00.000Z",
    }),
  };
}

function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Expected element ${selector}`);
  return element;
}

function requireElementFrom<ElementType extends Element>(
  root: ParentNode,
  selector: string,
): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Expected element ${selector}`);
  return element;
}

async function animationFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function movePointer(point: Readonly<{ x: number; y: number }>, pointerId: number) {
  fireEvent.pointerMove(document, {
    button: 0,
    buttons: 1,
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
    pointerId,
    pointerType: "mouse",
  });
  await animationFrames(2);
}

function centerOf(rect: DOMRect): Readonly<{ x: number; y: number }> {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function pointerForSourceCenter(
  activation: Readonly<{ x: number; y: number }>,
  sourceCenter: Readonly<{ x: number; y: number }>,
  targetCenter: Readonly<{ x: number; y: number }>,
): Readonly<{ x: number; y: number }> {
  return {
    x: activation.x + targetCenter.x - sourceCenter.x,
    y: activation.y + targetCenter.y - sourceCenter.y,
  };
}
