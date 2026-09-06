// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { describe, expect, it, vi } from "vite-plus/test";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import { useAuthoringDocument } from "./use-authoring-document";

const initialContent: JSONContent = {
  type: "doc",
  content: [{ type: "courseDocument", attrs: { theme: { schemaVersion: 1 } } }],
};

function renderDocument() {
  return renderHook(() =>
    useAuthoringDocument({
      source: "artifact-document-binding",
      artifact: {
        id: "artifact-document-binding",
        title: "Draft",
        mode: "page",
        content: initialContent,
      },
    }),
  );
}

function finishHydration(binding: ReturnType<typeof renderDocument>["result"]["current"]): void {
  let completeFrame: FrameRequestCallback | undefined;
  const requestFrame = vi
    .spyOn(globalThis, "requestAnimationFrame")
    .mockImplementation((callback) => {
      completeFrame = callback;
      return 1;
    });
  binding.setEditor({
    state: { doc: { firstChild: { attrs: {} } } },
  } as unknown as TiptapEditor);
  completeFrame?.(0);
  requestFrame.mockRestore();
}

describe("useAuthoringDocument", () => {
  it("starts at revision zero and does not treat identical hydration as an edit", () => {
    const { result } = renderDocument();

    act(() => result.current.acceptCanonicalUpdate(structuredClone(initialContent), {}));

    expect(result.current.getSnapshot()).toMatchObject({
      status: "valid",
      snapshot: { revision: 0 },
    });
  });

  it("reuses the accepted snapshot when the canonical editor source is unchanged", () => {
    const { result } = renderDocument();
    act(() => finishHydration(result.current));
    const sourceDocument = {};
    const changedContent = pageContent("Canonical edit");
    act(() => result.current.acceptCanonicalUpdate(changedContent, sourceDocument));
    const accepted = result.current.getSnapshot();
    const listener = vi.fn();
    const unsubscribe = result.current.subscribe(listener);

    act(() =>
      result.current.acceptCanonicalUpdate(structuredClone(changedContent), sourceDocument),
    );

    expect(listener).not.toHaveBeenCalled();
    expect(result.current.getSnapshot()).toBe(accepted);
    unsubscribe();
  });

  it("accepts editor hydration changes without scheduling an authored revision", () => {
    const { result } = renderDocument();
    const hydratedContent: JSONContent = {
      ...structuredClone(initialContent),
      attrs: { hydrated: true },
    };
    let completeFrame: FrameRequestCallback | undefined;
    const requestFrame = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((callback) => {
        completeFrame = callback;
        return 1;
      });

    act(() => {
      result.current.setEditor({
        state: { doc: { firstChild: { attrs: {} } } },
      } as unknown as TiptapEditor);
      result.current.acceptCanonicalUpdate(hydratedContent, {});
    });
    expect(result.current.getSnapshot()).toMatchObject({
      status: "valid",
      snapshot: { revision: 0, artifact: { content: { attrs: { hydrated: true } } } },
    });

    act(() => {
      completeFrame?.(0);
      result.current.acceptCanonicalUpdate(
        { ...hydratedContent, attrs: { hydrated: false } },
        {},
      );
    });
    requestFrame.mockRestore();

    expect(result.current.getSnapshot()).toMatchObject({
      status: "valid",
      snapshot: { revision: 1 },
    });
  });

  it("captures immutable canonical content and normalised authored metadata", () => {
    const { result } = renderDocument();
    const content = structuredClone(initialContent);
    content.content?.push({ type: "paragraph", content: [{ type: "text", text: "Changed" }] });

    act(() => {
      finishHydration(result.current);
      result.current.acceptCanonicalUpdate(content, {});
      result.current.setTitle("   ");
    });
    const captured = result.current.capture();
    content.content?.push({ type: "paragraph" });

    expect(captured.isOk()).toBe(true);
    if (captured.isErr()) throw new Error("expected a valid document capture");
    expect(captured.value.revision).toBe(2);
    expect(captured.value.artifact.title).toBe("Untitled");
    expect(captured.value.artifact.content.content).toHaveLength(2);
    expect(result.current.title).toBe("Untitled");
  });

  it("reuses the owned content snapshot for title-only authored changes", () => {
    const { result } = renderDocument();
    act(() => finishHydration(result.current));
    const before = result.current.getSnapshot();
    if (before.status === "invalid") throw new Error("expected valid document state");

    act(() => result.current.setTitle("Renamed draft"));

    const after = result.current.getSnapshot();
    if (after.status === "invalid") throw new Error("expected valid document state");
    expect(after.snapshot.revision).toBe(before.snapshot.revision + 1);
    expect(after.snapshot.artifact.content).toBe(before.snapshot.artifact.content);
  });

  it("applies a current saved-title acknowledgement without an authored revision", () => {
    const { result } = renderDocument();
    act(() => finishHydration(result.current));
    act(() => result.current.setTitle("Authored title"));
    const authored = result.current.getSnapshot();
    if (authored.status === "invalid") throw new Error("expected valid document state");

    act(() => result.current.acknowledgeSavedTitle(authored.snapshot.revision, "Persisted title"));

    const acknowledged = result.current.getSnapshot();
    if (acknowledged.status === "invalid") throw new Error("expected valid document state");
    expect(acknowledged.snapshot.revision).toBe(authored.snapshot.revision);
    expect(acknowledged.snapshot.artifact.title).toBe("Persisted title");
    expect(acknowledged.snapshot.artifact.content).toBe(authored.snapshot.artifact.content);
    expect(result.current.title).toBe("Persisted title");
    const captured = result.current.capture();
    if (captured.isErr()) throw new Error("expected valid document capture");
    expect(captured.value.artifact.title).toBe("Persisted title");
  });

  it("ignores a saved-title acknowledgement after a newer authored change", () => {
    const { result } = renderDocument();
    act(() => finishHydration(result.current));
    act(() => result.current.setTitle("First edit"));
    const first = result.current.getSnapshot();
    if (first.status === "invalid") throw new Error("expected valid document state");

    act(() => {
      result.current.setTitle("Newer edit");
      result.current.acknowledgeSavedTitle(first.snapshot.revision, "Stale persisted title");
    });

    const current = result.current.getSnapshot();
    expect(current).toMatchObject({
      status: "valid",
      snapshot: { revision: first.snapshot.revision + 1, artifact: { title: "Newer edit" } },
    });
    expect(result.current.title).toBe("Newer edit");
  });

  it("owns editor/theme integration without advancing authored revision", () => {
    const { result } = renderDocument();
    const theme = createDefaultPersistedCourseTheme();
    const editor = {
      state: { doc: { firstChild: { attrs: { theme } } } },
    } as unknown as TiptapEditor;

    act(() => result.current.setEditor(editor));

    expect(result.current.editor).toBe(editor);
    expect(result.current.theme).toEqual(theme);
    expect(result.current.getSnapshot()).toMatchObject({
      status: "valid",
      snapshot: { revision: 0 },
    });
  });

  it("does not emit or replace content for an unchanged editor and theme", () => {
    const { result } = renderDocument();
    const theme = createDefaultPersistedCourseTheme();
    const editor = {
      state: { doc: { firstChild: { attrs: { theme } } } },
    } as unknown as TiptapEditor;
    act(() => result.current.setEditor(editor));
    const before = result.current.getSnapshot();
    if (before.status === "invalid") throw new Error("expected valid document state");
    const listener = vi.fn();
    const unsubscribe = result.current.subscribe(listener);

    act(() => {
      result.current.setEditor(editor);
      result.current.setEditor(editor);
    });

    const after = result.current.getSnapshot();
    if (after.status === "invalid") throw new Error("expected valid document state");
    expect(listener).not.toHaveBeenCalled();
    expect(after).toBe(before);
    expect(after.snapshot.artifact.content).toBe(before.snapshot.artifact.content);
    unsubscribe();
  });

  it("isolates one owned content snapshot per canonical content change", () => {
    const { result } = renderDocument();
    act(() => finishHydration(result.current));
    const firstContent = pageContent("First owned value");

    act(() => result.current.acceptCanonicalUpdate(firstContent, {}));
    const firstState = result.current.getSnapshot();
    if (firstState.status === "invalid") throw new Error("expected valid document state");
    const firstCapture = result.current.capture();
    if (firstCapture.isErr()) throw new Error("expected valid document capture");
    firstContent.content?.push({ type: "paragraph", content: [{ type: "text", text: "Mutated" }] });

    const secondContent = pageContent("Second owned value");
    act(() => result.current.acceptCanonicalUpdate(secondContent, {}));
    secondContent.content?.push({ type: "paragraph" });

    expect(firstState.snapshot.artifact.content.content).toHaveLength(2);
    expect(firstCapture.value.artifact.content.content).toHaveLength(2);
    expect(firstCapture.value.artifact.content.content?.[1]).toMatchObject({
      content: [{ text: "First owned value" }],
    });
    const secondState = result.current.getSnapshot();
    if (secondState.status === "invalid") throw new Error("expected valid document state");
    expect(secondState.snapshot.artifact.content.content).toHaveLength(2);
    expect(secondState.snapshot.artifact.content).not.toBe(firstState.snapshot.artifact.content);
    expect(Object.isFrozen(secondState.snapshot.artifact.content)).toBe(true);
  });

  it("increments once for invalidation and recovers only through a canonical update", () => {
    const { result } = renderDocument();
    const failure = { status: "canonicalization-failed" as const, issues: [] };

    act(() => {
      finishHydration(result.current);
      result.current.reportDocumentError(failure);
    });
    expect(result.current.capture().isErr()).toBe(true);
    expect(result.current.getSnapshot()).toEqual({ status: "invalid", revision: 1, failure });

    act(() => result.current.reportDocumentError(failure));
    expect(result.current.getSnapshot()).toMatchObject({ revision: 1 });

    act(() => result.current.acceptCanonicalUpdate(initialContent, {}));
    expect(result.current.getSnapshot()).toMatchObject({
      status: "valid",
      snapshot: { revision: 2 },
    });
  });

  it("starts a new revision sequence when the document source is replaced", () => {
    const firstArtifact = {
      id: "first",
      title: "First",
      mode: "page" as const,
      content: initialContent,
    };
    const secondArtifact = { ...firstArtifact, id: "second", title: "Second" };
    const { result, rerender } = renderHook(
      ({ source, artifact }) => useAuthoringDocument({ source, artifact }),
      { initialProps: { source: "first", artifact: firstArtifact } },
    );
    act(() => result.current.setTitle("Changed first"));
    expect(result.current.getSnapshot()).toMatchObject({ snapshot: { revision: 1 } });

    rerender({ source: "second", artifact: secondArtifact });

    expect(result.current.title).toBe("Second");
    expect(result.current.getSnapshot()).toMatchObject({
      status: "valid",
      snapshot: { revision: 0, artifact: { id: "second" } },
    });
  });
});

function pageContent(text: string): JSONContent {
  return {
    ...structuredClone(initialContent),
    content: [
      ...(structuredClone(initialContent.content) ?? []),
      { type: "paragraph", content: [{ type: "text", text }] },
    ],
  };
}
