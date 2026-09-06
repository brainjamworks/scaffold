// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { JSONContent } from "@tiptap/core";
import { createElement, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { getEditorNavigationForEditor } from "@/document/authoring/editor-navigation";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import { CourseDocumentEditor } from "./CourseDocumentEditor.test-harness";

const coreAuthoringComposition = createCoreScaffoldAuthoringComposition();
const FIRST_SLIDE_ID = EmbeddedNodeIdSchema.parse("surface00011");
const SECOND_SLIDE_ID = EmbeddedNodeIdSchema.parse("surface00012");
const FIRST_SECTION_ID = EmbeddedNodeIdSchema.parse("section00001");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function sectionedSlideshowDocument(): JSONContent {
  const document: JSONContent = {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          id: createEmbeddedNodeId(),
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          requiresScaffoldPlus: false,
          mode: "slideshow",
          surfaceSize: "16x9",
          overflowMode: "clip",
          theme: createDefaultPersistedCourseTheme(),
        },
        content: [
          { type: "courseSection", attrs: { id: FIRST_SECTION_ID, title: "Introduction" } },
          slideCoverSurfaceDefinition.createSurface({ surfaceId: FIRST_SLIDE_ID }),
          slideCoverSurfaceDefinition.createSurface({ surfaceId: SECOND_SLIDE_ID }),
        ],
      },
    ],
  };
  return withCurrentNodeIds(document);
}

function withCurrentNodeIds(document: JSONContent): JSONContent {
  const pending = [document];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (node.type !== "doc" && node.type !== "text" && node.attrs?.["id"] === undefined) {
      node.attrs = { ...node.attrs, id: createEmbeddedNodeId() };
    }
    pending.push(...(node.content ?? []));
  }
  return document;
}

describe("CourseDocumentEditor StrictMode lifecycle", () => {
  it("renders the Stage after StrictMode effect replay", async () => {
    const onReady = vi.fn();
    render(
      createElement(
        StrictMode,
        null,
        createElement(CourseDocumentEditor, {
          composition: coreAuthoringComposition,
          source: { mode: "document", content: sectionedSlideshowDocument() },
          onReady,
        }),
      ),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("course-document-editor")).toBeInTheDocument();
  });

  it("keeps editor navigation mounted after StrictMode effect replay", async () => {
    const onReady = vi.fn();
    render(
      createElement(
        StrictMode,
        null,
        createElement(CourseDocumentEditor, {
          composition: coreAuthoringComposition,
          source: { mode: "document", content: sectionedSlideshowDocument() },
          onReady,
        }),
      ),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];
    if (!editor) throw new Error("CourseDocumentEditor did not provide an editor");
    const navigation = getEditorNavigationForEditor(editor);

    await expect(
      navigation.showTarget(SECOND_SLIDE_ID, { origin: "document-outline" }),
    ).resolves.toEqual({ kind: "reached", id: SECOND_SLIDE_ID });
  });
});
