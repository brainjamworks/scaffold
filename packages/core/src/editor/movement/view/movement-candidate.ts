import { deriveMovementIntentFromGeometry, type DropPoint } from "../model/geometry";
import {
  MoveContainedAfterTarget,
  MoveContainedBeforeTarget,
  type AnyMovementIntent,
} from "../model/movement-intents";
import type { MovementNodeContext } from "../model/movement-policy";
import { ContainedMovementTarget } from "../model/movement-target";
import type { MovementTargetQueryResult } from "./movement-target-index";

export type MovementCandidate = {
  intent: AnyMovementIntent;
  key: string;
  source: MovementNodeContext;
  target: MovementTargetQueryResult["target"];
};

export type MovementCandidateInput = {
  canApplyMovementResult?: (source: MovementNodeContext, intent: AnyMovementIntent) => boolean;
  point: DropPoint;
  queryResult: MovementTargetQueryResult | null;
  source: MovementNodeContext;
};

export function deriveMovementCandidate({
  canApplyMovementResult,
  point,
  queryResult,
  source,
}: MovementCandidateInput): MovementCandidate | null {
  if (!queryResult || queryResult.target instanceof ContainedMovementTarget) return null;
  const intent = deriveMovementIntentFromGeometry({ point, target: queryResult.target });
  if (!intent) return null;
  if (canApplyMovementResult && !canApplyMovementResult(source, intent)) return null;

  return Object.freeze({
    intent,
    key: queryResult.key,
    source,
    target: queryResult.target,
  });
}

export function deriveContainedMovementCandidate({
  canApplyMovementResult,
  queryResult,
  source,
}: Omit<MovementCandidateInput, "point">): MovementCandidate | null {
  if (
    !queryResult ||
    !(queryResult.target instanceof ContainedMovementTarget) ||
    !queryResult.placement
  ) {
    return null;
  }

  const intent =
    queryResult.placement === "before"
      ? new MoveContainedBeforeTarget(queryResult.target)
      : new MoveContainedAfterTarget(queryResult.target);
  if (canApplyMovementResult && !canApplyMovementResult(source, intent)) return null;
  return Object.freeze({
    intent,
    key: queryResult.key,
    source,
    target: queryResult.target,
  });
}

export function movementCandidatesAreSemanticallyEqual(
  left: MovementCandidate | null,
  right: MovementCandidate | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.source.pos === right.source.pos &&
    left.key === right.key &&
    left.intent.constructor === right.intent.constructor
  );
}
