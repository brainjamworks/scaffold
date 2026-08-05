import type { EditorView } from "@tiptap/pm/view";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  createFrameCoalescer,
  createWindowFrameScheduler,
  type FrameScheduler,
} from "@/editor/interactions/drag/dom/frame-coalescer";
import type { InteractionCoordinateSpace } from "@/editor/interactions/drag/model/coordinate-space";
import type { ClientPoint } from "@/editor/interactions/drag/model/coordinate-space";

import type { AnyMovementIntent } from "../model/movement-intents";
import type { MovementNodeContext } from "../model/movement-policy";
import {
  deriveContainedMovementCandidate,
  deriveMovementCandidate,
  movementCandidatesAreSemanticallyEqual,
  type MovementCandidate,
} from "./movement-candidate";
import {
  discoverMovementTargetDescriptors,
  type DiscoverMovementTargetDescriptorsInput,
  type MovementTargetDiscoveryResult,
} from "./movement-target-discovery";
import {
  createMovementTargetIndexSnapshot,
  measureMovementTargetEntries,
  readMovementScrollOffset,
  readMovementScrollOffsets,
  type MovementIndexInvalidation,
  type MovementScrollOffset,
  type MovementTargetDescriptor,
  type MovementTargetEntry,
  type MovementTargetIndexSnapshot,
  type MovementTargetQuerySource,
} from "./movement-target-index";

interface MovementResizeObserver {
  disconnect(): void;
  observe(element: Element): void;
}

interface MovementMutationObserver {
  disconnect(): void;
  observe(element: Element, options: MutationObserverInit): void;
}

export type MovementIndexCancellationReason = "environment-lost" | "source-removed";

export interface MovementTargetIndexControllerOptions {
  readonly blockDefinitions: BlockDefinitionLookup;
  readonly canApplyMovementResult?: (
    source: MovementNodeContext,
    intent: AnyMovementIntent,
  ) => boolean;
  readonly coordinateSpace?: Pick<InteractionCoordinateSpace, "subscribe"> | null;
  readonly createMutationObserver?: (callback: MutationCallback) => MovementMutationObserver | null;
  readonly createResizeObserver?: (
    callback: ResizeObserverCallback,
  ) => MovementResizeObserver | null;
  readonly discoverDescriptors?: (
    input: DiscoverMovementTargetDescriptorsInput,
  ) => MovementTargetDiscoveryResult;
  readonly frameScheduler?: FrameScheduler;
  readonly isEnvironmentValid?: () => boolean;
  readonly measureEntries?: (
    descriptors: readonly MovementTargetDescriptor[],
  ) => readonly MovementTargetEntry[];
  readonly onCancel?: (reason: MovementIndexCancellationReason) => void;
  readonly onCandidateChange: (candidate: MovementCandidate | null) => void;
  readonly ownerDocument: Document;
  readonly resolveSource: () => MovementTargetQuerySource | null;
  readonly subscribeDocumentStructure?: (listener: () => void) => () => void;
  readonly view: EditorView;
}

export interface MovementTargetIndexController {
  dispose(): void;
  getCandidate(): MovementCandidate | null;
  getSnapshot(): MovementTargetIndexSnapshot | null;
  invalidate(reason: MovementIndexInvalidation): void;
  revalidate(point?: ClientPoint | null): MovementCandidate | null;
  start(point: ClientPoint | null): void;
  updatePoint(point: ClientPoint): void;
}

export function createMovementTargetIndexController(
  options: MovementTargetIndexControllerOptions,
): MovementTargetIndexController {
  const ownerWindow = options.ownerDocument.defaultView;
  if (!ownerWindow) throw new Error("Movement target indexing requires an owner window.");
  const readyOwnerWindow = ownerWindow;
  const scheduler = options.frameScheduler ?? createWindowFrameScheduler(readyOwnerWindow);
  const discoverDescriptors = options.discoverDescriptors ?? discoverMovementTargetDescriptors;
  const measureEntries = options.measureEntries ?? measureMovementTargetEntries;
  const currentScrollOffsets = new Map<Element | Document, MovementScrollOffset>();
  const relevantScrollTargets = new Set<Element | Document>();
  let descriptors: readonly MovementTargetDescriptor[] = [];
  let entries: readonly MovementTargetEntry[] = [];
  let snapshot: MovementTargetIndexSnapshot | null = null;
  let candidate: MovementCandidate | null = null;
  let source: MovementTargetQuerySource | null = null;
  let sourceIdentity: string | null = null;
  let latestPoint: ClientPoint | null = null;
  let documentRevision = 0;
  let geometryRevision = 0;
  let structuralDirty = false;
  let geometryDirty = false;
  let scrollDirty = false;
  let started = false;
  let disposed = false;
  let resizeObserver: MovementResizeObserver | null = null;
  let mutationObserver: MovementMutationObserver | null = null;
  let stopCoordinates: (() => void) | null = null;
  let stopDocumentStructure: (() => void) | null = null;

  const frame = createFrameCoalescer(() => {
    if (disposed || !started) return;
    if (!environmentIsValid()) {
      cancel("environment-lost");
      return;
    }
    if (structuralDirty && !discoverNow()) return;
    if (geometryDirty || !snapshot) {
      if (!measureNow()) return;
    } else if (scrollDirty) {
      refreshScrollSnapshot();
    }
    queryAndPublish();
  }, scheduler);

  const handleScroll = (event: Event) => {
    if (disposed || !started) return;
    const target = scrollTargetFromEvent(event, options.ownerDocument);
    if (!target || !relevantScrollTargets.has(target)) return;
    currentScrollOffsets.set(target, readMovementScrollOffset(target));
    scrollDirty = true;
    frame.request();
  };

  function environmentIsValid(): boolean {
    return options.isEnvironmentValid?.() ?? true;
  }

  function refreshSource(): boolean {
    const nextSource = options.resolveSource();
    if (!nextSource) {
      cancel("source-removed");
      return false;
    }
    const nextIdentity = movementSourceIdentity(nextSource);
    if (sourceIdentity !== null && sourceIdentity !== nextIdentity) {
      cancel("source-removed");
      return false;
    }
    source = nextSource;
    sourceIdentity = nextIdentity;
    return true;
  }

  function discoverNow(): boolean {
    if (!refreshSource() || !source) return false;
    const result = discoverDescriptors({
      blockDefinitions: options.blockDefinitions,
      documentRevision,
      source,
      view: options.view,
    });
    if (result.documentRevision !== documentRevision) return false;
    descriptors = result.descriptors;
    structuralDirty = false;
    geometryDirty = true;
    syncResizeObservation();
    return true;
  }

  function measureNow(): boolean {
    if (!source && !refreshSource()) return false;
    entries = measureEntries(descriptors);
    currentScrollOffsets.clear();
    for (const [target, offset] of readMovementScrollOffsets(entries)) {
      currentScrollOffsets.set(target, offset);
    }
    syncRelevantScrollTargets();
    geometryRevision += 1;
    snapshot = createMovementTargetIndexSnapshot({
      documentRevision,
      entries,
      geometryRevision,
      scrollOffsets: currentScrollOffsets,
    });
    geometryDirty = false;
    scrollDirty = false;
    return true;
  }

  function refreshScrollSnapshot(): void {
    geometryRevision += 1;
    snapshot = createMovementTargetIndexSnapshot({
      documentRevision,
      entries,
      geometryRevision,
      scrollOffsets: currentScrollOffsets,
    });
    scrollDirty = false;
  }

  function queryCandidate(): MovementCandidate | null {
    if (!snapshot || !source || !latestPoint) return null;
    const queryResult = snapshot.query(latestPoint, source);
    return source.kind === "contained"
      ? deriveContainedMovementCandidate({
          point: latestPoint,
          queryResult,
          source: source.context,
        })
      : deriveMovementCandidate({
          ...(options.canApplyMovementResult
            ? { canApplyMovementResult: options.canApplyMovementResult }
            : {}),
          point: latestPoint,
          queryResult,
          source: source.context,
        });
  }

  function queryAndPublish(): MovementCandidate | null {
    const nextCandidate = queryCandidate();
    if (!movementCandidatesAreSemanticallyEqual(candidate, nextCandidate)) {
      candidate = nextCandidate;
      options.onCandidateChange(candidate);
    }
    return nextCandidate;
  }

  function syncResizeObservation(): void {
    resizeObserver?.disconnect();
    for (const descriptor of descriptors) {
      if (descriptor.element.isConnected) resizeObserver?.observe(descriptor.element);
    }
  }

  function syncRelevantScrollTargets(): void {
    relevantScrollTargets.clear();
    for (const entry of entries) {
      for (const ancestor of entry.rect.scrollAncestors) {
        relevantScrollTargets.add(ancestor.element);
      }
    }
  }

  function cancel(reason: MovementIndexCancellationReason): void {
    if (disposed) return;
    options.onCancel?.(reason);
    dispose();
  }

  function installObservers(): void {
    const createResizeObserver =
      options.createResizeObserver ??
      ((callback: ResizeObserverCallback) => {
        const Constructor = readyOwnerWindow.ResizeObserver;
        return Constructor ? new Constructor(callback) : null;
      });
    const createMutationObserver =
      options.createMutationObserver ??
      ((callback: MutationCallback) => {
        const Constructor = readyOwnerWindow.MutationObserver;
        return Constructor ? new Constructor(callback) : null;
      });
    resizeObserver = createResizeObserver(() => invalidate("resize"));
    mutationObserver = createMutationObserver(() => {
      invalidate(
        descriptors.some((descriptor) => !descriptor.element.isConnected)
          ? "element-disconnected"
          : "layout",
      );
    });
    const viewDom = options.view.dom;
    if (viewDom) {
      mutationObserver?.observe(viewDom, {
        attributes: true,
        attributeFilter: ["class", "style"],
        childList: true,
        subtree: true,
      });
    }
    options.ownerDocument.addEventListener("scroll", handleScroll, true);
    stopCoordinates =
      options.coordinateSpace?.subscribe((reason) => {
        if (reason === "scroll") {
          for (const [target, offset] of readMovementScrollOffsets(entries)) {
            currentScrollOffsets.set(target, offset);
          }
          invalidate("scroll");
          return;
        }
        invalidate(reason === "resize" ? "resize" : "layout");
      }) ?? null;
    stopDocumentStructure =
      options.subscribeDocumentStructure?.(() => invalidate("document-structure")) ?? null;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    frame.dispose();
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    stopCoordinates?.();
    stopDocumentStructure?.();
    options.ownerDocument.removeEventListener("scroll", handleScroll, true);
    resizeObserver = null;
    mutationObserver = null;
    stopCoordinates = null;
    stopDocumentStructure = null;
    descriptors = [];
    entries = [];
    snapshot = null;
    source = null;
    latestPoint = null;
    relevantScrollTargets.clear();
    currentScrollOffsets.clear();
  }

  function invalidate(reason: MovementIndexInvalidation): void {
    if (disposed || !started) return;
    if (reason === "document-structure") {
      documentRevision += 1;
      structuralDirty = true;
      geometryDirty = true;
    } else if (reason === "element-disconnected") {
      structuralDirty = true;
      geometryDirty = true;
    } else if (reason === "scroll") {
      scrollDirty = true;
    } else {
      geometryDirty = true;
    }
    frame.request();
  }

  return {
    dispose,
    getCandidate: () => candidate,
    getSnapshot: () => snapshot,
    invalidate,
    revalidate(point = null) {
      if (disposed || !started) return null;
      if (point) latestPoint = point;
      if (!environmentIsValid()) {
        cancel("environment-lost");
        return null;
      }
      if (!refreshSource()) return null;
      frame.cancel();
      if (structuralDirty && !discoverNow()) return null;
      if (geometryDirty || !snapshot) {
        if (!measureNow()) return null;
      } else if (scrollDirty) {
        refreshScrollSnapshot();
      }
      const nextCandidate = queryAndPublish();
      if (!nextCandidate) return null;
      const descriptor = descriptors.find((item) => item.key === nextCandidate.key);
      if (!descriptor?.element.isConnected) {
        structuralDirty = true;
        geometryDirty = true;
        if (!discoverNow() || !measureNow()) return null;
        return queryAndPublish();
      }
      return nextCandidate;
    },
    start(point) {
      if (disposed || started) return;
      started = true;
      latestPoint = point;
      if (!environmentIsValid()) {
        cancel("environment-lost");
        return;
      }
      installObservers();
      if (!discoverNow()) return;
      frame.request();
    },
    updatePoint(point) {
      if (disposed || !started) return;
      latestPoint = point;
      if (structuralDirty || geometryDirty || scrollDirty || !snapshot) {
        frame.request();
        return;
      }
      queryAndPublish();
    },
  };
}

function movementSourceIdentity(source: MovementTargetQuerySource): string {
  const id = source.context.node.attrs["id"];
  const identity = typeof id === "string" && id.trim() ? id : String(source.context.pos);
  return `${source.kind}:${source.context.nodeType.name}:${identity}`;
}

function scrollTargetFromEvent(event: Event, ownerDocument: Document): Element | Document | null {
  if (event.target === ownerDocument) return ownerDocument;
  const ElementConstructor = ownerDocument.defaultView?.Element;
  return ElementConstructor && event.target instanceof ElementConstructor ? event.target : null;
}
