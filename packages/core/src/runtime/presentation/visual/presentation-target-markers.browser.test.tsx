import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import type { SurfaceId } from "@/document/model/course-structure";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { emptyCalloutData } from "@/editor/blocks/presentation/callout/content";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { CourseDocumentRuntimeRenderer } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import "@/styles/globals.css";

import { PRESENTATION_VISUAL_TARGET_ID_ATTRIBUTE } from "./presentation-visual-target-attributes";
import { createVisualTargetResolver } from "./visual-target-resolver";

const runtimeComposition = createCoreScaffoldRuntimeComposition();

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
});

describe("production Presentation target markers", () => {
  it("marks structural, content and layout targets once beneath one Surface", async () => {
    const fixture = createMarkerFixture();
    let editor: TiptapEditor | null = null;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    root.render(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <CourseDocumentRuntimeRenderer
          composition={runtimeComposition}
          initialContent={fixture.document}
          productAccess={{ scaffoldPlusAuthorized: false }}
          visibleSurfaceId={fixture.surfaceId}
          onReady={(readyEditor) => {
            editor = readyEditor;
          }}
        />
      </CourseThemeProvider>,
    );

    await waitForCondition(
      () =>
        editor !== null &&
        fixture.targetIds.every((targetId) => anchorCount(host!, targetId) === 1),
    );

    const surfaceRoot = requiredElement<HTMLElement>(
      host,
      `[data-node="surface"][data-id="${fixture.surfaceId}"]`,
    );
    for (const targetId of fixture.targetIds) {
      expect(anchorCount(surfaceRoot, targetId)).toBe(1);
      expect(anchorCount(host, targetId)).toBe(1);
    }

    const resolver = createVisualTargetResolver(surfaceRoot);
    for (const targetId of fixture.targetIds) {
      expect(resolver.resolve(targetId)).toMatchObject({ kind: "resolved", targetId });
    }
    expect(resolver.resolve(fixture.unmountedId)).toEqual({
      kind: "unavailable",
      targetId: fixture.unmountedId,
      reason: "target-unmounted",
    });

    const duplicate = document.createElement("div");
    duplicate.setAttribute(PRESENTATION_VISUAL_TARGET_ID_ATTRIBUTE, fixture.blockId);
    surfaceRoot.append(duplicate);
    expect(() => resolver.resolve(fixture.blockId)).toThrow(/duplicate.*anchor/i);
    duplicate.remove();
  });
});

function createMarkerFixture(): {
  readonly document: JSONContent;
  readonly surfaceId: SurfaceId;
  readonly blockId: EmbeddedNodeId;
  readonly unmountedId: EmbeddedNodeId;
  readonly targetIds: readonly EmbeddedNodeId[];
} {
  const surfaceId = createEmbeddedNodeId() as SurfaceId;
  const layoutId = createEmbeddedNodeId();
  const sectionId = createEmbeddedNodeId();
  const blockId = createEmbeddedNodeId();
  const unmountedId = createEmbeddedNodeId();
  const document = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId,
    initialCourseSectionTitle: "Presentation target markers",
  });
  const courseDocument = document.content?.[0];
  if (courseDocument?.type !== "courseDocument") throw new Error("Expected a Course Document.");
  const courseSection = courseDocument.content?.find((node) => node.type === "courseSection");
  if (!courseSection) throw new Error("Expected a Course Section.");
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId });
  const region = surface.content?.find((node) => node.type === "region");
  if (!region) throw new Error("Expected the slide-content main Region.");
  region.content = [
    {
      type: "layout",
      attrs: {
        id: layoutId,
        variant: "tabs",
        options: { variant: "default", label: "Marker tabs" },
      },
      content: [
        {
          type: "section",
          attrs: { id: sectionId, options: { label: "Mounted target" } },
          content: [callout(blockId)],
        },
      ],
    },
  ];
  assignMissingIds(surface);
  courseDocument.content = [courseSection, surface];

  return {
    document,
    surfaceId,
    blockId,
    unmountedId,
    targetIds: [surfaceId, layoutId, sectionId, blockId],
  };
}

function callout(id: EmbeddedNodeId): JSONContent {
  return {
    type: "callout",
    attrs: { id, data: emptyCalloutData() },
    content: [
      {
        type: "callout_title",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Marker target" }] }],
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

function anchorCount(rootNode: ParentNode, targetId: EmbeddedNodeId): number {
  return rootNode.querySelectorAll(
    `[${PRESENTATION_VISUAL_TARGET_ID_ATTRIBUTE}="${CSS.escape(targetId)}"]`,
  ).length;
}

function requiredElement<T extends Element>(rootNode: ParentNode, selector: string): T {
  const element = rootNode.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element matching ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const startedAt = performance.now();
  while (!condition()) {
    if (performance.now() - startedAt > 3_000) throw new Error("Timed out waiting for condition.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
