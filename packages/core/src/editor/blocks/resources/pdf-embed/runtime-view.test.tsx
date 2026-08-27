// @vitest-environment happy-dom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { NodeViewProps } from "@tiptap/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createControlBindingRegistry, type ControlEvent } from "@/document/control-binding";

import { PdfEmbedAuthoringView } from "./authoring-view";
import { emptyPdfEmbedData } from "./content";
import { pdfEmbedBlockDefinition } from "./pdf-embed-definition";
import { PdfEmbedRuntimeView } from "./runtime-view";

const learningEventReporter = vi.hoisted(() => ({ report: vi.fn() }));
const pdfRenderConfirmation = vi.hoisted(() => ({
  callbacks: new Map<number, () => void>(),
  errorCallbacks: new Map<number, (error: Error) => void>(),
}));

vi.mock("@/host/providers/ScaffoldServicesProvider", () => ({
  useMediaPort: () => null,
}));
vi.mock("@tiptap/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tiptap/react")>();
  return {
    ...actual,
    useEditorState: ({
      editor,
      selector,
    }: {
      editor: Editor;
      selector: (input: { editor: Editor }) => unknown;
    }) => selector({ editor }),
  };
});
vi.mock("@/runtime/learning-events/LearningEventRuntimeProvider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/runtime/learning-events/LearningEventRuntimeProvider")>();
  return { ...actual, useLearningEventReporter: () => learningEventReporter };
});
vi.mock("@/runtime/renderer/runtime-surface-presentation", () => ({
  resolveOwningRuntimeSurfaceId: () => null,
  useRuntimePresentedSurfaceId: () => undefined,
}));
vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: {} },
  Document({
    children,
    onLoadSuccess,
  }: {
    children: ReactNode;
    onLoadSuccess?: (result: { numPages: number }) => void;
  }) {
    useEffect(() => {
      onLoadSuccess?.({ numPages: 3 });
    }, [onLoadSuccess]);
    return <div>{children}</div>;
  },
  Page({
    onLoadSuccess,
    onRenderError,
    onRenderSuccess,
    pageNumber,
  }: {
    onLoadSuccess?: (result: {
      originalHeight: number;
      originalWidth: number;
      pageNumber: number;
    }) => void;
    onRenderSuccess?: (result: { pageNumber: number }) => void;
    onRenderError?: (error: Error) => void;
    pageNumber: number;
  }) {
    useEffect(() => {
      onLoadSuccess?.({ originalHeight: 800, originalWidth: 600, pageNumber });
      const confirm = () => onRenderSuccess?.({ pageNumber });
      pdfRenderConfirmation.callbacks.set(pageNumber, confirm);
      if (onRenderError) pdfRenderConfirmation.errorCallbacks.set(pageNumber, onRenderError);
      return () => {
        if (pdfRenderConfirmation.callbacks.get(pageNumber) === confirm) {
          pdfRenderConfirmation.callbacks.delete(pageNumber);
        }
        if (pdfRenderConfirmation.errorCallbacks.get(pageNumber) === onRenderError) {
          pdfRenderConfirmation.errorCallbacks.delete(pageNumber);
        }
      };
    }, [onLoadSuccess, onRenderError, onRenderSuccess, pageNumber]);
    return <div>PDF page {pageNumber}</div>;
  },
}));

const OWNER_ID = "pdfEmbedOwn1" as EmbeddedNodeId;

class MockResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element) {
    this.callback([{ target } as ResizeObserverEntry], this);
  }

  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  pdfRenderConfirmation.callbacks.clear();
  pdfRenderConfirmation.errorCallbacks.clear();
  learningEventReporter.report.mockReset();
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(360);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PDF Embed runtime Control lifecycle", () => {
  it("mounts after initial presentation, reports Learning independently and emits learner page changes after render", async () => {
    const user = userEvent.setup();
    const fixture = runtimeFixture(pdfNode("https://example.com/a.pdf"));
    const rendered = render(<PdfEmbedRuntimeView {...fixture.props()} />);

    await waitFor(() => expect(pdfRenderConfirmation.callbacks.get(1)).toBeDefined());
    expect(fixture.registry.get(OWNER_ID)).toBeUndefined();
    expect(learningEventReporter.report).not.toHaveBeenCalled();
    pdfRenderConfirmation.callbacks.get(1)?.();
    const binding = await requireBinding(fixture);
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));
    expect(events).toEqual([]);
    expect(learningEventReporter.report).toHaveBeenCalledWith({
      type: "resource-page.experienced",
      resourceId: OWNER_ID,
      pageNumber: 1,
      pageCount: 3,
    });

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(pdfRenderConfirmation.callbacks.get(2)).toBeDefined());
    expect(events).toEqual([]);
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "page-number" })).toBe(1);
    pdfRenderConfirmation.callbacks.get(2)?.();
    await waitFor(() => {
      expect(events).toEqual([{ targetId: OWNER_ID, type: "page-changed" }]);
    });
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "page-number" })).toBe(2);
    expect(learningEventReporter.report).toHaveBeenCalledWith({
      type: "resource-page.experienced",
      resourceId: OWNER_ID,
      pageNumber: 2,
      pageCount: 3,
    });

    await user.click(screen.getByRole("button", { name: "Previous page" }));
    await waitFor(() => expect(pdfRenderConfirmation.callbacks.get(1)).toBeDefined());
    pdfRenderConfirmation.callbacks.get(1)?.();
    await waitFor(() => {
      expect(events).toEqual([
        { targetId: OWNER_ID, type: "page-changed" },
        { targetId: OWNER_ID, type: "page-changed" },
      ]);
    });
    expect(learningEventReporter.report).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(events).toHaveLength(2);

    rendered.unmount();
    await waitFor(() => expect(fixture.registry.get(OWNER_ID)).toBeUndefined());
    expect(() => binding.stateReader?.read({ targetId: OWNER_ID, key: "page-number" })).toThrow(
      `Control Binding for owner "${OWNER_ID}" is no longer mounted.`,
    );
  });

  it("keeps programmatic navigation silent to Control while preserving experienced-page Learning", async () => {
    const fixture = runtimeFixture(pdfNode("https://example.com/a.pdf"));
    render(<PdfEmbedRuntimeView {...fixture.props()} />);
    await waitFor(() => expect(pdfRenderConfirmation.callbacks.get(1)).toBeDefined());
    pdfRenderConfirmation.callbacks.get(1)?.();
    const binding = await requireBinding(fixture);
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));

    const execution = binding.commandExecutor?.execute({
      targetId: OWNER_ID,
      type: "go-to-page",
      input: 3,
      signal: new AbortController().signal,
    });
    if (!execution) throw new Error("Expected PDF command executor.");
    await waitFor(() => expect(pdfRenderConfirmation.callbacks.get(3)).toBeDefined());
    let settled = false;
    void execution.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    pdfRenderConfirmation.callbacks.get(3)?.();
    expect((await execution).isOk()).toBe(true);
    expect(events).toEqual([]);
    expect(learningEventReporter.report).toHaveBeenCalledWith({
      type: "resource-page.experienced",
      resourceId: OWNER_ID,
      pageNumber: 3,
      pageCount: 3,
    });
  });

  it("returns typed PDF unavailability when an in-flight command page cannot render", async () => {
    const fixture = runtimeFixture(pdfNode("https://example.com/a.pdf"));
    render(<PdfEmbedRuntimeView {...fixture.props()} />);
    await waitFor(() => expect(pdfRenderConfirmation.callbacks.get(1)).toBeDefined());
    pdfRenderConfirmation.callbacks.get(1)?.();
    const binding = await requireBinding(fixture);

    const execution = binding.commandExecutor?.execute({
      targetId: OWNER_ID,
      type: "go-to-page",
      input: 2,
      signal: new AbortController().signal,
    });
    if (!execution) throw new Error("Expected PDF command executor.");
    await waitFor(() => expect(pdfRenderConfirmation.errorCallbacks.get(2)).toBeDefined());
    pdfRenderConfirmation.errorCallbacks.get(2)?.(new Error("render failed"));

    const result = await execution;
    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("Expected typed PDF unavailability.");
    expect(result.error).toEqual({ reason: "pdf-unavailable", requestedPage: 2 });
    await waitFor(() => expect(fixture.registry.get(OWNER_ID)).toBeUndefined());
  });

  it("keeps Control delivery operational when Learning reporting fails", async () => {
    learningEventReporter.report.mockImplementation(() => {
      throw new Error("learning port unavailable");
    });
    const user = userEvent.setup();
    const fixture = runtimeFixture(pdfNode("https://example.com/a.pdf"));
    render(<PdfEmbedRuntimeView {...fixture.props()} />);
    await waitFor(() => expect(pdfRenderConfirmation.callbacks.get(1)).toBeDefined());
    expect(() => pdfRenderConfirmation.callbacks.get(1)?.()).not.toThrow();
    const binding = await requireBinding(fixture);
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(pdfRenderConfirmation.callbacks.get(2)).toBeDefined());
    expect(() => pdfRenderConfirmation.callbacks.get(2)?.()).not.toThrow();
    await waitFor(() => {
      expect(events).toEqual([{ targetId: OWNER_ID, type: "page-changed" }]);
    });
  });

  it("mounts no binding for missing PDF state", async () => {
    const fixture = runtimeFixture(missingPdfNode());
    render(<PdfEmbedRuntimeView {...fixture.props()} />);
    await screen.findByRole("status");
    expect(fixture.registry.get(OWNER_ID)).toBeUndefined();
    expect(learningEventReporter.report).not.toHaveBeenCalled();
  });

  it("mounts no binding for unavailable media or authoring preview", async () => {
    const unavailable = runtimeFixture(managedPdfNode());
    render(<PdfEmbedRuntimeView {...unavailable.props()} />);
    await screen.findByRole("alert");
    expect(unavailable.registry.get(OWNER_ID)).toBeUndefined();
    cleanup();

    const authoring = runtimeFixture(pdfNode("https://example.com/a.pdf"));
    render(<PdfEmbedAuthoringView {...authoring.props()} />);
    await screen.findByText("PDF page 1");
    expect(authoring.registry.get(OWNER_ID)).toBeUndefined();
  });

  it("unmounts during source reconciliation and remounts silently after the replacement renders", async () => {
    const fixture = runtimeFixture(pdfNode("https://example.com/a.pdf"));
    const rendered = render(<PdfEmbedRuntimeView {...fixture.props()} />);
    await waitFor(() => expect(pdfRenderConfirmation.callbacks.get(1)).toBeDefined());
    pdfRenderConfirmation.callbacks.get(1)?.();
    const firstBinding = await requireBinding(fixture);
    const events: ControlEvent[] = [];
    firstBinding.eventSource?.subscribe((event) => events.push(event));

    fixture.setNode(pdfNode("https://example.com/b.pdf", 2));
    rendered.rerender(<PdfEmbedRuntimeView {...fixture.props()} />);
    await waitFor(() => expect(fixture.registry.get(OWNER_ID)).toBeUndefined());
    expect(() =>
      firstBinding.stateReader?.read({ targetId: OWNER_ID, key: "page-number" }),
    ).toThrow(`Control Binding for owner "${OWNER_ID}" is no longer mounted.`);
    await waitFor(() => expect(pdfRenderConfirmation.callbacks.get(2)).toBeDefined());
    pdfRenderConfirmation.callbacks.get(2)?.();
    const replacement = await requireBinding(fixture);

    expect(replacement.stateReader?.read({ targetId: OWNER_ID, key: "page-number" })).toBe(2);
    expect(events).toEqual([]);
    expect(learningEventReporter.report).toHaveBeenCalledWith({
      type: "resource-page.experienced",
      resourceId: OWNER_ID,
      pageNumber: 2,
      pageCount: 3,
    });
  });
});

async function requireBinding(fixture: ReturnType<typeof runtimeFixture>) {
  await waitFor(() => expect(fixture.registry.get(OWNER_ID)).toBeDefined());
  const binding = fixture.registry.get(OWNER_ID);
  if (!binding) throw new Error("Expected mounted PDF binding.");
  return binding;
}

function runtimeFixture(initialNode: ProseMirrorNode) {
  const registry = createControlBindingRegistry({
    requireOwnerControlDefinition: () => pdfEmbedBlockDefinition.control!,
    requireOwnedTargetCapabilities: (ownerId, targetId) => {
      if (ownerId !== OWNER_ID || targetId !== OWNER_ID) throw new Error("foreign PDF target");
      return pdfEmbedBlockDefinition.control!.owner!;
    },
  });
  let node = initialNode;
  const editor = {
    isEditable: false,
    storage: { controlBindingRegistryStorage: { getRegistry: () => registry } },
    state: { doc: { nodeAt: () => node } },
  } as unknown as Editor;
  return {
    registry,
    props: () => ({ editor, getPos: () => 4, node }) as unknown as NodeViewProps,
    setNode(nextNode: ProseMirrorNode) {
      node = nextNode;
    },
  };
}

function pdfNode(src: string, initialPage = 1): ProseMirrorNode {
  return {
    type: { name: "pdf_embed" },
    attrs: {
      id: OWNER_ID,
      data: emptyPdfEmbedData({ source: { mode: "external", src }, initialPage }),
    },
  } as unknown as ProseMirrorNode;
}

function missingPdfNode(): ProseMirrorNode {
  return {
    type: { name: "pdf_embed" },
    attrs: { id: OWNER_ID, data: emptyPdfEmbedData() },
  } as unknown as ProseMirrorNode;
}

function managedPdfNode(): ProseMirrorNode {
  return {
    type: { name: "pdf_embed" },
    attrs: {
      id: OWNER_ID,
      data: emptyPdfEmbedData({ source: { mode: "managed", mediaId: "missing-pdf" } }),
    },
  } as unknown as ProseMirrorNode;
}
