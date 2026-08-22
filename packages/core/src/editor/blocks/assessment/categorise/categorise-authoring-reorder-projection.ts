import { MoveContainedAfterTarget } from "@/editor/movement/model/movement-intents";
import type { MovementCandidate } from "@/editor/movement/view/movement-candidate";
import {
  AUTHORING_CONTAINED_DESTINATION_PROJECTION_ATTR,
  AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR,
  createAuthoringContainedReorderProjection,
  resolveAuthoringNodeViewSiblingElements,
} from "@/editor/movement/view/authoring-contained-reorder-projection";
import type { AuthoringContainedMovementProjection } from "@/editor/movement/view/authoring-movement-presentation";

const CATEGORISE_ITEM_SELECTOR = '[data-node="categorise-item"]';
const CATEGORISE_BIN_SELECTOR = '[data-node="categorise-bin"]';
const CATEGORISE_BINS_SELECTOR = '[data-slot="categorise-bins-group"]';
const CATEGORISE_BIN_CONTENT_SELECTOR = ".sc-course-categorise__bin-content";
const CATEGORISE_ADD_ITEM_SELECTOR = ".sc-app-categorise__add";
const CATEGORISE_DESTINATION_CHROME_SUPPRESSED_ATTR =
  "data-categorise-destination-chrome-suppressed";

interface CrossCategoryProjectionSession {
  readonly ownerWindow: Window;
  readonly sourceHeight: number;
  readonly sourceIndex: number;
}

interface CrossCategoryDestination {
  readonly authoringChrome: HTMLElement | null;
  readonly height: number;
  readonly left: number;
  readonly shiftedItems: readonly HTMLElement[];
  readonly top: number;
  readonly width: number;
}

export function createCategoriseItemAuthoringReorderProjection(
  getSourceElement: () => HTMLElement | null,
): AuthoringContainedMovementProjection {
  const localProjection = createAuthoringContainedReorderProjection({
    axis: "vertical",
    getSiblingElements: (sourceElement) => categoriseItemSiblings(sourceElement),
    getSourceElement,
  });
  let session: CrossCategoryProjectionSession | null = null;
  let destinationElement: HTMLElement | null = null;
  let destinationAnimations: Animation[] = [];
  let projectedDestinationItems: HTMLElement[] = [];
  let suppressedAuthoringChrome: HTMLElement | null = null;

  const clearDestination = () => {
    for (const animation of destinationAnimations) animation.cancel();
    destinationAnimations = [];
    for (const element of projectedDestinationItems) {
      element.removeAttribute(AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR);
      element.removeAttribute("data-categorise-cross-category-projection");
    }
    projectedDestinationItems = [];
    suppressedAuthoringChrome?.removeAttribute(CATEGORISE_DESTINATION_CHROME_SUPPRESSED_ATTR);
    suppressedAuthoringChrome = null;
    destinationElement?.remove();
    destinationElement = null;
  };

  const clear = () => {
    clearDestination();
    localProjection.clear();
    session = null;
  };

  return {
    clear,
    project(destinationIndex) {
      clearDestination();
      localProjection.project(destinationIndex);
    },
    projectAcrossOwners(candidate, overlayHost) {
      clearDestination();
      if (!session) return;
      localProjection.project(session.sourceIndex);
      const sourceElement = getSourceElement();
      if (!sourceElement) return;
      const destination = resolveCrossCategoryDestination(
        sourceElement,
        candidate,
        session.sourceHeight,
      );
      if (!destination) return;
      destination.authoringChrome?.setAttribute(CATEGORISE_DESTINATION_CHROME_SUPPRESSED_ATTR, "");
      suppressedAuthoringChrome = destination.authoringChrome;

      const reducedMotion =
        session.ownerWindow.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
      const shift =
        destination.height + destinationGap(destination.shiftedItems, session.ownerWindow);
      for (const element of destination.shiftedItems) {
        element.setAttribute(AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR, "");
        element.setAttribute("data-categorise-cross-category-projection", "");
        destinationAnimations.push(
          element.animate(
            [{ transform: "translate3d(0, 0, 0)" }, { transform: `translate3d(0, ${shift}px, 0)` }],
            {
              duration: reducedMotion ? 0 : 160,
              easing: "cubic-bezier(0.16, 1, 0.3, 1)",
              fill: "both",
            },
          ),
        );
      }
      projectedDestinationItems = [...destination.shiftedItems];

      const projection = sourceElement.ownerDocument.createElement("div");
      projection.setAttribute(AUTHORING_CONTAINED_DESTINATION_PROJECTION_ATTR, "");
      projection.setAttribute("aria-hidden", "true");
      projection.setAttribute("contenteditable", "false");
      projection.setAttribute("data-scaffold-overlay-click-through-root", "");
      projection.setAttribute("inert", "");
      projection.className = "sc-course-categorise__item-destination-projection";
      Object.assign(projection.style, {
        height: `${destination.height}px`,
        left: `${destination.left}px`,
        top: `${destination.top}px`,
        width: `${destination.width}px`,
      });
      overlayHost.append(projection);
      destinationElement = projection;
    },
    start(sourceIndex) {
      clear();
      const sourceElement = getSourceElement();
      const ownerWindow = sourceElement?.ownerDocument.defaultView;
      if (!sourceElement || !ownerWindow) return false;
      const sourceRect = sourceElement.getBoundingClientRect();
      if (!Number.isFinite(sourceRect.height) || sourceRect.height <= 0) return false;
      localProjection.start(sourceIndex);
      session = { ownerWindow, sourceHeight: sourceRect.height, sourceIndex };
      return true;
    },
  };
}

function resolveCrossCategoryDestination(
  sourceElement: HTMLElement,
  candidate: MovementCandidate,
  sourceHeight: number,
): CrossCategoryDestination | null {
  const bins = sourceElement.closest(CATEGORISE_BINS_SELECTOR);
  const targetId = candidate.target.context.node.attrs["id"];
  if (!bins || typeof targetId !== "string" || !targetId.trim()) return null;

  if (candidate.target.context.nodeType.name === "categorise_item") {
    const target = findCategoriseElement(bins, CATEGORISE_ITEM_SELECTOR, "data-item-id", targetId);
    if (!target) return null;
    const siblings = categoriseItemSiblings(target);
    const targetIndex = siblings.indexOf(target);
    if (targetIndex < 0) return null;
    const after = candidate.intent instanceof MoveContainedAfterTarget;
    const targetRect = candidate.target.rect;
    return {
      authoringChrome:
        target
          .closest('[data-slot="categorise-items-group"]')
          ?.querySelector<HTMLElement>(CATEGORISE_ADD_ITEM_SELECTOR) ?? null,
      height: sourceHeight,
      left: targetRect.left,
      shiftedItems: siblings.slice(targetIndex + (after ? 1 : 0)),
      top: after
        ? targetRect.bottom + destinationGap(siblings, sourceElement.ownerDocument.defaultView)
        : targetRect.top,
      width: targetRect.width,
    };
  }

  if (candidate.target.context.nodeType.name !== "categorise_bin") return null;
  const category = findCategoriseElement(bins, CATEGORISE_BIN_SELECTOR, "data-bin-id", targetId);
  if (!category) return null;
  const items = Array.from(category.querySelectorAll<HTMLElement>(CATEGORISE_ITEM_SELECTOR)).filter(
    (element) => !element.closest("[data-interaction-drag-overlay]"),
  );
  const gap = destinationGap(items, sourceElement.ownerDocument.defaultView);
  const lastItemRect = items.at(-1)?.getBoundingClientRect();
  const authoringChrome = category.querySelector<HTMLElement>(CATEGORISE_ADD_ITEM_SELECTOR);
  const authoringChromeRect = authoringChrome?.getBoundingClientRect();
  const contentRect = category
    .querySelector<HTMLElement>(CATEGORISE_BIN_CONTENT_SELECTOR)
    ?.getBoundingClientRect();
  const categoryRect = candidate.target.rect;
  return {
    authoringChrome,
    height: sourceHeight,
    left: authoringChromeRect?.left ?? lastItemRect?.left ?? contentRect?.left ?? categoryRect.left,
    shiftedItems: [],
    top:
      authoringChromeRect?.top ??
      (lastItemRect ? lastItemRect.bottom + gap : (contentRect?.top ?? categoryRect.top)),
    width:
      authoringChromeRect?.width ?? lastItemRect?.width ?? contentRect?.width ?? categoryRect.width,
  };
}

function categoriseItemSiblings(sourceElement: HTMLElement): HTMLElement[] {
  return resolveAuthoringNodeViewSiblingElements(
    sourceElement,
    (element) => element.getAttribute("data-node") === "categorise-item",
  );
}

function findCategoriseElement(
  root: Element,
  selector: string,
  idAttribute: string,
  id: string,
): HTMLElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLElement>(selector)).find(
      (element) => element.getAttribute(idAttribute) === id,
    ) ?? null
  );
}

function destinationGap(items: readonly HTMLElement[], ownerWindow: Window | null): number {
  if (items.length >= 2) {
    const first = items[0]!.getBoundingClientRect();
    const second = items[1]!.getBoundingClientRect();
    const measured = second.top - first.bottom;
    if (Number.isFinite(measured) && measured >= 0) return measured;
  }
  const container = items[0]?.parentElement;
  const parsed =
    container && ownerWindow
      ? Number.parseFloat(ownerWindow.getComputedStyle(container).rowGap)
      : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
