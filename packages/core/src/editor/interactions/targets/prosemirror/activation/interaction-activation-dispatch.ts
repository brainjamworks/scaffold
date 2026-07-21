import type { Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import {
  clearObjectSelectionToNonDestructiveSelectionInTransaction,
  setNonDestructiveSelectionNearInTransaction,
  setNonDestructiveSelectionNearWithinRangeInTransaction,
  setObjectSelectionInTransaction,
} from "@/editor/selection/selection-transactions";

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

export interface ApplyInteractionActivationIntentOptions {
  contextOwner?: InteractionTargetRef | null;
}

/**
 * Applies a classified DOM activation intent as one interaction owner command
 * transaction, reconciling ProseMirror selection through selection
 * helpers only. Returns whether activation handled the event.
 * Non-blocking context activation never calls preventDefault: ignored
 * interactive and editable targets keep their native behavior while the
 * resolved context owner rides the same transaction.
 */
export function applyInteractionActivationIntent(
  view: EditorView,
  intent: InteractionDomActivationIntent,
  event?: MouseEvent,
  options: ApplyInteractionActivationIntentOptions = {},
): boolean {
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
      view.focus();
      const tr = setInteractionOwnerCommandMeta(view.state.tr, {
        kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
        target: intent.target,
      });
      reconcileStructuralSelection(view, tr, intent.target, event);
      view.dispatch(tr);
      return true;
    }

    case InteractionDomActivationIntentKind.ObjectShell: {
      if (intent.target.kind !== InteractionTargetKind.Block) return false;
      if (!Number.isInteger(intent.target.pos)) return false;

      event?.preventDefault();
      view.focus();
      const tr = setInteractionOwnerCommandMeta(view.state.tr, {
        kind: InteractionOwnerCommandKind.SelectObjectTarget,
        target: intent.target,
      });
      if (!setObjectSelectionInTransaction(tr, intent.target.pos as number)) {
        return false;
      }
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

function reconcileStructuralSelection(
  view: EditorView,
  tr: Transaction,
  target: InteractionTargetRef,
  event: MouseEvent | undefined,
): void {
  const pos =
    resolveTargetBoundPointerDocumentPos(view, tr, target, event) ??
    (Number.isInteger(target.pos) ? (target.pos as number) : null) ??
    tr.selection.from;
  const range = resolveLiveTargetRange(tr, target);

  if (range) {
    if (setNonDestructiveSelectionNearWithinRangeInTransaction(tr, pos, range)) {
      return;
    }
    clearObjectSelectionToNonDestructiveSelectionInTransaction(tr);
    return;
  }

  if (setNonDestructiveSelectionNearInTransaction(tr, pos)) return;
  clearObjectSelectionToNonDestructiveSelectionInTransaction(tr);
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
