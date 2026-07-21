import { useMemo } from "react";

import {
  MultiSelectAssessmentSchema,
  SingleSelectAssessmentSchema,
  type AssessmentInteractionKind,
} from "@scaffold/contracts";

import type { AssessmentProblemFacade } from "@/runtime/assessment/runtime-facade";
import type { AnswerReveal, ProblemScope } from "./use-assessment-runtime";
import type { ChoiceState } from "./types";

export interface HotspotClickRecord {
  id: string;
  x: number;
  y: number;
  hotspotId: string | null;
}

export interface SingleSelectInteractionRuntime {
  kind: "single-select";
  inputType: "radio";
  selectedIds: readonly string[];
  selected: ReadonlySet<string>;
  isSelected: (choiceId: string) => boolean;
  select: (choiceId: string) => void;
  revealedSelectedId: string | null;
  stateFor: (choiceId: string) => ChoiceState | null;
}

export interface MultiSelectInteractionRuntime {
  kind: "multi-select";
  inputType: "checkbox";
  selectedIds: readonly string[];
  selected: ReadonlySet<string>;
  isSelected: (choiceId: string) => boolean;
  toggle: (choiceId: string) => void;
  select: (choiceId: string) => void;
  stateFor: (choiceId: string) => ChoiceState | null;
}

export interface SequenceInteractionRuntime {
  kind: "sequence";
  order: readonly string[];
  setOrder: (ids: readonly string[]) => void;
}

export interface MatchInteractionRuntime {
  kind: "match";
  matches: Readonly<Record<string, string>>;
  matchedTargetIds: ReadonlySet<string>;
  selectedTargetFor: (itemId: string) => string | null;
  matchedItemFor: (targetId: string) => string | null;
  setMatch: (itemId: string, targetId: string) => void;
  removeTargetMatch: (targetId: string) => void;
  clearMatches: () => void;
}

export interface ClassifyInteractionRuntime {
  kind: "classify";
  placements: Readonly<Record<string, string>>;
  selectedBinFor: (itemId: string) => string | null;
  setPlacement: (itemId: string, binId: string) => void;
  removePlacement: (itemId: string) => void;
  clearPlacements: () => void;
}

export interface FillBlanksInteractionRuntime {
  kind: "fill-blanks";
  blanks: Readonly<Record<string, string>>;
  valueFor: (blankId: string) => string;
  setBlank: (blankId: string, value: string) => void;
  clearBlank: (blankId: string) => void;
  clearBlanks: () => void;
}

export interface SpatialHotspotInteractionRuntime {
  kind: "spatial-hotspot";
  clicks: readonly HotspotClickRecord[];
  capped: boolean;
  addClick: (click: HotspotClickRecord) => void;
  removeClick: (clickId: string) => void;
  clearClicks: () => void;
}

export interface AssessmentInteractionRuntimeMap {
  "single-select": SingleSelectInteractionRuntime;
  "multi-select": MultiSelectInteractionRuntime;
  sequence: SequenceInteractionRuntime;
  match: MatchInteractionRuntime;
  classify: ClassifyInteractionRuntime;
  "fill-blanks": FillBlanksInteractionRuntime;
  "spatial-hotspot": SpatialHotspotInteractionRuntime;
}

export type AssessmentInteractionRuntime<
  K extends AssessmentInteractionKind = AssessmentInteractionKind,
> = K extends AssessmentInteractionKind ? AssessmentInteractionRuntimeMap[K] : never;

const emptySelected = new Set<string>();

const noop = () => {};

function canShowAnswerKey(problem: ProblemScope): boolean {
  return problem.answerKeyVisible;
}

function correctChoiceIdsFromReveal(
  kind: "single-select" | "multi-select",
  reveal: AnswerReveal | null,
): ReadonlySet<string> {
  if (!reveal) return emptySelected;

  if (kind === "single-select") {
    const parsed = SingleSelectAssessmentSchema.safeParse(reveal.answers);
    const correctOptionId = parsed.success ? parsed.data.correctOptionId : null;
    return correctOptionId ? new Set([correctOptionId]) : emptySelected;
  }

  const parsed = MultiSelectAssessmentSchema.safeParse(reveal.answers);
  return parsed.success ? new Set(parsed.data.correctOptionIds) : emptySelected;
}

function firstChoiceId(ids: ReadonlySet<string>): string | null {
  for (const id of ids) return id;
  return null;
}

function choiceStateForProblem({
  choiceId,
  kind,
  problem,
  selected,
}: {
  choiceId: string;
  kind: "single-select" | "multi-select";
  problem: ProblemScope;
  selected: ReadonlySet<string>;
}): ChoiceState | null {
  const selectedForChoice = selected.has(choiceId);
  const detail = problem.feedbackResult?.items?.[choiceId] ?? null;
  const answerKeyVisible = canShowAnswerKey(problem);
  const revealedCorrectIds = answerKeyVisible
    ? correctChoiceIdsFromReveal(kind, problem.state.revealedAnswer)
    : emptySelected;
  const feedbackExpected =
    answerKeyVisible && revealedCorrectIds.size === 0 && detail?.expected === true;

  if (answerKeyVisible && (revealedCorrectIds.has(choiceId) || feedbackExpected)) {
    return selectedForChoice ? "correct" : "missed";
  }

  if (!selectedForChoice) return null;
  if (detail) return detail.correct ? "correct" : "incorrect";

  if (kind === "single-select" && problem.state.submitted && problem.officialResult) {
    return problem.officialResult.isCorrect ? "correct" : "incorrect";
  }

  return null;
}

export function createPendingAssessmentInteractionRuntime<K extends AssessmentInteractionKind>(
  kind: K,
): AssessmentInteractionRuntime<K> {
  switch (kind) {
    case "single-select":
      return {
        kind,
        inputType: "radio",
        selectedIds: [],
        selected: emptySelected,
        isSelected: () => false,
        select: noop,
        revealedSelectedId: null,
        stateFor: () => null,
      } as unknown as AssessmentInteractionRuntime<K>;
    case "multi-select":
      return {
        kind,
        inputType: "checkbox",
        selectedIds: [],
        selected: emptySelected,
        isSelected: () => false,
        toggle: noop,
        select: noop,
        stateFor: () => null,
      } as unknown as AssessmentInteractionRuntime<K>;
    case "sequence":
      return {
        kind,
        order: [],
        setOrder: noop,
      } as unknown as AssessmentInteractionRuntime<K>;
    case "match":
      return {
        kind,
        matches: {},
        matchedTargetIds: emptySelected,
        selectedTargetFor: () => null,
        matchedItemFor: () => null,
        setMatch: noop,
        removeTargetMatch: noop,
        clearMatches: noop,
      } as unknown as AssessmentInteractionRuntime<K>;
    case "classify":
      return {
        kind,
        placements: {},
        selectedBinFor: () => null,
        setPlacement: noop,
        removePlacement: noop,
        clearPlacements: noop,
      } as unknown as AssessmentInteractionRuntime<K>;
    case "fill-blanks":
      return {
        kind,
        blanks: {},
        valueFor: () => "",
        setBlank: noop,
        clearBlank: noop,
        clearBlanks: noop,
      } as unknown as AssessmentInteractionRuntime<K>;
    case "spatial-hotspot":
      return {
        kind,
        clicks: [],
        capped: false,
        addClick: noop,
        removeClick: noop,
        clearClicks: noop,
      } as unknown as AssessmentInteractionRuntime<K>;
  }
}

export function useAssessmentInteractionRuntime(
  facade: AssessmentProblemFacade,
  problem: ProblemScope | null,
): AssessmentInteractionRuntime | null;
export function useAssessmentInteractionRuntime<K extends AssessmentInteractionKind>(
  facade: AssessmentProblemFacade,
  problem: ProblemScope | null,
  expectedKind: K,
): AssessmentInteractionRuntime<K> | null;
export function useAssessmentInteractionRuntime<K extends AssessmentInteractionKind>(
  facade: AssessmentProblemFacade,
  problem: ProblemScope | null,
  expectedKind: K | undefined,
): AssessmentInteractionRuntime<K> | null;
export function useAssessmentInteractionRuntime<K extends AssessmentInteractionKind>(
  facade: AssessmentProblemFacade,
  problem: ProblemScope | null,
  expectedKind?: K,
): AssessmentInteractionRuntime<K> | null {
  return useMemo(() => {
    if (!problem) return null;

    const actualKind = problem.state.interactionKind;
    if (expectedKind && actualKind !== expectedKind) {
      throw new Error(
        `Assessment runtime expected "${expectedKind}" interaction for "${facade.authoredProblemId}", but registered "${actualKind}".`,
      );
    }

    const response = problem.state.response;
    const locked =
      problem.state.submitted || problem.exhausted || problem.state.revealedAnswer !== null;
    const writeField = (field: string, value: unknown) => {
      if (locked) return;
      facade.actions.setLocalResponse({ ...response, [field]: value });
    };
    const checkImmediate = () => {
      if (problem.state.feedbackMode === "immediate") void facade.actions.check();
    };

    switch (actualKind) {
      case "single-select": {
        const selectedId = typeof response["choices"] === "string" ? response["choices"] : null;
        const selectedIds = selectedId ? [selectedId] : [];
        const selected = new Set(selectedIds);
        const revealedCorrectIds = correctChoiceIdsFromReveal(
          "single-select",
          problem.state.revealedAnswer,
        );
        return {
          kind: "single-select",
          inputType: "radio",
          selectedIds,
          selected,
          isSelected: (choiceId: string) => selected.has(choiceId),
          select: (choiceId: string) => {
            writeField("choices", choiceId);
            checkImmediate();
          },
          revealedSelectedId: firstChoiceId(revealedCorrectIds),
          stateFor: (choiceId: string) =>
            choiceStateForProblem({
              choiceId,
              kind: "single-select",
              problem,
              selected,
            }),
        } as unknown as AssessmentInteractionRuntime<K>;
      }
      case "multi-select": {
        const selectedIds = stringArray(response["choices"]);
        const selected = new Set(selectedIds);
        return {
          kind: "multi-select",
          inputType: "checkbox",
          selectedIds,
          selected,
          isSelected: (choiceId: string) => selected.has(choiceId),
          toggle: (choiceId: string) => {
            const next = new Set(selectedIds);
            if (next.has(choiceId)) next.delete(choiceId);
            else if (problem.state.maxSelect === null || next.size < problem.state.maxSelect) {
              next.add(choiceId);
            }
            writeField("choices", Array.from(next));
            checkImmediate();
          },
          select: (choiceId: string) => {
            const next = new Set(selectedIds);
            if (next.has(choiceId)) next.delete(choiceId);
            else if (problem.state.maxSelect === null || next.size < problem.state.maxSelect) {
              next.add(choiceId);
            }
            writeField("choices", Array.from(next));
            checkImmediate();
          },
          stateFor: (choiceId: string) =>
            choiceStateForProblem({
              choiceId,
              kind: "multi-select",
              problem,
              selected,
            }),
        } as unknown as AssessmentInteractionRuntime<K>;
      }
      case "sequence": {
        const order = stringArray(response["order"]);
        return {
          kind: "sequence",
          order,
          setOrder: (ids: readonly string[]) => writeField("order", Array.from(ids)),
        } as unknown as AssessmentInteractionRuntime<K>;
      }
      case "match": {
        const matches = stringRecord(response["matches"]);
        const matchedTargetIds = new Set(Object.values(matches));
        return {
          kind: "match",
          matches,
          matchedTargetIds,
          selectedTargetFor: (itemId: string) => matches[itemId] ?? null,
          matchedItemFor: (targetId: string) =>
            Object.entries(matches).find(([, value]) => value === targetId)?.[0] ?? null,
          setMatch: (itemId: string, targetId: string) => {
            const next = Object.fromEntries(
              Object.entries(matches).filter(
                ([currentItemId, currentTargetId]) =>
                  currentItemId !== itemId && currentTargetId !== targetId,
              ),
            );
            writeField("matches", { ...next, [itemId]: targetId });
            checkImmediate();
          },
          removeTargetMatch: (targetId: string) =>
            writeField(
              "matches",
              Object.fromEntries(Object.entries(matches).filter(([, value]) => value !== targetId)),
            ),
          clearMatches: () => writeField("matches", {}),
        } as unknown as AssessmentInteractionRuntime<K>;
      }
      case "classify": {
        const placements = stringRecord(response["placements"]);
        return {
          kind: "classify",
          placements,
          selectedBinFor: (itemId: string) => placements[itemId] ?? null,
          setPlacement: (itemId: string, binId: string) => {
            writeField("placements", { ...placements, [itemId]: binId });
            checkImmediate();
          },
          removePlacement: (itemId: string) =>
            writeField(
              "placements",
              Object.fromEntries(Object.entries(placements).filter(([id]) => id !== itemId)),
            ),
          clearPlacements: () => writeField("placements", {}),
        } as unknown as AssessmentInteractionRuntime<K>;
      }
      case "fill-blanks": {
        const blanks = stringRecord(response["blanks"]);
        return {
          kind: "fill-blanks",
          blanks,
          valueFor: (blankId: string) => blanks[blankId] ?? "",
          setBlank: (blankId: string, value: string) => {
            const next = { ...blanks, [blankId]: value };
            if (!value) delete next[blankId];
            writeField("blanks", next);
            checkImmediate();
          },
          clearBlank: (blankId: string) => {
            const next = { ...blanks };
            delete next[blankId];
            writeField("blanks", next);
          },
          clearBlanks: () => writeField("blanks", {}),
        } as unknown as AssessmentInteractionRuntime<K>;
      }
      case "spatial-hotspot": {
        const clicks = clickArray(response["clicks"]);
        const capped = problem.state.maxSelect !== null && clicks.length >= problem.state.maxSelect;
        return {
          kind: "spatial-hotspot",
          clicks,
          capped,
          addClick: (click: HotspotClickRecord) => {
            if (capped) return;
            writeField("clicks", [...clicks, click]);
            checkImmediate();
          },
          removeClick: (clickId: string) =>
            writeField(
              "clicks",
              clicks.filter((click) => click.id !== clickId),
            ),
          clearClicks: () => writeField("clicks", []),
        } as unknown as AssessmentInteractionRuntime<K>;
      }
    }
  }, [expectedKind, facade, problem]);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function clickArray(value: unknown): HotspotClickRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is HotspotClickRecord => {
    if (!item || typeof item !== "object") return false;
    const click = item as Record<string, unknown>;
    return (
      typeof click["id"] === "string" &&
      typeof click["x"] === "number" &&
      typeof click["y"] === "number" &&
      (click["hotspotId"] === null || typeof click["hotspotId"] === "string")
    );
  });
}
