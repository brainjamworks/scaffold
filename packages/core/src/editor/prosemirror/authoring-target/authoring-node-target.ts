import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";

import type { CheckedMutationResult } from "@/document/model/commands/checked-transactions";
import {
  resolveStableNode,
  type ResolvedStableNode,
  type StableNodeIdentity,
  type StableNodeResolution,
} from "@/document/model/identity/resolve-stable-node";

export type AuthoringNodeRef = StableNodeIdentity;
export type ResolvedAuthoringNode = ResolvedStableNode;

export interface AuthoringNodeTarget {
  editor: Editor;
  status: StableNodeResolution["status"];
  read(): ResolvedAuthoringNode | null;
  transact(
    mutation: (
      tr: Transaction,
      target: ResolvedAuthoringNode,
    ) => CheckedMutationResult<Transaction>,
  ): CheckedMutationResult<Transaction>;
}

export function createAuthoringNodeTarget(
  editor: Editor,
  ref: AuthoringNodeRef,
): AuthoringNodeTarget {
  return {
    editor,
    get status() {
      return resolveStableNode(editor.state.doc, ref).status;
    },
    read() {
      if (editor.isDestroyed) return null;
      const resolution = resolveStableNode(editor.state.doc, ref);
      return resolution.status === "ready" ? resolution : null;
    },
    transact(mutation) {
      if (editor.isDestroyed) return destroyedEditorFailure();

      const resolution = resolveStableNode(editor.state.doc, ref);
      if (resolution.status === "missing") return missingTargetFailure();
      if (resolution.status === "invalid") return invalidTargetFailure();

      const result = mutation(editor.state.tr, resolution);
      if (!result.ok) return result;
      if (editor.isDestroyed) return destroyedEditorFailure();

      editor.view.dispatch(result.tr);
      return result;
    },
  };
}

function missingTargetFailure(): CheckedMutationResult<Transaction> {
  return {
    ok: false,
    issue: {
      code: "missing_authoring_target",
      message: "The authoring target no longer exists.",
    },
  };
}

function invalidTargetFailure(): CheckedMutationResult<Transaction> {
  return {
    ok: false,
    issue: {
      code: "invalid_authoring_target",
      message: "The authoring target identity is invalid.",
    },
  };
}

function destroyedEditorFailure(): CheckedMutationResult<Transaction> {
  return {
    ok: false,
    issue: {
      code: "destroyed_authoring_editor",
      message: "The authoring editor has been destroyed.",
    },
  };
}
