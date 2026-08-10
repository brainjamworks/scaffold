import type { EditorState, Transaction } from "@tiptap/pm/state";

import type {
  SemanticDocumentSnapshot,
  SemanticLocation,
} from "@/document/model/semantic-document";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  createAuthoringInteractionNavigationTransaction,
  resolveAuthoringInteractionNavigationFrame,
  resolveAuthoringInteractionNavigationTarget,
} from "@/editor/interactions/targets/prosemirror/activation/interaction-navigation";

import type { SemanticNavigationEnvironment } from "./semantic-navigation";

const BOUNDED_SCROLL_VIEWPORT_SELECTOR = "[data-bounded-scroll]";
const CONTAINED_EDITOR_SHELL_SELECTOR = '.sc-editor-shell[data-scroll-model="contained"]';

interface AuthoringSemanticNavigationView {
  readonly dom: HTMLElement;
  readonly state: EditorState;
}

export interface CreateAuthoringSemanticNavigationEnvironmentInput {
  readonly blockDefinitions: BlockDefinitionLookup;
  readonly getSnapshot: () => SemanticDocumentSnapshot;
  readonly root: HTMLElement;
  readonly view: AuthoringSemanticNavigationView;
}

export function createAuthoringSemanticNavigationEnvironment({
  blockDefinitions,
  getSnapshot,
  root,
  view,
}: CreateAuthoringSemanticNavigationEnvironmentInput): SemanticNavigationEnvironment {
  const resolveTarget = (location: SemanticLocation) =>
    resolveAuthoringInteractionNavigationTarget(
      view.state,
      { id: location.id, nodeType: location.nodeType, pos: location.from },
      blockDefinitions,
    );

  const resolveCurrentFrame = (location: SemanticLocation): HTMLElement => {
    const target = resolveTarget(location);
    if (!target) throw new Error(`Semantic navigation target "${location.id}" is unavailable`);
    const element = resolveAuthoringInteractionNavigationFrame(root, target);
    if (!element || !root.contains(element) || !view.dom.contains(element)) {
      throw new Error(`Semantic navigation target "${location.id}" is not rendered`);
    }
    if (!(element instanceof root.ownerDocument.defaultView!.HTMLElement)) {
      throw new Error(`Semantic navigation target "${location.id}" is not rendered`);
    }
    return element;
  };

  return {
    createActivationTransaction(location): Transaction | null {
      const target = resolveTarget(location);
      return target ? createAuthoringInteractionNavigationTransaction(view.state, target) : null;
    },

    async presentSurface(surfaceId) {
      const location = getSnapshot().locationById.get(surfaceId);
      if (
        !location ||
        (location.nodeType !== "surface" && location.nodeType !== "unavailable_surface")
      ) {
        throw new Error(`Semantic navigation Surface "${surfaceId}" is unavailable`);
      }
      resolveCurrentFrame(location);
    },

    async bringIntoView(location, behavior) {
      const target = resolveCurrentFrame(location);
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
      target.bottom > target.top && viewport.bottom > viewport.top
        ? (target.top + target.bottom) / 2 - (viewport.top + viewport.bottom) / 2
        : 0,
  };
}

function toScrollBehavior(behavior: "instant" | "smooth"): ScrollBehavior {
  return behavior === "smooth" ? "smooth" : "auto";
}
