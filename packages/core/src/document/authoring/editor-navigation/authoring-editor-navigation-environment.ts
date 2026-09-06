import type { EditorState, Transaction } from "@tiptap/pm/state";

import type { DocumentTreeSnapshot, DocumentItemLocation } from "@/document/model/document-tree";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { BOUNDED_SCROLL_VIEWPORT_SELECTOR } from "@/editor/bounded-containers/view/bounded-scroll";
import {
  createAuthoringInteractionNavigationTransaction,
  resolveAuthoringInteractionNavigationFrame,
  resolveAuthoringInteractionNavigationTarget,
} from "@/editor/interactions/targets/prosemirror/activation/interaction-navigation";

import type { EditorNavigationEnvironment } from "./editor-navigation";

const CONTAINED_EDITOR_SHELL_SELECTOR = '.sc-editor-shell[data-scroll-model="contained"]';

interface AuthoringEditorNavigationView {
  readonly dom: HTMLElement;
  readonly state: EditorState;
}

export interface CreateAuthoringEditorNavigationEnvironmentInput {
  readonly blockDefinitions: BlockDefinitionLookup;
  readonly getDocumentTree: () => DocumentTreeSnapshot;
  readonly root: HTMLElement;
  readonly view: AuthoringEditorNavigationView;
}

export function createAuthoringEditorNavigationEnvironment({
  blockDefinitions,
  getDocumentTree,
  root,
  view,
}: CreateAuthoringEditorNavigationEnvironmentInput): EditorNavigationEnvironment {
  const resolveTarget = (location: DocumentItemLocation) =>
    resolveAuthoringInteractionNavigationTarget(
      view.state,
      { id: location.id, nodeType: location.nodeType, pos: location.from },
      blockDefinitions,
    );

  const resolveCurrentFrame = (location: DocumentItemLocation): HTMLElement => {
    const target = resolveTarget(location);
    if (!target) throw new Error(`Editor navigation target "${location.id}" is unavailable`);
    const element = resolveAuthoringInteractionNavigationFrame(root, target);
    if (!element || !root.contains(element) || !view.dom.contains(element)) {
      throw new Error(`Editor navigation target "${location.id}" is not rendered`);
    }
    if (!(element instanceof root.ownerDocument.defaultView!.HTMLElement)) {
      throw new Error(`Editor navigation target "${location.id}" is not rendered`);
    }
    return element;
  };

  return {
    createActivationTransaction(location): Transaction | null {
      const target = resolveTarget(location);
      return target ? createAuthoringInteractionNavigationTransaction(view.state, target) : null;
    },

    async presentSurface(surfaceId) {
      const location = getDocumentTree().locationById.get(surfaceId);
      if (
        !location ||
        (location.nodeType !== "surface" && location.nodeType !== "unavailable_surface")
      ) {
        throw new Error(`Editor navigation Surface "${surfaceId}" is unavailable`);
      }
      resolveCurrentFrame(location);
    },

    async bringIntoView(location, behavior) {
      const target = resolveCurrentFrame(location);
      const scrolledOwners = new Set<HTMLElement>();
      for (const boundedViewport of boundedScrollAncestors(target, root)) {
        await scrollElementWithinOwner(target, boundedViewport, behavior);
        scrolledOwners.add(boundedViewport);
      }

      const containedShell = target.closest<HTMLElement>(CONTAINED_EDITOR_SHELL_SELECTOR);
      if (containedShell) {
        if (!scrolledOwners.has(containedShell)) {
          await scrollElementWithinOwner(target, containedShell, behavior);
        }
        return;
      }

      await scrollElementWithinWindow(target, root.ownerDocument.defaultView, behavior);
    },
  };
}

function boundedScrollAncestors(target: HTMLElement, root: HTMLElement): HTMLElement[] {
  const owners: HTMLElement[] = [];
  let candidate = target.parentElement;
  while (candidate && root.contains(candidate)) {
    if (candidate.matches(BOUNDED_SCROLL_VIEWPORT_SELECTOR)) owners.push(candidate);
    if (candidate === root) break;
    candidate = candidate.parentElement;
  }
  return owners;
}

async function scrollElementWithinOwner(
  target: HTMLElement,
  owner: HTMLElement,
  behavior: "instant" | "smooth",
): Promise<void> {
  const delta = scrollDelta(target.getBoundingClientRect(), owner.getBoundingClientRect());
  if (delta.left === 0 && delta.top === 0) return;
  await scrollByAndWait(owner, delta, behavior);
}

async function scrollElementWithinWindow(
  target: HTMLElement,
  ownerWindow: Window | null,
  behavior: "instant" | "smooth",
): Promise<void> {
  if (!ownerWindow) throw new Error("Editor navigation page scroll owner is unavailable");
  const viewport = {
    bottom: ownerWindow.innerHeight,
    left: 0,
    right: ownerWindow.innerWidth,
    top: 0,
  };
  const delta = scrollDelta(target.getBoundingClientRect(), viewport);
  if (delta.left === 0 && delta.top === 0) return;
  await scrollByAndWait(ownerWindow, delta, behavior);
}

async function scrollByAndWait(
  owner: HTMLElement | Window,
  delta: { readonly left: number; readonly top: number },
  behavior: "instant" | "smooth",
): Promise<void> {
  const expected = expectedScrollPosition(owner, delta);
  const waitForScrollSettlement =
    behavior === "smooth" && !isAtScrollPosition(owner, expected)
      ? createScrollSettlementWaiter(owner)
      : null;
  owner.scrollBy({
    behavior: toScrollBehavior(behavior),
    left: delta.left,
    top: delta.top,
  });
  if (!waitForScrollSettlement) return;
  if (isAtScrollPosition(owner, expected)) {
    waitForScrollSettlement.cancel();
    return;
  }
  await waitForScrollSettlement.promise;
}

function expectedScrollPosition(
  owner: HTMLElement | Window,
  delta: { readonly left: number; readonly top: number },
): { readonly left: number; readonly top: number } {
  if (isScrollWindow(owner)) {
    const documentElement = owner.document.documentElement;
    return {
      left: clamp(owner.scrollX + delta.left, 0, documentElement.scrollWidth - owner.innerWidth),
      top: clamp(owner.scrollY + delta.top, 0, documentElement.scrollHeight - owner.innerHeight),
    };
  }
  return {
    left: clamp(owner.scrollLeft + delta.left, 0, owner.scrollWidth - owner.clientWidth),
    top: clamp(owner.scrollTop + delta.top, 0, owner.scrollHeight - owner.clientHeight),
  };
}

function isAtScrollPosition(
  owner: HTMLElement | Window,
  expected: { readonly left: number; readonly top: number },
): boolean {
  const left = isScrollWindow(owner) ? owner.scrollX : owner.scrollLeft;
  const top = isScrollWindow(owner) ? owner.scrollY : owner.scrollTop;
  return Math.abs(left - expected.left) < 1 && Math.abs(top - expected.top) < 1;
}

function createScrollSettlementWaiter(owner: HTMLElement | Window): {
  cancel(): void;
  readonly promise: Promise<void>;
} {
  let cancel = () => {};
  const promise = new Promise<void>((resolve) => {
    const ownerWindow = isScrollWindow(owner) ? owner : owner.ownerDocument.defaultView;
    let animationFrame = 0;
    let lastPosition = currentScrollPosition(owner);
    let stableFrames = 0;
    const finish = () => {
      owner.removeEventListener("scrollend", handleScrollEnd);
      if (ownerWindow && animationFrame !== 0) ownerWindow.cancelAnimationFrame(animationFrame);
      resolve();
    };
    const handleScrollEnd = () => finish();
    const measure = () => {
      const current = currentScrollPosition(owner);
      stableFrames =
        Math.abs(current.left - lastPosition.left) < 1 &&
        Math.abs(current.top - lastPosition.top) < 1
          ? stableFrames + 1
          : 0;
      lastPosition = current;
      if (stableFrames >= 2 || !ownerWindow) {
        finish();
        return;
      }
      animationFrame = ownerWindow.requestAnimationFrame(measure);
    };
    cancel = finish;
    owner.addEventListener("scrollend", handleScrollEnd, { once: true });
    if (ownerWindow) animationFrame = ownerWindow.requestAnimationFrame(measure);
  });
  return { cancel: () => cancel(), promise };
}

function currentScrollPosition(owner: HTMLElement | Window): {
  readonly left: number;
  readonly top: number;
} {
  return isScrollWindow(owner)
    ? { left: owner.scrollX, top: owner.scrollY }
    : { left: owner.scrollLeft, top: owner.scrollTop };
}

function isScrollWindow(owner: HTMLElement | Window): owner is Window {
  return "document" in owner && "scrollX" in owner;
}

function scrollDelta(
  target: Pick<DOMRect, "bottom" | "left" | "right" | "top">,
  viewport: Pick<DOMRect, "bottom" | "left" | "right" | "top">,
): { readonly left: number; readonly top: number } {
  return {
    left:
      target.left < viewport.left
        ? target.left - viewport.left
        : target.right > viewport.right
          ? target.right - viewport.right
          : 0,
    top:
      target.bottom > target.top && viewport.bottom > viewport.top
        ? (target.top + target.bottom) / 2 - (viewport.top + viewport.bottom) / 2
        : 0,
  };
}

function toScrollBehavior(behavior: "instant" | "smooth"): ScrollBehavior {
  return behavior === "smooth" ? "smooth" : "auto";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}
