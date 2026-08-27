// @vitest-environment happy-dom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createControlBindingRegistry, type ControlEvent } from "@/document/control-binding";

import { pdfEmbedBlockDefinition } from "./pdf-embed-definition";
import {
  createPdfEmbedControlBinding,
  usePdfEmbedControlBinding,
} from "./pdf-embed-control-binding";
import { createPdfEmbedRuntimeController } from "./pdf-embed-runtime-controller";

const OWNER_ID = "pdfEmbedOwn1" as EmbeddedNodeId;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PDF Embed Control Binding", () => {
  it("reads the successfully presented page and emits only learner-caused page changes", async () => {
    const controller = readyController(3, 1);
    const registry = pdfRegistry();
    registry.register(
      createPdfEmbedControlBinding({
        controller,
        ownerId: OWNER_ID,
        requireMounted: () => undefined,
      }),
    );
    const binding = requireBinding(registry.get(OWNER_ID));
    const events: ControlEvent[] = [];
    const statesAtEvent: unknown[] = [];
    binding.eventSource?.subscribe((event) => {
      events.push(event);
      statesAtEvent.push({
        pageNumber: binding.stateReader?.read({ targetId: OWNER_ID, key: "page-number" }),
        lastPage: binding.stateReader?.read({ targetId: OWNER_ID, key: "last-page" }),
      });
    });

    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "page-number" })).toBe(1);
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "last-page" })).toBe(false);

    const learner = controller.navigateTo(2, "learner", new AbortController().signal);
    expect(events).toEqual([]);
    controller.present(2);
    await learner;
    const programmatic = controller.navigateTo(3, "control-command", new AbortController().signal);
    controller.present(3);
    await programmatic;

    expect(events).toEqual([{ targetId: OWNER_ID, type: "page-changed" }]);
    expect(statesAtEvent).toEqual([{ pageNumber: 2, lastPage: false }]);
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "page-number" })).toBe(3);
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "last-page" })).toBe(true);
  });

  it("executes render-confirmed silent navigation and preserves every expected failure", async () => {
    const controller = readyController(3, 1);
    const registry = pdfRegistry();
    registry.register(
      createPdfEmbedControlBinding({
        controller,
        ownerId: OWNER_ID,
        requireMounted: () => undefined,
      }),
    );
    const binding = requireBinding(registry.get(OWNER_ID));
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));
    const executor = binding.commandExecutor!;

    const goToPage = executor.execute(command(2));
    controller.present(2);
    expect((await goToPage).isOk()).toBe(true);
    expect(events).toEqual([]);
    expect((await executor.execute(command(2))).isOk()).toBe(true);

    const outside = await executor.execute(command(4));
    expect(outside.isErr()).toBe(true);
    if (outside.isOk()) throw new Error("Expected page range failure.");
    expect(outside.error).toEqual({
      reason: "page-out-of-range",
      requestedPage: 4,
      pageCount: 3,
    });

    const preAborted = new AbortController();
    preAborted.abort();
    const cancelled = await executor.execute(command(1, preAborted));
    expect(cancelled.isErr()).toBe(true);
    if (cancelled.isOk()) throw new Error("Expected cancelled PDF navigation.");
    expect(cancelled.error).toEqual({ reason: "cancelled" });

    const unavailableNavigation = executor.execute(command(1));
    controller.fail();
    const unavailable = await unavailableNavigation;
    expect(unavailable.isErr()).toBe(true);
    if (unavailable.isOk()) throw new Error("Expected unavailable PDF.");
    expect(unavailable.error).toEqual({ reason: "pdf-unavailable", requestedPage: 1 });
  });

  it("mounts only while ready, survives node revisions and unregisters on teardown", async () => {
    const controller = readyController(2, 1);
    const registry = pdfRegistry();
    let liveNode = pdfNode();
    const editor = {
      storage: { controlBindingRegistryStorage: { getRegistry: () => registry } },
      state: { doc: { nodeAt: () => liveNode } },
    } as unknown as Editor;
    const rendered = render(
      <PdfBindingHost
        controller={controller}
        editor={editor}
        enabled={false}
        getPos={() => 4}
        node={liveNode}
      />,
    );
    expect(registry.get(OWNER_ID)).toBeUndefined();

    rendered.rerender(
      <PdfBindingHost
        controller={controller}
        editor={editor}
        enabled
        getPos={() => 4}
        node={liveNode}
      />,
    );
    await waitFor(() => expect(registry.get(OWNER_ID)).toBeDefined());
    const binding = requireBinding(registry.get(OWNER_ID));
    liveNode = pdfNode();
    rendered.rerender(
      <PdfBindingHost
        controller={controller}
        editor={editor}
        enabled
        getPos={() => 4}
        node={liveNode}
      />,
    );
    expect(registry.get(OWNER_ID)).toBe(binding);
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "page-number" })).toBe(1);

    liveNode = { type: { name: "paragraph" }, attrs: {} } as unknown as ProseMirrorNode;
    expect(() => binding.stateReader?.read({ targetId: OWNER_ID, key: "page-number" })).toThrow(
      `PDF Control Binding owner "${OWNER_ID}" is no longer mounted.`,
    );
    rendered.unmount();
    await waitFor(() => expect(registry.get(OWNER_ID)).toBeUndefined());
    expect(() => binding.stateReader?.read({ targetId: OWNER_ID, key: "page-number" })).toThrow(
      `Control Binding for owner "${OWNER_ID}" is no longer mounted.`,
    );
  });
});

function PdfBindingHost({
  controller,
  editor,
  enabled,
  getPos,
  node,
}: Omit<Parameters<typeof usePdfEmbedControlBinding>[0], "ownerId">) {
  usePdfEmbedControlBinding({ controller, editor, enabled, getPos, node, ownerId: OWNER_ID });
  return null;
}

function readyController(pageCount: number, presentedPage: number) {
  const controller = createPdfEmbedRuntimeController();
  controller.attachRequestPage(vi.fn());
  controller.load(pageCount);
  controller.present(presentedPage);
  return controller;
}

function pdfNode(): ProseMirrorNode {
  return {
    type: { name: "pdf_embed" },
    attrs: { id: OWNER_ID },
  } as unknown as ProseMirrorNode;
}

function pdfRegistry() {
  return createControlBindingRegistry({
    requireOwnerControlDefinition: (ownerId) => {
      if (ownerId !== OWNER_ID || !pdfEmbedBlockDefinition.control) {
        throw new Error(`Unknown PDF owner "${ownerId}".`);
      }
      return pdfEmbedBlockDefinition.control;
    },
    requireOwnedTargetCapabilities: (ownerId, targetId) => {
      if (
        ownerId !== OWNER_ID ||
        targetId !== OWNER_ID ||
        !pdfEmbedBlockDefinition.control?.owner
      ) {
        throw new Error(`Control target "${targetId}" does not belong to owner "${ownerId}".`);
      }
      return pdfEmbedBlockDefinition.control.owner;
    },
  });
}

function requireBinding(binding: ReturnType<ReturnType<typeof pdfRegistry>["get"]>) {
  if (!binding) throw new Error("Expected mounted PDF Control Binding.");
  return binding;
}

function command(pageNumber: number, abort?: AbortController) {
  return {
    targetId: OWNER_ID,
    type: "go-to-page",
    input: pageNumber,
    signal: abort?.signal ?? new AbortController().signal,
  };
}
