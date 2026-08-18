import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import { isNodeSelection, isTextSelection } from "@/editor/selection/selection-facts";
import {
  clearObjectSelectionToNonDestructiveSelectionInTransaction,
  setNodeSelectionInTransaction,
  setNonDestructiveSelectionNearInTransaction,
  setNonDestructiveSelectionNearWithinRangeInTransaction,
  setObjectSelectionInTransaction,
  setTextSelectionInTransaction,
  setTextSelectionNearInTransaction,
} from "@/editor/selection/selection-transactions";
import type { SemanticEditorSelectionTarget } from "@/document/model/semantic-document/semantic-location";
import { setSemanticSelectionTransactionMeta } from "@/document/authoring/semantic-document/semantic-selection-origin";

import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "../../model/interaction-owner-state";
import { InteractionOwnerCommandKind } from "../state/interaction-owner-command-model";
import { setInteractionOwnerCommandMeta } from "../state/interaction-owner-plugin-state";
import {
  InteractionDomActivationIntentKind,
  type InteractionDomActivationIntent,
} from "./interaction-activation-intent";
import {
  resolveDefaultStructuralActivationPlacement,
  type StructuralActivationPlacement,
  type StructuralActivationPlacementRange,
  type StructuralActivationPlacementResolver,
  type StructuralActivationPlacementUnavailable,
} from "./structural-activation-placement";

export interface ApplyInteractionActivationIntentOptions {
  readonly contextOwner?: InteractionTargetRef | null;
  readonly resolveStructuralActivationPlacement?: StructuralActivationPlacementResolver;
}

export type ApplyInteractionActivationIntentResult =
  | boolean
  | StructuralActivationPlacementUnavailable;

export type InteractionTargetActivationMode = "object" | "structural";

export interface CreateInteractionTargetActivationTransactionOptions {
  readonly preferredPos?: number | null;
}

export type StructuralActivationTransactionResolution =
  | { readonly kind: "transaction"; readonly transaction: Transaction }
  | StructuralActivationPlacementUnavailable;

type StructuralActivationPlacementApplication =
  | { readonly kind: "placement-applied" }
  | StructuralActivationPlacementUnavailable;

type RetainedChildStructuralActivationPlacement = Extract<
  StructuralActivationPlacement,
  { readonly kind: "retain-active-child" }
>;

const STRUCTURAL_PLACEMENT_APPLIED = Object.freeze({
  kind: "placement-applied" as const,
});

/**
 * Canonical non-DOM activation entrypoint. Callers provide a live projected
 * interaction target; this applies the same owner command and selection safety
 * rules as pointer activation without synthesizing an event. Existing callers
 * retain the legacy Transaction-or-null contract and default pointer placement.
 */
export function createInteractionTargetActivationTransaction(
  state: EditorState,
  target: InteractionTargetRef,
  mode: InteractionTargetActivationMode,
  options: CreateInteractionTargetActivationTransactionOptions = {},
): Transaction | null {
  if (mode === "object") {
    const tr = state.tr;
    if (target.kind !== InteractionTargetKind.Block || !Number.isInteger(target.pos)) return null;
    if (!setObjectSelectionInTransaction(tr, target.pos as number)) return null;
    return setInteractionOwnerCommandMeta(tr, {
      kind: InteractionOwnerCommandKind.SelectObjectTarget,
      target,
    });
  }

  if (target.kind === InteractionTargetKind.Block || target.kind === InteractionTargetKind.Field) {
    return null;
  }

  const resolution = createStructuralInteractionTargetActivationTransaction(
    state,
    target,
    resolveDefaultStructuralActivationPlacement({ state, target }),
    options.preferredPos,
  );
  return resolution.kind === "transaction" ? resolution.transaction : null;
}

/**
 * Applies a classified DOM activation intent as one interaction owner command
 * transaction, reconciling ProseMirror selection through selection
 * helpers only. Returns the existing handled-event boolean or the exact typed
 * placement refusal when structural activation cannot safely select content.
 * Non-blocking context activation never calls preventDefault: ignored
 * interactive and editable targets keep their native behavior while the
 * resolved context owner rides the same transaction.
 */
export function applyInteractionActivationIntent(
  view: EditorView,
  intent: InteractionDomActivationIntent,
  event?: MouseEvent,
  options: ApplyInteractionActivationIntentOptions = {},
): ApplyInteractionActivationIntentResult {
  switch (intent.kind) {
    case InteractionDomActivationIntentKind.IgnoredInteractive: {
      const contextOwner = options.contextOwner ?? null;
      if (!contextOwner) return false;

      view.dispatch(
        setInteractionOwnerCommandMeta(view.state.tr, {
          kind: InteractionOwnerCommandKind.ActivateContextOwner,
          target: contextOwner,
        }),
      );
      return false;
    }

    case InteractionDomActivationIntentKind.AuthoredEditableContent: {
      view.dispatch(
        setInteractionOwnerCommandMeta(view.state.tr, {
          ...(options.contextOwner ? { contextOwner: options.contextOwner } : {}),
          kind: InteractionOwnerCommandKind.EnterEditableContent,
        }),
      );
      return false;
    }

    case InteractionDomActivationIntentKind.BlankStructuralSpace:
    case InteractionDomActivationIntentKind.ExplicitChrome: {
      event?.preventDefault();
      const placement = (
        options.resolveStructuralActivationPlacement ?? resolveDefaultStructuralActivationPlacement
      )({ state: view.state, target: intent.target });
      if (placement.kind === "placement-unavailable") return placement;
      if (placement.kind === "pointer-within-target") view.focus();
      const resolution = createStructuralInteractionTargetActivationTransaction(
        view.state,
        intent.target,
        placement,
        placement.kind === "pointer-within-target"
          ? resolveTargetBoundPointerDocumentPos(view, view.state.tr, intent.target, event)
          : null,
      );
      if (resolution.kind === "placement-unavailable") return resolution;
      if (placement.kind === "retain-active-child") view.focus();
      view.dispatch(resolution.transaction);
      return true;
    }

    case InteractionDomActivationIntentKind.ObjectShell: {
      if (intent.target.kind !== InteractionTargetKind.Block) return false;
      if (!Number.isInteger(intent.target.pos)) return false;

      event?.preventDefault();
      view.focus();
      const tr = createInteractionTargetActivationTransaction(view.state, intent.target, "object");
      if (!tr) return false;
      view.dispatch(tr);
      return true;
    }

    case InteractionDomActivationIntentKind.OutsideEditor: {
      const tr = setInteractionOwnerCommandMeta(view.state.tr, {
        kind: InteractionOwnerCommandKind.DismissInteraction,
      });
      clearObjectSelectionToNonDestructiveSelectionInTransaction(tr);
      view.dispatch(tr);
      return true;
    }
  }
}

/**
 * Result-bearing structural activation boundary for callers that have already
 * resolved an explicit placement policy. Expected placement refusals remain
 * exact typed data instead of being flattened into the legacy nullable API.
 */
export function createStructuralInteractionTargetActivationTransaction(
  state: EditorState,
  target: InteractionTargetRef,
  placement: StructuralActivationPlacement,
  preferredPos?: number | null,
): StructuralActivationTransactionResolution {
  if (target.kind === InteractionTargetKind.Block || target.kind === InteractionTargetKind.Field) {
    throw new Error("Explicit structural activation requires a structural interaction target.");
  }

  const tr = state.tr;
  const application = applyStructuralActivationPlacement(tr, target, placement, preferredPos);
  if (application.kind === "placement-unavailable") return application;

  const transaction = setInteractionOwnerCommandMeta(tr, {
    kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
    target,
  });
  const intendedId = EmbeddedNodeIdSchema.safeParse(target.id);
  if (intendedId.success) {
    setSemanticSelectionTransactionMeta(transaction, {
      intendedId: intendedId.data,
      origin: "editor",
    });
  }

  return {
    kind: "transaction",
    transaction,
  };
}

function applyStructuralActivationPlacement(
  tr: Transaction,
  target: InteractionTargetRef,
  placement: StructuralActivationPlacement,
  preferredPos: number | null | undefined,
): StructuralActivationPlacementApplication {
  switch (placement.kind) {
    case "pointer-within-target":
      applyPointerWithinTargetPlacement(tr, target, preferredPos);
      return STRUCTURAL_PLACEMENT_APPLIED;
    case "retain-active-child": {
      const targetId = requireRetainedChildStructuralTargetId(target);
      return retainActiveChildSelection(tr, placement.activeRange, placement.selectionTarget)
        ? STRUCTURAL_PLACEMENT_APPLIED
        : retainedChildSelectionUnavailable(targetId, placement.activeChildId);
    }
  }
}

function applyPointerWithinTargetPlacement(
  tr: Transaction,
  target: InteractionTargetRef,
  preferredPos: number | null | undefined,
): void {
  const range = resolveLiveTargetRange(tr, target);
  const pos = preferredPos ?? target.pos ?? tr.selection.from;
  if (range) {
    if (!setNonDestructiveSelectionNearWithinRangeInTransaction(tr, pos, range)) {
      clearObjectSelectionToNonDestructiveSelectionInTransaction(tr);
    }
  } else if (!setNonDestructiveSelectionNearInTransaction(tr, pos)) {
    clearObjectSelectionToNonDestructiveSelectionInTransaction(tr);
  }
}

function retainActiveChildSelection(
  tr: Transaction,
  activeRange: StructuralActivationPlacementRange,
  selectionTarget: SemanticEditorSelectionTarget,
): boolean {
  if (isTextOrNodeSelectionWithinRange(tr.selection, activeRange, tr.doc.content.size)) {
    return true;
  }
  if (!applySemanticSelectionTarget(tr, selectionTarget)) return false;
  return isTextOrNodeSelectionWithinRange(tr.selection, activeRange, tr.doc.content.size);
}

function applySemanticSelectionTarget(
  tr: Transaction,
  selectionTarget: SemanticEditorSelectionTarget,
): boolean {
  switch (selectionTarget.kind) {
    case "node":
      return setNodeSelectionInTransaction(tr, selectionTarget.pos);
    case "text":
      return setTextSelectionInTransaction(tr, selectionTarget.from, selectionTarget.to);
    case "near":
      return setTextSelectionNearInTransaction(tr, selectionTarget.pos);
  }
}

function isTextOrNodeSelectionWithinRange(
  selection: Transaction["selection"],
  range: StructuralActivationPlacementRange,
  documentSize: number,
): boolean {
  if (!(isTextSelection(selection) || isNodeSelection(selection))) return false;
  if (
    !Number.isInteger(range.from) ||
    !Number.isInteger(range.to) ||
    range.from < 0 ||
    range.to <= range.from ||
    range.to > documentSize
  ) {
    return false;
  }
  if (isTextSelection(selection)) {
    return selection.from > range.from && selection.to < range.to;
  }
  return selection.from >= range.from && selection.to <= range.to;
}

function retainedChildSelectionUnavailable(
  targetId: EmbeddedNodeId,
  activeChildId: RetainedChildStructuralActivationPlacement["activeChildId"],
): StructuralActivationPlacementUnavailable {
  return {
    kind: "placement-unavailable",
    issue: {
      kind: "retained-child-selection-unavailable",
      targetId,
      activeChildId,
    },
  };
}

function requireRetainedChildStructuralTargetId(target: InteractionTargetRef): EmbeddedNodeId {
  const targetId = EmbeddedNodeIdSchema.safeParse(target.id);
  if (!targetId.success) {
    throw new Error("Retained-child structural activation requires a valid embedded node ID.");
  }
  return targetId.data;
}

function resolveTargetBoundPointerDocumentPos(
  view: EditorView,
  tr: Transaction,
  target: InteractionTargetRef,
  event: MouseEvent | undefined,
): number | null {
  const pointerPos = resolvePointerDocumentPos(view, event);
  if (pointerPos === null) return null;

  const range = resolveLiveTargetRange(tr, target);
  if (!range) return null;

  return isDocumentPosInsideRange(pointerPos, range) ? pointerPos : null;
}

function resolvePointerDocumentPos(view: EditorView, event: MouseEvent | undefined): number | null {
  if (!event) return null;
  if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
    return null;
  }

  try {
    return view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null;
  } catch {
    return null;
  }
}

function resolveLiveTargetRange(
  tr: Transaction,
  target: InteractionTargetRef,
): { from: number; to: number } | null {
  if (!Number.isInteger(target.pos)) return null;

  const pos = target.pos as number;
  const node = tr.doc.nodeAt(pos);
  if (!node) return null;
  if (target.id && node.attrs["id"] !== target.id) return null;
  if (
    target.kind !== InteractionTargetKind.Block &&
    target.kind !== InteractionTargetKind.Field &&
    node.type.name !== target.kind
  ) {
    return null;
  }

  return { from: pos, to: pos + node.nodeSize };
}

function isDocumentPosInsideRange(pos: number, range: { from: number; to: number }): boolean {
  return pos >= range.from && pos < range.to;
}
