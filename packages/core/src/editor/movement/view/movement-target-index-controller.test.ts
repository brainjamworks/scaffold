// @vitest-environment happy-dom

import type { EditorView } from "@tiptap/pm/view";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createClientRectSnapshot } from "@/editor/interactions/drag/model/coordinate-space";
import type { FrameScheduler } from "@/editor/interactions/drag/dom/frame-coalescer";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

import type { MovementNodeContext } from "../model/movement-policy";
import { MoveContainedAfterTarget } from "../model/movement-intents";
import type { MovementTargetDescriptor, MovementTargetEntry } from "./movement-target-index";
import { createMovementTargetIndexController } from "./movement-target-index-controller";

class TestFrameScheduler implements FrameScheduler {
  private callbacks = new Map<number, FrameRequestCallback>();
  private nextId = 1;
  readonly cancelFrame = vi.fn((id: number) => {
    this.callbacks.delete(id);
  });

  requestFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  });

  flush(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback(performance.now());
  }

  get pending(): number {
    return this.callbacks.size;
  }
}

function context(pos: number, id: string): MovementNodeContext {
  return {
    ancestors: [],
    index: pos,
    node: { attrs: { id }, nodeSize: 1 } as unknown as MovementNodeContext["node"],
    nodeType: { name: "test_block" } as MovementNodeContext["nodeType"],
    parent: {} as MovementNodeContext["parent"],
    parentPos: 1,
    parentType: { name: "surface" } as MovementNodeContext["parentType"],
    pos,
  };
}

function descriptor(pos: number, id: string, element = document.createElement("div")) {
  return {
    axis: "vertical",
    context: context(pos, id),
    documentPosition: pos,
    element,
    key: `structure:test_block:${pos}:${id}`,
    kind: "structure",
  } as const satisfies MovementTargetDescriptor;
}

function containedDescriptor(
  context: MovementNodeContext,
  element = document.createElement("div"),
): MovementTargetDescriptor {
  return {
    axis: "horizontal",
    context,
    documentPosition: context.pos,
    element,
    key: `contained:${context.nodeType.name}:${context.pos}:${String(context.node.attrs["id"])}`,
    kind: "contained",
  };
}

function entry(
  target: MovementTargetDescriptor,
  top: number,
  scrollAncestor?: Element,
): MovementTargetEntry {
  return {
    descriptor: target,
    rect: {
      measuredRect: createClientRectSnapshot(20, top, 200, 80)!,
      scrollAncestors: scrollAncestor
        ? [{ element: scrollAncestor, measuredX: 0, measuredY: 0 }]
        : [],
    },
  };
}

function controllerOptions(
  options: Partial<Parameters<typeof createMovementTargetIndexController>[0]> = {},
) {
  const source = context(1, "source");
  const target = descriptor(2, "target");
  return {
    blockDefinitions: {} as BlockDefinitionLookup,
    discoverDescriptors: ({ documentRevision }: { documentRevision: number }) => ({
      descriptors: [target],
      documentRevision,
    }),
    frameScheduler: new TestFrameScheduler(),
    measureEntries: () => [entry(target, 20)],
    onCandidateChange: vi.fn(),
    ownerDocument: document,
    resolveSource: () => ({ context: source, kind: "structure" as const }),
    view: {} as EditorView,
    ...options,
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("movement target index controller", () => {
  it("discovers on start and coalesces geometry work to one batch per frame", () => {
    const discover = vi.fn(({ documentRevision }: { documentRevision: number }) => ({
      descriptors: [descriptor(2, "target")],
      documentRevision,
    }));
    const measure = vi.fn((descriptors: readonly MovementTargetDescriptor[]) => [
      entry(descriptors[0]!, 20),
    ]);
    const scheduler = new TestFrameScheduler();
    const onCandidateChange = vi.fn();
    const controller = createMovementTargetIndexController(
      controllerOptions({
        discoverDescriptors: discover,
        frameScheduler: scheduler,
        measureEntries: measure,
        onCandidateChange,
      }),
    );

    controller.start({ space: "client", x: 100, y: 70 });
    controller.invalidate("layout");
    controller.invalidate("resize");

    expect(discover).toHaveBeenCalledTimes(1);
    expect(measure).not.toHaveBeenCalled();
    expect(scheduler.pending).toBe(1);

    scheduler.flush();

    expect(measure).toHaveBeenCalledTimes(1);
    expect(onCandidateChange).toHaveBeenCalledTimes(1);
    expect(controller.getCandidate()?.target.pos).toBe(2);
    controller.dispose();
  });

  it("keeps pointer updates pure after the initial measurement", () => {
    const measure = vi.fn((descriptors: readonly MovementTargetDescriptor[]) => [
      entry(descriptors[0]!, 20),
    ]);
    const scheduler = new TestFrameScheduler();
    const controller = createMovementTargetIndexController(
      controllerOptions({ frameScheduler: scheduler, measureEntries: measure }),
    );
    controller.start({ space: "client", x: 100, y: 70 });
    scheduler.flush();

    for (let index = 0; index < 20; index += 1) {
      controller.updatePoint({ space: "client", x: 100 + index, y: 70 });
    }

    expect(measure).toHaveBeenCalledTimes(1);
    expect(controller.getCandidate()?.target.pos).toBe(2);
    controller.dispose();
  });

  it("preserves a keyboard destination while its presentation geometry is remeasured", () => {
    const parent = { childCount: 3 } as MovementNodeContext["parent"];
    const source = { ...context(1, "source"), index: 0, parent };
    const targetContext = { ...context(2, "target"), index: 1, parent };
    const target = containedDescriptor(targetContext);
    document.body.append(target.element);
    vi.spyOn(target.element, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ height: 80, width: 200, x: 20, y: 20 }),
    );
    const scheduler = new TestFrameScheduler();
    const controller = createMovementTargetIndexController(
      controllerOptions({
        discoverDescriptors: ({ documentRevision }) => ({
          descriptors: [target],
          documentRevision,
        }),
        frameScheduler: scheduler,
        measureEntries: () => [entry(target, 20)],
        resolveSource: () => ({ context: source, kind: "contained" as const }),
      }),
    );

    controller.start(null);
    const navigation = controller.moveKeyboard("forward");

    expect(navigation).toMatchObject({ changed: true, destinationIndex: 1, total: 3 });
    expect(navigation?.candidate?.intent).toBeInstanceOf(MoveContainedAfterTarget);
    expect(controller.getCandidate()?.target.pos).toBe(2);

    controller.invalidate("resize");
    scheduler.flush();

    expect(controller.getCandidate()?.target.pos).toBe(2);
    expect(controller.getCandidate()?.target.axis).toBe("horizontal");
    controller.dispose();
  });

  it("navigates owner-enabled contained targets spatially across parents", () => {
    const sourceParent = { childCount: 2 } as MovementNodeContext["parent"];
    const targetParent = { childCount: 2 } as MovementNodeContext["parent"];
    const source = { ...context(1, "source"), index: 0, parent: sourceParent, parentPos: 5 };
    const belowContext = {
      ...context(2, "below"),
      index: 1,
      parent: sourceParent,
      parentPos: 5,
    };
    const rightContext = {
      ...context(3, "right"),
      index: 0,
      parent: targetParent,
      parentPos: 50,
    };
    const below = containedDescriptor(belowContext);
    const right = containedDescriptor(rightContext);
    document.body.append(below.element, right.element);
    vi.spyOn(below.element, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ height: 60, width: 120, x: 20, y: 120 }),
    );
    vi.spyOn(right.element, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ height: 60, width: 120, x: 220, y: 20 }),
    );
    const canNavigateContainedKeyboard = vi.fn(
      (
        _source: MovementNodeContext,
        current: MovementNodeContext,
        target: MovementNodeContext,
        direction: "down" | "left" | "right" | "up",
      ) =>
        direction === "up" || direction === "down"
          ? current.parentPos === target.parentPos
          : current.parentPos !== target.parentPos,
    );
    const controller = createMovementTargetIndexController(
      controllerOptions({
        canNavigateContainedKeyboard,
        discoverDescriptors: ({ documentRevision }) => ({
          descriptors: [below, right],
          documentRevision,
        }),
        measureEntries: () => [
          {
            ...entry(below, 120),
            rect: {
              measuredRect: createClientRectSnapshot(20, 120, 120, 60)!,
              scrollAncestors: [],
            },
          },
          {
            ...entry(right, 20),
            rect: {
              measuredRect: createClientRectSnapshot(220, 20, 120, 60)!,
              scrollAncestors: [],
            },
          },
        ],
        resolveKeyboardOrigin: () => ({ x: 80, y: 50 }),
        resolveSource: () => ({ context: source, kind: "contained" as const }),
      }),
    );

    controller.start(null);

    expect(controller.moveKeyboardSpatial("down")?.candidate?.target.pos).toBe(2);
    expect(controller.moveKeyboardSpatial("right")?.candidate?.target.pos).toBe(3);
    expect(canNavigateContainedKeyboard).toHaveBeenCalled();
    controller.dispose();
  });

  it("re-queries a stationary pointer from tracked scroll offsets", () => {
    const scroller = document.createElement("div");
    document.body.append(scroller);
    const first = descriptor(2, "first", document.createElement("div"));
    const second = descriptor(3, "second", document.createElement("div"));
    scroller.append(first.element, second.element);
    const scheduler = new TestFrameScheduler();
    const measure = vi.fn(() => [entry(first, 20, scroller), entry(second, 120, scroller)]);
    const onCandidateChange = vi.fn();
    const controller = createMovementTargetIndexController(
      controllerOptions({
        discoverDescriptors: ({ documentRevision }) => ({
          descriptors: [first, second],
          documentRevision,
        }),
        frameScheduler: scheduler,
        measureEntries: measure,
        onCandidateChange,
      }),
    );
    controller.start({ space: "client", x: 100, y: 50 });
    scheduler.flush();
    expect(controller.getCandidate()?.target.pos).toBe(2);

    scroller.scrollTop = 100;
    scroller.dispatchEvent(new Event("scroll"));
    expect(controller.getCandidate()?.target.pos).toBe(2);
    scheduler.flush();

    expect(controller.getCandidate()?.target.pos).toBe(3);
    expect(measure).toHaveBeenCalledTimes(1);
    expect(onCandidateChange).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it("publishes fresh presentation geometry for the same target after stationary scroll", () => {
    const scroller = document.createElement("div");
    const target = descriptor(2, "target", document.createElement("div"));
    scroller.append(target.element);
    document.body.append(scroller);
    const scheduler = new TestFrameScheduler();
    const onCandidateChange = vi.fn();
    const controller = createMovementTargetIndexController(
      controllerOptions({
        discoverDescriptors: ({ documentRevision }) => ({
          descriptors: [target],
          documentRevision,
        }),
        frameScheduler: scheduler,
        measureEntries: () => [entry(target, 20, scroller)],
        onCandidateChange,
      }),
    );
    controller.start({ space: "client", x: 100, y: 50 });
    scheduler.flush();
    expect(controller.getCandidate()?.target.rect.top).toBe(20);

    scroller.scrollTop = 4;
    scroller.dispatchEvent(new Event("scroll"));
    scheduler.flush();

    expect(controller.getCandidate()?.key).toBe(target.key);
    expect(controller.getCandidate()?.target.rect.top).toBe(16);
    expect(onCandidateChange).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it("publishes fresh presentation geometry for the same target after resize", () => {
    const target = descriptor(2, "target");
    const scheduler = new TestFrameScheduler();
    let top = 20;
    const onCandidateChange = vi.fn();
    const controller = createMovementTargetIndexController(
      controllerOptions({
        discoverDescriptors: ({ documentRevision }) => ({
          descriptors: [target],
          documentRevision,
        }),
        frameScheduler: scheduler,
        measureEntries: () => [entry(target, top)],
        onCandidateChange,
      }),
    );
    controller.start({ space: "client", x: 100, y: 70 });
    scheduler.flush();

    top = 24;
    controller.invalidate("resize");
    scheduler.flush();

    expect(onCandidateChange).toHaveBeenCalledTimes(2);
    expect(controller.getCandidate()?.key).toBe(target.key);
    expect(controller.getCandidate()?.target.rect.top).toBe(24);
    controller.dispose();
  });

  it("does not publish when semantic intent and presentation geometry are unchanged", () => {
    const target = descriptor(2, "target");
    const scheduler = new TestFrameScheduler();
    const onCandidateChange = vi.fn();
    const controller = createMovementTargetIndexController(
      controllerOptions({
        discoverDescriptors: ({ documentRevision }) => ({
          descriptors: [target],
          documentRevision,
        }),
        frameScheduler: scheduler,
        measureEntries: () => [entry(target, 20)],
        onCandidateChange,
      }),
    );
    controller.start({ space: "client", x: 100, y: 70 });
    scheduler.flush();

    controller.invalidate("resize");
    scheduler.flush();

    expect(onCandidateChange).toHaveBeenCalledTimes(1);
    expect(controller.getCandidate()?.target.rect.top).toBe(20);
    controller.dispose();
  });

  it("samples scroll offsets synchronously when drop precedes the scroll event", () => {
    const scroller = document.createElement("div");
    const first = descriptor(2, "first", document.createElement("div"));
    const second = descriptor(3, "second", document.createElement("div"));
    scroller.append(first.element, second.element);
    document.body.append(scroller);
    const scheduler = new TestFrameScheduler();
    const measure = vi.fn(() => [entry(first, 20, scroller), entry(second, 120, scroller)]);
    const controller = createMovementTargetIndexController(
      controllerOptions({
        discoverDescriptors: ({ documentRevision }) => ({
          descriptors: [first, second],
          documentRevision,
        }),
        frameScheduler: scheduler,
        measureEntries: measure,
      }),
    );
    controller.start({ space: "client", x: 100, y: 50 });
    scheduler.flush();
    expect(controller.getCandidate()?.target.pos).toBe(2);

    scroller.scrollTop = 100;
    const dropCandidate = controller.revalidate();

    expect(dropCandidate?.target.pos).toBe(3);
    expect(measure).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toBe(0);
    controller.dispose();
  });

  it("uses delivered scroll offsets during synchronous drop revalidation", () => {
    const scroller = document.createElement("div");
    const first = descriptor(2, "first", document.createElement("div"));
    const second = descriptor(3, "second", document.createElement("div"));
    scroller.append(first.element, second.element);
    document.body.append(scroller);
    const scheduler = new TestFrameScheduler();
    const measure = vi.fn(() => [entry(first, 20, scroller), entry(second, 120, scroller)]);
    const controller = createMovementTargetIndexController(
      controllerOptions({
        discoverDescriptors: ({ documentRevision }) => ({
          descriptors: [first, second],
          documentRevision,
        }),
        frameScheduler: scheduler,
        measureEntries: measure,
      }),
    );
    controller.start({ space: "client", x: 100, y: 50 });
    scheduler.flush();

    scroller.scrollTop = 100;
    scroller.dispatchEvent(new Event("scroll"));
    const dropCandidate = controller.revalidate();

    expect(dropCandidate?.target.pos).toBe(3);
    expect(measure).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toBe(0);
    controller.dispose();
  });

  it("revalidates a pending structural revision synchronously at drop", () => {
    const first = descriptor(2, "first");
    const second = descriptor(3, "second");
    document.body.append(first.element, second.element);
    const scheduler = new TestFrameScheduler();
    let structuralListener: () => void = () => undefined;
    let current = first;
    const revisions: number[] = [];
    const controller = createMovementTargetIndexController(
      controllerOptions({
        discoverDescriptors: ({ documentRevision }) => {
          revisions.push(documentRevision);
          return { descriptors: [current], documentRevision };
        },
        frameScheduler: scheduler,
        measureEntries: (descriptors) => [entry(descriptors[0]!, 20)],
        subscribeDocumentStructure: (listener) => {
          structuralListener = listener;
          return vi.fn();
        },
      }),
    );
    controller.start({ space: "client", x: 100, y: 70 });
    scheduler.flush();

    current = second;
    structuralListener();
    const dropCandidate = controller.revalidate({ space: "client", x: 100, y: 70 });

    expect(revisions).toEqual([0, 1]);
    expect(dropCandidate?.target.pos).toBe(3);
    expect(scheduler.pending).toBe(0);
    controller.dispose();
  });

  it("cancels revalidation when the source or environment is stale", () => {
    const scheduler = new TestFrameScheduler();
    let sourceLive = true;
    let environmentLive = true;
    const onCancel = vi.fn();
    const source = context(1, "source");
    const controller = createMovementTargetIndexController(
      controllerOptions({
        frameScheduler: scheduler,
        isEnvironmentValid: () => environmentLive,
        onCancel,
        resolveSource: () => (sourceLive ? { context: source, kind: "structure" as const } : null),
      }),
    );
    controller.start({ space: "client", x: 100, y: 70 });
    scheduler.flush();

    sourceLive = false;
    expect(controller.revalidate()).toBeNull();
    expect(onCancel).toHaveBeenCalledWith("source-removed");

    const second = createMovementTargetIndexController(
      controllerOptions({
        frameScheduler: new TestFrameScheduler(),
        isEnvironmentValid: () => environmentLive,
        onCancel,
      }),
    );
    second.start({ space: "client", x: 100, y: 70 });
    environmentLive = false;
    expect(second.revalidate()).toBeNull();
    expect(onCancel).toHaveBeenCalledWith("environment-lost");
    second.dispose();
  });

  it("disposes subscriptions, observers, and pending frame work", () => {
    const scheduler = new TestFrameScheduler();
    const stopDocument = vi.fn();
    const stopCoordinates = vi.fn();
    const resizeDisconnect = vi.fn();
    const mutationDisconnect = vi.fn();
    const controller = createMovementTargetIndexController(
      controllerOptions({
        coordinateSpace: { subscribe: () => stopCoordinates },
        createMutationObserver: () => ({ disconnect: mutationDisconnect, observe: vi.fn() }),
        createResizeObserver: () => ({ disconnect: resizeDisconnect, observe: vi.fn() }),
        frameScheduler: scheduler,
        subscribeDocumentStructure: () => stopDocument,
      }),
    );
    controller.start({ space: "client", x: 100, y: 70 });
    scheduler.flush();
    expect(controller.getCandidate()).not.toBeNull();
    const resizeDisconnectsBeforeDispose = resizeDisconnect.mock.calls.length;
    const mutationDisconnectsBeforeDispose = mutationDisconnect.mock.calls.length;

    controller.dispose();

    expect(scheduler.pending).toBe(0);
    expect(stopDocument).toHaveBeenCalledTimes(1);
    expect(stopCoordinates).toHaveBeenCalledTimes(1);
    expect(resizeDisconnect).toHaveBeenCalledTimes(resizeDisconnectsBeforeDispose + 1);
    expect(mutationDisconnect).toHaveBeenCalledTimes(mutationDisconnectsBeforeDispose + 1);
    expect(controller.getCandidate()).toBeNull();
  });
});
