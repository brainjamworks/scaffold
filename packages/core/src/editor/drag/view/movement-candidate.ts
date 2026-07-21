import type { EditorView } from "@tiptap/pm/view";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

import { deriveMovementIntentFromGeometry, type DropPoint } from "../model/geometry";
import {
  MoveContainedAfterTarget,
  MoveContainedBeforeTarget,
  type AnyMovementIntent,
} from "../model/movement-intents";
import {
  canStartStructureMovement,
  canTargetContainedMovement,
  canTargetStructureMovement,
  containsPosition,
  createStructureMovementPolicy,
  resolveContainedMovementSourceContext,
  resolveMovementNodeContext,
  resolveMovementTargetAtPos,
  type MovementNodeContext,
  type StructureMovementPolicy,
} from "../model/movement-policy";
import {
  ContainedMovementTarget,
  createMovementTarget,
  type AnyMovementTarget,
  type MovementTargetRect,
} from "../model/movement-target";
import { CONTAINED_MOVEMENT_TARGET_ATTR, resolveMovementAnchorElement } from "./movement-dom";

export type MovementCandidate = {
  intent: AnyMovementIntent;
  source: MovementNodeContext;
  target: AnyMovementTarget;
};

export type MovementCandidateInput = {
  blockDefinitions: BlockDefinitionLookup;
  canApplyMovementResult?: (source: MovementNodeContext, intent: AnyMovementIntent) => boolean;
  point: DropPoint;
  sourcePos: number;
  view: EditorView;
};

const MOVEMENT_TARGET_GUTTER_PX = 40;

type MovementTargetMatch = {
  area: number;
  depth: number;
  distance: number;
  exact: boolean;
  priority: number;
  target: AnyMovementTarget;
};

export function deriveMovementCandidate({
  blockDefinitions,
  canApplyMovementResult,
  point,
  sourcePos,
  view,
}: MovementCandidateInput): MovementCandidate | null {
  const policy = createStructureMovementPolicy(view.state.schema, blockDefinitions);
  const source = resolveMovementNodeContext(view.state.doc, sourcePos);
  if (!source || !canStartStructureMovement(policy, source)) return null;

  const target = resolveMovementTargetFromPoint(policy, view, point, source, blockDefinitions);
  if (!target) return null;
  if (target.pos === source.pos) return null;
  if (containsPosition(source.pos, source.node, target.pos)) return null;

  const intent = deriveMovementIntentFromGeometry({
    point,
    target,
  });
  if (!intent) return null;
  if (canApplyMovementResult && !canApplyMovementResult(source, intent)) {
    return null;
  }

  return { intent, source, target };
}

export function deriveContainedMovementCandidate({
  point,
  sourcePos,
  view,
}: Omit<
  MovementCandidateInput,
  "blockDefinitions" | "canApplyMovementResult"
>): MovementCandidate | null {
  const source = resolveContainedMovementSourceContext(view.state.doc, sourcePos);
  if (!source) return null;

  const target = resolveContainedMovementTargetFromPoint(view, point, source);
  if (!target) return null;

  const before = point.y < target.rect.top + target.rect.height / 2;
  if (isContainedNoOp(source, target.context, before ? "before" : "after")) {
    return null;
  }

  return {
    intent: before ? new MoveContainedBeforeTarget(target) : new MoveContainedAfterTarget(target),
    source,
    target,
  };
}

export function resolveContainedMovementTargetFromPoint(
  view: EditorView,
  point: DropPoint,
  source: MovementNodeContext,
): ContainedMovementTarget | null {
  const matches: MovementTargetMatch[] = [];

  view.state.doc.descendants((_node, pos) => {
    const context = resolveMovementNodeContext(view.state.doc, pos);
    if (!canTargetContainedMovement(source, context)) return true;
    if (!context) return true;

    const dom = view.nodeDOM(pos);
    if (!(dom instanceof Element)) return true;

    const anchor = resolveContainedMovementAnchorElement(dom);
    if (!anchor) return true;

    const rect = anchor.getBoundingClientRect();
    const match = matchContainedMovementTargetAtPoint(context, rect, point);
    if (match) matches.push(match);

    return true;
  });

  const target = bestMovementTargetMatch(matches)?.target ?? null;
  return target instanceof ContainedMovementTarget ? target : null;
}

export function resolveMovementTargetFromPoint(
  policy: StructureMovementPolicy,
  view: EditorView,
  point: DropPoint,
  source: MovementNodeContext,
  blockDefinitions: BlockDefinitionLookup,
): AnyMovementTarget | null {
  const matches: MovementTargetMatch[] = [];

  view.state.doc.descendants((_node, pos) => {
    const context = resolveMovementNodeContext(view.state.doc, pos);
    if (!canTargetStructureMovement(policy, context)) return true;
    if (!context) return true;
    if (context.pos === source.pos) return false;
    if (containsPosition(source.pos, source.node, context.pos)) return false;

    const dom = view.nodeDOM(pos);
    if (!(dom instanceof Element)) return true;

    const anchor = resolveMovementAnchorElement(dom, context, blockDefinitions);
    if (!anchor) return true;

    const rect = anchor.getBoundingClientRect();
    const match = matchMovementTargetAtPoint(context, rect, point);
    if (match) matches.push(match);

    return true;
  });

  const visualTarget = bestMovementTargetMatch(matches)?.target ?? null;
  if (visualTarget) return visualTarget;

  return resolveMovementTargetFromProseMirrorCoords(policy, view, point, source, blockDefinitions);
}

function resolveMovementTargetFromProseMirrorCoords(
  policy: StructureMovementPolicy,
  view: EditorView,
  point: DropPoint,
  source: MovementNodeContext,
  blockDefinitions: BlockDefinitionLookup,
): AnyMovementTarget | null {
  const coords = view.posAtCoords({ left: point.x, top: point.y });
  if (!coords) return null;

  const target = resolveMovementTargetAtPos(policy, view.state.doc, coords.pos);
  if (!target) return null;
  if (target.pos === source.pos) return null;
  if (containsPosition(source.pos, source.node, target.pos)) return null;

  const targetDom = view.nodeDOM(target.pos);
  if (!(targetDom instanceof Element)) return null;

  const targetAnchor = resolveMovementAnchorElement(targetDom, target, blockDefinitions);
  if (!targetAnchor) return null;

  return createMovementTarget(target, targetAnchor.getBoundingClientRect());
}

function matchMovementTargetAtPoint(
  context: MovementNodeContext,
  rect: MovementTargetRect,
  point: DropPoint,
): MovementTargetMatch | null {
  const exact = containsPoint(rect, point);
  const distance = exact ? 0 : gutterDistance(rect, point);
  if (distance === null) return null;

  return {
    area: Math.max(rect.width, 1) * Math.max(rect.height, 1),
    depth: context.ancestors.length,
    distance,
    exact,
    priority: matchPriority(context, exact),
    target: createMovementTarget(context, rect),
  };
}

function matchContainedMovementTargetAtPoint(
  context: MovementNodeContext,
  rect: MovementTargetRect,
  point: DropPoint,
): MovementTargetMatch | null {
  const exact = containsPoint(rect, point);
  const distance = exact ? 0 : gutterDistance(rect, point);
  if (distance === null) return null;

  return {
    area: Math.max(rect.width, 1) * Math.max(rect.height, 1),
    depth: context.ancestors.length,
    distance,
    exact,
    priority: 0,
    target: new ContainedMovementTarget(context, rect),
  };
}

function resolveContainedMovementAnchorElement(dom: Element): Element | null {
  if (dom.matches(`[${CONTAINED_MOVEMENT_TARGET_ATTR}]`)) return dom;
  return dom.querySelector(`[${CONTAINED_MOVEMENT_TARGET_ATTR}]`);
}

function isContainedNoOp(
  source: MovementNodeContext,
  target: MovementNodeContext,
  placement: "before" | "after",
): boolean {
  if (placement === "before") return source.index === target.index - 1;
  return source.index === target.index + 1;
}

function bestMovementTargetMatch(matches: MovementTargetMatch[]): MovementTargetMatch | null {
  return (
    [...matches].sort((left, right) => {
      if (left.priority !== right.priority) return left.priority - right.priority;
      if (left.exact !== right.exact) return left.exact ? -1 : 1;
      if (left.distance !== right.distance) return left.distance - right.distance;
      if (left.area !== right.area) return left.area - right.area;
      return right.depth - left.depth;
    })[0] ?? null
  );
}

function containsPoint(rect: MovementTargetRect, point: DropPoint): boolean {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}

function gutterDistance(rect: MovementTargetRect, point: DropPoint): number | null {
  if (
    point.y >= rect.top &&
    point.y <= rect.bottom &&
    point.x < rect.left &&
    point.x >= rect.left - MOVEMENT_TARGET_GUTTER_PX
  ) {
    return rect.left - point.x;
  }

  if (
    point.y >= rect.top &&
    point.y <= rect.bottom &&
    point.x > rect.right &&
    point.x <= rect.right + MOVEMENT_TARGET_GUTTER_PX
  ) {
    return point.x - rect.right;
  }

  if (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y < rect.top &&
    point.y >= rect.top - MOVEMENT_TARGET_GUTTER_PX
  ) {
    return rect.top - point.y;
  }

  if (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y > rect.bottom &&
    point.y <= rect.bottom + MOVEMENT_TARGET_GUTTER_PX
  ) {
    return point.y - rect.bottom;
  }

  return null;
}

function matchPriority(context: MovementNodeContext, exact: boolean): number {
  if (!exact) {
    return isStructuralRowTarget(context) ? 0 : 1;
  }

  if (context.nodeType.name === "surface") return 3;
  return 2;
}

function isStructuralRowTarget(context: MovementNodeContext): boolean {
  return (
    context.nodeType.name === "grid" ||
    context.nodeType.name === "layout" ||
    context.nodeType.name === "section"
  );
}
