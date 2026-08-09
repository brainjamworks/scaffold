import type { EmbeddedNodeId } from "@scaffold/contracts";

import type { SemanticDocumentSnapshot } from "@/document/model/semantic-document";

import type { SemanticNavigationEnvironment } from "./semantic-navigation";

const BOUNDED_SCROLL_VIEWPORT_SELECTOR = "[data-bounded-scroll]";
const CONTAINED_EDITOR_SHELL_SELECTOR = '.sc-editor-shell[data-scroll-model="contained"]';

interface AuthoringSemanticNavigationView {
  readonly dom: HTMLElement;
  nodeDOM(pos: number): Node | null;
}

export interface CreateAuthoringSemanticNavigationEnvironmentInput {
  readonly getSnapshot: () => SemanticDocumentSnapshot;
  readonly root: HTMLElement;
  readonly view: AuthoringSemanticNavigationView;
}

export function createAuthoringSemanticNavigationEnvironment({
  getSnapshot,
  root,
  view,
}: CreateAuthoringSemanticNavigationEnvironmentInput): SemanticNavigationEnvironment {
  const resolveCurrentTarget = (id: EmbeddedNodeId): HTMLElement => {
    const location = getSnapshot().locationById.get(id);
    if (!location) throw new Error(`Semantic navigation target "${id}" is unavailable`);
    const node = view.nodeDOM(location.from);
    const element =
      node instanceof root.ownerDocument.defaultView!.HTMLElement ? node : node?.parentElement;
    if (!element || !root.contains(element) || !view.dom.contains(element)) {
      throw new Error(`Semantic navigation target "${id}" is not rendered`);
    }
    return element;
  };

  return {
    async presentSurface(surfaceId) {
      const location = getSnapshot().locationById.get(surfaceId);
      if (!location || location.nodeType !== "surface") {
        throw new Error(`Semantic navigation Surface "${surfaceId}" is unavailable`);
      }
      resolveCurrentTarget(surfaceId);
    },

    async bringIntoView(location, behavior) {
      const target = resolveCurrentTarget(location.id);
      const boundedViewport = target.closest<HTMLElement>(BOUNDED_SCROLL_VIEWPORT_SELECTOR);
      if (boundedViewport && root.contains(boundedViewport)) {
        scrollElementWithinOwner(target, boundedViewport, behavior);
      }

      const containedShell = root.closest<HTMLElement>(CONTAINED_EDITOR_SHELL_SELECTOR);
      if (containedShell) {
        scrollElementWithinOwner(target, containedShell, behavior);
        return;
      }

      scrollElementWithinWindow(target, root.ownerDocument.defaultView, behavior);
    },
  };
}

function scrollElementWithinOwner(
  target: HTMLElement,
  owner: HTMLElement,
  behavior: "instant" | "smooth",
): void {
  const delta = scrollDelta(target.getBoundingClientRect(), owner.getBoundingClientRect());
  if (delta.left === 0 && delta.top === 0) return;
  owner.scrollBy({
    behavior: toScrollBehavior(behavior),
    left: delta.left,
    top: delta.top,
  });
}

function scrollElementWithinWindow(
  target: HTMLElement,
  ownerWindow: Window | null,
  behavior: "instant" | "smooth",
): void {
  if (!ownerWindow) throw new Error("Semantic navigation page scroll owner is unavailable");
  const viewport = {
    bottom: ownerWindow.innerHeight,
    left: 0,
    right: ownerWindow.innerWidth,
    top: 0,
  };
  const delta = scrollDelta(target.getBoundingClientRect(), viewport);
  if (delta.left === 0 && delta.top === 0) return;
  ownerWindow.scrollBy({
    behavior: toScrollBehavior(behavior),
    left: delta.left,
    top: delta.top,
  });
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
      target.top < viewport.top
        ? target.top - viewport.top
        : target.bottom > viewport.bottom
          ? target.bottom - viewport.bottom
          : 0,
  };
}

function toScrollBehavior(behavior: "instant" | "smooth"): ScrollBehavior {
  return behavior === "smooth" ? "smooth" : "auto";
}
