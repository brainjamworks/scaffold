import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { emptyCalloutData } from "@/editor/blocks/presentation/callout/content";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { projectCourseStructure, type SurfaceId } from "@/document/model/course-structure";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import type { CompiledSurfacePresentationTimeline } from "@/presentation/model";
import { checkRuntimeDocumentReadiness } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import "@/styles/globals.css";

import { SlideshowPlayer } from "./SlideshowPlayer";
import type { SlideshowSurfaceRuntimeComposition } from "./slideshow-surface-runtime-composition";

const compositionProbe = vi.hoisted(() => ({
  current: null as SlideshowSurfaceRuntimeComposition | null,
}));

vi.mock("./slideshow-surface-runtime-composition", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./slideshow-surface-runtime-composition")>();
  return {
    ...actual,
    createSlideshowSurfaceRuntimeComposition(
      input: Parameters<typeof actual.createSlideshowSurfaceRuntimeComposition>[0],
    ) {
      const composition = actual.createSlideshowSurfaceRuntimeComposition(input);
      compositionProbe.current = composition;
      return composition;
    },
  };
});

const runtimeComposition = createCoreScaffoldRuntimeComposition();
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;

let root: Root | null = null;
let host: HTMLElement | null = null;
let restoreMatchMedia: (() => void) | null = null;
let restoreFullscreen: (() => void) | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
  restoreMatchMedia?.();
  restoreMatchMedia = null;
  restoreFullscreen?.();
  restoreFullscreen = null;
  compositionProbe.current = null;
});

describe("Slideshow Presentation visual playback", () => {
  it("plays, pauses, seeks in both directions, remounts and cleans up one real Reveal", async () => {
    restoreFullscreen = installFullscreenCapability();
    const mounted = await mountTracer({ sizing: "contained", width: 1_024 });
    const target = await mountedTarget(mounted.targetId);
    const canvas = requiredElement<HTMLElement>(host!, ".sc-slideshow-player__canvas");
    const session = requiredSession();

    expect(target).toHaveAttribute("data-presentation-availability", "withheld");
    expect(target).toHaveAttribute("aria-hidden", "true");
    expect(target).toHaveAttribute("inert");
    expect(canvas).toHaveAttribute("data-content-interaction", "inert");
    await waitForCondition(() => buttonByName("Next slide").disabled === false);
    await waitForCondition(() => buttonByNameOrNull("Enter fullscreen"));

    buttonByName("Next slide").click();
    expect(session.getSnapshot().phase).toBe("playing");
    session.pause();
    expect(session.getSnapshot().phase).toBe("paused");

    expect(session.seek(1_500).isOk()).toBe(true);
    expect(target).toHaveAttribute("data-presentation-availability", "available");
    expect(Number.parseFloat(target.style.opacity)).toBeCloseTo(0.5, 2);

    expect(session.seek(2_000).isOk()).toBe(true);
    expect(target.style.opacity).toBe("1");
    expect(session.seek(0).isOk()).toBe(true);
    expect(target).toHaveAttribute("data-presentation-availability", "withheld");
    expect(target.style.opacity).toBe("0");

    session.restart();
    expect(session.getSnapshot()).toMatchObject({ phase: "awaiting-start", currentTimeMs: 0 });

    const activeSurfaceRoot = requiredElement<HTMLElement>(
      host!,
      `[data-node="surface"][data-id="${mounted.surfaceId}"]`,
    );
    const targetParent = target.parentElement;
    if (!targetParent) throw new Error("Expected a parent for the Reveal target.");
    const replacement = target.cloneNode(true) as HTMLElement;
    replacement.removeAttribute("data-presentation-availability");
    replacement.removeAttribute("aria-hidden");
    replacement.removeAttribute("inert");
    replacement.style.opacity = "";
    replacement.style.pointerEvents = "";
    target.remove();
    await waitForCondition(
      () => host?.querySelector(`[data-presentation-target-id="${mounted.targetId}"]`) === null,
    );
    expect(session.seek(2_000).isOk()).toBe(true);

    targetParent.append(replacement);
    const remounted = await mountedTarget(mounted.targetId);
    expect(
      requiredElement<HTMLElement>(host!, `[data-node="surface"][data-id="${mounted.surfaceId}"]`),
    ).toBe(activeSurfaceRoot);
    expect(session.seek(0).isOk()).toBe(true);
    expect(remounted).toHaveAttribute("data-presentation-availability", "withheld");
    expect(session.seek(2_000).isOk()).toBe(true);
    expect(remounted).toHaveAttribute("data-presentation-availability", "available");
    expect(remounted.style.opacity).toBe("1");
    expect(canvas).toHaveAttribute("data-content-interaction", "inert");

    replacement.replaceWith(target);
    root?.unmount();
    root = null;
    expect(remounted).not.toHaveAttribute("data-presentation-availability");
    expect(remounted).not.toHaveAttribute("aria-hidden");
    expect(remounted).not.toHaveAttribute("inert");
    expect(remounted.style.opacity).toBe("");
  });

  it("settles the same Reveal under reduced motion at an embedded scale", async () => {
    restoreMatchMedia = installReducedMotionPreference();
    const mounted = await mountTracer({ sizing: "embedded", width: 512 });
    const target = await mountedTarget(mounted.targetId);
    const session = requiredSession();

    expect(target).toHaveAttribute("data-presentation-availability", "withheld");
    expect(session.seek(1_500).isOk()).toBe(true);
    expect(target).toHaveAttribute("data-presentation-availability", "available");
    expect(target.style.opacity).toBe("1");
    expect(target).not.toHaveAttribute("aria-hidden");
    expect(target).not.toHaveAttribute("inert");
  });
});

async function mountTracer({
  sizing,
  width,
}: {
  readonly sizing: "contained" | "embedded";
  readonly width: number;
}) {
  const surfaceId = createEmbeddedNodeId() as SurfaceId;
  const targetId = createEmbeddedNodeId();
  const content = tracerDocument(surfaceId, targetId);
  const structure = projectCourseStructure(content);
  if (!structure || structure.mode !== "slideshow") {
    throw new Error("Expected a projected Slideshow tracer document.");
  }
  const readiness = checkRuntimeDocumentReadiness(content, runtimeComposition, coreProductAccess);
  if (readiness.status !== "supported") {
    throw new Error(`Expected a supported tracer document, received ${readiness.status}.`);
  }
  let editor: TiptapEditor | null = null;
  host = document.createElement("div");
  host.style.cssText = `position:absolute;inset:0 auto auto 0;width:${width}px;height:576px;`;
  document.body.append(host);
  root = createRoot(host);
  root.render(
    <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
      <SlideshowPlayer
        preparedDocument={readiness.preparedDocument}
        structure={structure}
        sizing={sizing}
        surfaceRuntimeProgramSource={(requestedSurfaceId) =>
          requestedSurfaceId === surfaceId
            ? {
                presentation: {
                  timeline: revealTimeline(surfaceId, targetId),
                  autoAdvance: false,
                },
              }
            : undefined
        }
        onRendererReady={(readyEditor) => {
          editor = readyEditor;
        }}
      />
    </CourseThemeProvider>,
  );
  await waitForCondition(() => editor && compositionProbe.current?.presentationVisualRuntime);
  return { surfaceId, targetId };
}

function tracerDocument(surfaceId: SurfaceId, targetId: EmbeddedNodeId): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId,
    initialCourseSectionTitle: "Reveal tracer",
  });
  const courseDocument = content.content?.[0];
  if (courseDocument?.type !== "courseDocument") throw new Error("Expected a Course Document.");
  const courseSection = courseDocument.content?.find((node) => node.type === "courseSection");
  if (!courseSection) throw new Error("Expected a Course Section.");
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId });
  const region = surface.content?.find((node) => node.type === "region");
  if (!region) throw new Error("Expected the slide-content main Region.");
  region.content = [callout(targetId)];
  assignMissingIds(surface);
  courseDocument.content = [courseSection, surface];
  return content;
}

function callout(id: EmbeddedNodeId): JSONContent {
  return {
    type: "callout",
    attrs: { id, data: emptyCalloutData() },
    content: [
      {
        type: "callout_title",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Reveal target" }] }],
      },
      {
        type: "callout_prompt",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Mounted content" }] }],
      },
    ],
  };
}

function assignMissingIds(rootNode: JSONContent): void {
  const stack = [rootNode];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type !== "text") {
      node.attrs = { ...node.attrs, id: node.attrs?.["id"] ?? createEmbeddedNodeId() };
    }
    stack.push(...(node.content ?? []));
  }
}

function revealTimeline(
  surfaceId: SurfaceId,
  targetId: EmbeddedNodeId,
): CompiledSurfacePresentationTimeline {
  return Object.freeze({
    surfaceId,
    durationMs: 10_000,
    cues: Object.freeze([]),
    waits: Object.freeze([]),
    visualProgram: Object.freeze({
      surfaceId,
      durationMs: 10_000,
      targetById: new Map([
        [targetId, Object.freeze({ targetId, initialVisibility: "withheld" as const })],
      ]),
      segments: Object.freeze([
        Object.freeze({
          id: "reveal000001",
          targetId,
          startMs: 1_000,
          endMs: 2_000,
          visual: Object.freeze({
            kind: "reveal" as const,
            transition: Object.freeze({
              kind: "fade" as const,
              durationMs: 1_000,
              easing: Object.freeze({ kind: "preset" as const, preset: "linear" as const }),
            }),
          }),
        }),
      ]),
      sequenceContainers: Object.freeze([]),
    }),
  });
}

function requiredSession() {
  const session = compositionProbe.current?.presentationSession;
  if (!session) throw new Error("Expected the production Presentation Session.");
  return session;
}

async function mountedTarget(targetId: EmbeddedNodeId): Promise<HTMLElement> {
  let target: HTMLElement | null = null;
  await waitForCondition(() => {
    target =
      host?.querySelector<HTMLElement>(`[data-presentation-target-id="${targetId}"]`) ?? null;
    return target;
  });
  return target!;
}

function requiredElement<T extends Element>(rootNode: ParentNode, selector: string): T {
  const element = rootNode.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element matching ${selector}.`);
  return element;
}

function buttonByName(name: string): HTMLButtonElement {
  const button = buttonByNameOrNull(name);
  if (!button) throw new Error(`Expected ${name} button.`);
  return button;
}

function buttonByNameOrNull(name: string): HTMLButtonElement | null {
  return (
    Array.from(host?.querySelectorAll("button") ?? []).find(
      (button) => (button.getAttribute("aria-label") ?? button.textContent?.trim()) === name,
    ) ?? null
  );
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const startedAt = performance.now();
  while (!condition()) {
    if (performance.now() - startedAt > 3_000) throw new Error("Timed out waiting for condition.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function installReducedMotionPreference(): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
  const original = window.matchMedia.bind(window);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value(query: string): MediaQueryList {
      if (query !== "(prefers-reduced-motion: reduce)") return original(query);
      return {
        matches: true,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => true,
      };
    },
  });
  return () => {
    if (descriptor) Object.defineProperty(window, "matchMedia", descriptor);
  };
}

function installFullscreenCapability(): () => void {
  const enabled = Object.getOwnPropertyDescriptor(document, "fullscreenEnabled");
  const request = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "requestFullscreen");
  const exit = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value: async () => undefined,
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: async () => undefined,
  });
  return () => {
    restoreDescriptor(document, "fullscreenEnabled", enabled);
    restoreDescriptor(HTMLElement.prototype, "requestFullscreen", request);
    restoreDescriptor(document, "exitFullscreen", exit);
  };
}

function restoreDescriptor(
  owner: object,
  key: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) Object.defineProperty(owner, key, descriptor);
  else Reflect.deleteProperty(owner, key);
}
