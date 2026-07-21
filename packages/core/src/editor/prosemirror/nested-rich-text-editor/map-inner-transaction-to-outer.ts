import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Step, StepMap } from "@tiptap/pm/transform";

export const NESTED_RICH_TEXT_EXTERNAL_SYNC_META = "scaffold.nestedRichText.externalSync";

export type MapInnerTransactionToOuterResult =
  | {
      status: "mapped";
      transaction: Transaction;
    }
  | {
      status: "ignored";
      reason: "externalSync" | "unchanged";
    }
  | {
      status: "failed";
      reason: "stalePosition" | "stepMappingFailed" | "stepApplicationFailed";
    };

export interface MapInnerTransactionToOuterOptions {
  innerTransaction: Transaction;
  outerState: EditorState;
  getPos: () => number | undefined;
}

export function mapInnerTransactionToOuter({
  innerTransaction,
  outerState,
  getPos,
}: MapInnerTransactionToOuterOptions): MapInnerTransactionToOuterResult {
  if (innerTransaction.getMeta(NESTED_RICH_TEXT_EXTERNAL_SYNC_META)) {
    return { status: "ignored", reason: "externalSync" };
  }

  if (innerTransaction.steps.length === 0) {
    return { status: "ignored", reason: "unchanged" };
  }

  const outerNodePos = safeGetPos(getPos);
  if (typeof outerNodePos !== "number" || !Number.isInteger(outerNodePos) || outerNodePos < 0) {
    return { status: "failed", reason: "stalePosition" };
  }

  if (!outerState.doc.nodeAt(outerNodePos)) {
    return { status: "failed", reason: "stalePosition" };
  }

  const contentOffset = outerNodePos + 1;
  const offsetMap = StepMap.offset(contentOffset);
  const mappedSteps: Step[] = [];

  for (const step of innerTransaction.steps) {
    const mappedStep = step.map(offsetMap);
    if (!mappedStep) {
      return { status: "failed", reason: "stepMappingFailed" };
    }
    try {
      mappedSteps.push(Step.fromJSON(outerState.schema, mappedStep.toJSON()));
    } catch {
      return { status: "failed", reason: "stepMappingFailed" };
    }
  }

  const outerTransaction = outerState.tr;
  try {
    for (const step of mappedSteps) {
      outerTransaction.step(step);
    }
  } catch {
    return { status: "failed", reason: "stepApplicationFailed" };
  }

  return {
    status: "mapped",
    transaction: outerTransaction,
  };
}

function safeGetPos(getPos: () => number | undefined): number | undefined {
  try {
    return getPos();
  } catch {
    return undefined;
  }
}
