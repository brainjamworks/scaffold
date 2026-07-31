// @vitest-environment happy-dom

import { cleanup, render, waitFor } from "@testing-library/react";
import { Extension, type Editor, type JSONContent } from "@tiptap/core";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { CourseDocumentEditor } from "./CourseDocumentEditor";

afterEach(cleanup);

describe("CourseDocumentEditor portable content", () => {
  it("initializes a non-collaborative editor from portable JSON and emits updated JSON", async () => {
    const content = pageDocument("Initial portable content");
    const onReady = vi.fn();
    const onUpdate = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        source: { mode: "document", content, onUpdate },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0] as Editor;
    editor.commands.insertContent("Portable update");

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
      expect(onUpdate.mock.lastCall?.[0]).toEqual(editor.getJSON());
    });
  });

  it("allows a trusted external extension to own initial editor state", async () => {
    const externalContent = pageDocument("Externally owned content");
    const ownExternalState = Extension.create({
      name: "testExternalStateOwner",
      onBeforeCreate() {
        this.editor.options.content = externalContent;
      },
    });
    const onReady = vi.fn();
    const onUpdate = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        source: {
          mode: "external",
          stateExtensions: [ownExternalState],
          onUpdate,
        },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0] as Editor;
    expect(editor.getText()).toContain("Externally owned content");

    editor.commands.insertContent(" checkpoint signal");
    await waitFor(() => expect(onUpdate.mock.lastCall?.[0]).toEqual(editor.getJSON()));
  });

  it("treats the source as initial state for the mounted session", async () => {
    const onReady = vi.fn();
    const { rerender } = render(
      createElement(CourseDocumentEditor, {
        source: { mode: "document", content: pageDocument("First artifact") },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0] as Editor;

    rerender(
      createElement(CourseDocumentEditor, {
        source: { mode: "document", content: pageDocument("Different artifact") },
        onReady,
      }),
    );

    expect(editor.getText()).toContain("First artifact");
    expect(editor.getText()).not.toContain("Different artifact");
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("uses the latest update observer without replacing mounted document state", async () => {
    const firstOnUpdate = vi.fn();
    const nextOnUpdate = vi.fn();
    const onReady = vi.fn();
    const { rerender } = render(
      createElement(CourseDocumentEditor, {
        source: {
          mode: "document",
          content: pageDocument("First artifact"),
          onUpdate: firstOnUpdate,
        },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0] as Editor;
    firstOnUpdate.mockClear();

    rerender(
      createElement(CourseDocumentEditor, {
        source: {
          mode: "document",
          content: pageDocument("Ignored replacement"),
          onUpdate: nextOnUpdate,
        },
        onReady,
      }),
    );
    editor.commands.insertContent(" fresh callback");

    await waitFor(() => expect(nextOnUpdate).toHaveBeenCalledTimes(1));
    expect(firstOnUpdate).not.toHaveBeenCalled();
    expect(editor.getText()).toContain("First artifact");
    expect(editor.getText()).not.toContain("Ignored replacement");
  });
});

function pageDocument(text: string): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "page",
          surfaceSize: "fluid",
          overflowMode: "grow",
        },
        content: [
          {
            type: "surface",
            attrs: { id: "surface-page", variant: "page-default" },
            content: [{ type: "paragraph", content: [{ type: "text", text }] }],
          },
        ],
      },
    ],
  };
}
