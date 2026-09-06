import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import {
  clearObjectSelectionToNonDestructiveSelectionInTransaction,
  setNonDestructiveSelectionNearInTransaction,
  setNonDestructiveSelectionNearWithinRangeInTransaction,
  setObjectSelectionInTransaction,
} from "@/editor/selection/selection-transactions";
import { setEditorSelectionTransactionMeta } from "@/document/authoring/editor-navigation/editor-selection-origin";

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
  readonly contextOwner?: InteractionTargetRef | null;
}

export type InteractionTargetActivationMode = "object" | "structural";

export interface CreateInteractionTargetActivationTransactionOptions {
  readonly preferredPos?: number | null;
}

/**
 * Canonical non-DOM activation entrypoint. Callers provide a live projected
 * interaction target; this applies the same owner command and selection safety
 * rules as pointer activation without synthesizing an event.
 */
export function createInteractionTargetActivationTransaction(
  state: EditorState,
  target: InteractionTargetRef,
  mode: InteractionTargetActivationMode,
  options: CreateInteractionTargetActivationTransactionOptions = {},
): Transaction | null {
  const tr = state.tr;

  if (mode === "object") {
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

  const range = resolveLiveTargetRange(tr, target);
  const pos = options.preferredPos ?? target.pos ?? tr.selection.from;
  if (range) {
    if (!setNonDestructiveSelectionNearWithinRangeInTransaction(tr, pos, range)) {
      clearObjectSelectionToNonDestructiveSelectionInTransaction(tr);
    }
  } else if (!setNonDestructiveSelectionNearInTransaction(tr, pos)) {
    clearObjectSelectionToNonDestructiveSelectionInTransaction(tr);
  }

  const transaction = setInteractionOwnerCommandMeta(tr, {
    kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
    target,
  });
  const intendedId = EmbeddedNodeIdSchema.safeParse(target.id);
  if (intendedId.success) {
    setEditorSelectionTransactionMeta(transaction, {
      intendedId: intendedId.data,
      origin: "editor",
    });
  }
  return transaction;
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
      const tr = createInteractionTargetActivationTransaction(
        view.state,
        intent.target,
        "structural",
        {
          preferredPos: resolveTargetBoundPointerDocumentPos(
            view,
            view.state.tr,
            intent.target,
            event,
          ),
        },
      );
      if (!tr) return false;
      view.dispatch(tr);
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
