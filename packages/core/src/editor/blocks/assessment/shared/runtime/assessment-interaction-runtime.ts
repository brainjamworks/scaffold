import { useMemo, useRef } from "react";

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
  selectedCount: number;
  maxSelections: number | null;
  limitReached: boolean;
  overLimitCount: number;
  isSelected: (choiceId: string) => boolean;
  isChoiceUnavailable: (choiceId: string) => boolean;
  toggle: (choiceId: string) => void;
  select: (choiceId: string) => void;
  stateFor: (choiceId: string) => ChoiceState | null;
}

export interface SequenceInteractionRuntime {
  kind: "sequence";
  order: readonly string[];
  setOrder: (ids: readonly string[]) => void;
  commitOrder: (ids: readonly string[]) => void;
}

export interface MatchInteractionRuntime {
  kind: "match";
  matches: Readonly<Record<string, string>>;
  matchedTargetIds: ReadonlySet<string>;
  selectedTargetFor: (itemId: string) => string | null;
  matchedItemFor: (targetId: string) => string | null;
  setMatch: (itemId: string, targetId: string) => void;
  setMatches: (matches: Readonly<Record<string, string>>) => void;
  removeTargetMatch: (targetId: string) => void;
  clearMatches: () => void;
}

export interface ClassifyInteractionRuntime {
  kind: "classify";
  placements: Readonly<Record<string, string>>;
  selectedCategoryFor: (itemId: string) => string | null;
  setPlacement: (itemId: string, categoryId: string) => void;
  setPlacements: (placements: Readonly<Record<string, string>>) => void;
  removePlacement: (itemId: string) => void;
  clearPlacements: () => void;
}

export interface FillBlanksInteractionRuntime {
  kind: "fill-blanks";
  blanks: Readonly<Record<string, string>>;
  valueFor: (blankId: string) => string;
  setBlank: (blankId: string, value: string) => void;
  commitImmediate: () => void;
  clearBlank: (blankId: string) => void;
  clearBlanks: () => void;
}

export interface SpatialHotspotInteractionRuntime {
  kind: "spatial-hotspot";
  clicks: readonly HotspotClickRecord[];
  capped: boolean;
  addClick: (click: HotspotClickRecord) => ImageHotspotClickChangeStatus;
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
const noopHotspotChange = (): ImageHotspotClickChangeStatus => "locked";

export type ImageHotspotClickChangeStatus = "added" | "duplicate" | "limit" | "locked" | "invalid";

export function resolveImageHotspotClickChange({
  click,
  clicks,
  locked,
  maxClicks,
}: {
  click: HotspotClickRecord;
  clicks: readonly HotspotClickRecord[];
  locked: boolean;
  maxClicks: number | null;
}): { status: ImageHotspotClickChangeStatus; clicks: readonly HotspotClickRecord[] } {
  if (locked) return { status: "locked", clicks };
  if (
    !click.id.trim() ||
    !Number.isFinite(click.x) ||
    click.x < 0 ||
    click.x > 100 ||
    !Number.isFinite(click.y) ||
    click.y < 0 ||
    click.y > 100 ||
    (click.hotspotId !== null && !click.hotspotId.trim()) ||
    clicks.some((current) => current.id === click.id)
  ) {
    return { status: "invalid", clicks };
  }
  if (click.hotspotId !== null && clicks.some((current) => current.hotspotId === click.hotspotId)) {
    return { status: "duplicate", clicks };
  }
  if (maxClicks !== null && clicks.length >= maxClicks) {
    return { status: "limit", clicks };
  }
  return { status: "added", clicks: [...clicks, click] };
}

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

export function choiceStateForProblem({
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

  if (kind === "multi-select" && problem.state.submitted && problem.officialResult?.isCorrect) {
    return "correct";
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
        selectedCount: 0,
        maxSelections: null,
        limitReached: false,
        overLimitCount: 0,
        isSelected: () => false,
        isChoiceUnavailable: () => false,
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
        commitOrder: noop,
      } as unknown as AssessmentInteractionRuntime<K>;
    case "match":
      return {
        kind,
        matches: {},
        matchedTargetIds: emptySelected,
        selectedTargetFor: () => null,
        matchedItemFor: () => null,
        setMatch: noop,
        setMatches: noop,
        removeTargetMatch: noop,
        clearMatches: noop,
      } as unknown as AssessmentInteractionRuntime<K>;
    case "classify":
      return {
        kind,
        placements: {},
        selectedCategoryFor: () => null,
        setPlacement: noop,
        setPlacements: noop,
        removePlacement: noop,
        clearPlacements: noop,
      } as unknown as AssessmentInteractionRuntime<K>;
    case "fill-blanks":
      return {
        kind,
        blanks: {},
        valueFor: () => "",
        setBlank: noop,
        commitImmediate: noop,
        clearBlank: noop,
        clearBlanks: noop,
      } as unknown as AssessmentInteractionRuntime<K>;
    case "spatial-hotspot":
      return {
        kind,
        clicks: [],
        capped: false,
        addClick: noopHotspotChange,
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
  const fillCommitRef = useRef<{ last: string | null; pending: string | null }>({
    last: null,
    pending: null,
  });
  const classifyCommitRef = useRef<{ last: string | null; pending: string | null }>({
    last: null,
    pending: null,
  });
  const matchCommitRef = useRef<{ last: string | null; pending: string | null }>({
    last: null,
    pending: null,
  });

  return useMemo(() => {
    if (!problem) return null;

    const actualKind = problem.state.interactionKind;
    if (expectedKind && actualKind !== expectedKind) {
      throw new Error(
        `Assessment runtime expected "${expectedKind}" interaction for "${facade.authoredBlockId}", but registered "${actualKind}".`,
      );
    }

    const response = problem.state.response;
    const locked = problem.interactionLocked;
    const writeField = (field: string, value: unknown): boolean => {
      if (locked) return false;
      return facade.actions.setLocalResponse({ ...response, [field]: value });
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
        const currentOptionIds = problem.state.currentOptionIds ?? [];
        const currentOptionIdSet = new Set(currentOptionIds);
        const selectedCount = Array.from(selected).filter((id) =>
          currentOptionIdSet.has(id),
        ).length;
        const maxSelections = problem.state.maxSelect;
        const limitReached = maxSelections !== null && selectedCount >= maxSelections;
        const overLimitCount =
          maxSelections === null ? 0 : Math.max(0, selectedCount - maxSelections);
        const changeSelection = (choiceId: string) => {
          const change = resolveMultiSelectChoiceChange({
            choiceId,
            currentOptionIds,
            maxSelections,
            selectedIds,
          });
          if (!change.changed || change.choices === null) return;
          writeField("choices", change.choices);
          checkImmediate();
        };
        return {
          kind: "multi-select",
          inputType: "checkbox",
          selectedIds,
          selected,
          selectedCount,
          maxSelections,
          limitReached,
          overLimitCount,
          isSelected: (choiceId: string) => selected.has(choiceId),
          isChoiceUnavailable: (choiceId: string) =>
            !selected.has(choiceId) && maxSelections !== null && selectedCount >= maxSelections,
          toggle: changeSelection,
          select: changeSelection,
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
          commitOrder: (ids: readonly string[]) => {
            writeField("order", Array.from(ids));
            checkImmediate();
          },
        } as unknown as AssessmentInteractionRuntime<K>;
      }
      case "match": {
        const matches = stringRecord(response["matches"]);
        const matchedTargetIds = new Set(Object.values(matches));
        if (!facade.responseReady && !facade.request) {
          matchCommitRef.current.last = null;
        }
        const writeMatches = (nextMatches: Readonly<Record<string, string>>) => {
          writeField("matches", nextMatches);
        };
        const commitImmediateMatch = (nextMatches: Readonly<Record<string, string>>) => {
          if (
            locked ||
            problem.state.feedbackMode !== "immediate" ||
            facade.request ||
            !facade.capability
          ) {
            return;
          }
          const nextResponse = { ...response, matches: nextMatches };
          if (!facade.capability.hasResponse(nextResponse)) return;
          const fingerprint = JSON.stringify(facade.capability.toContractResponse(nextResponse));
          if (
            matchCommitRef.current.last === fingerprint ||
            matchCommitRef.current.pending !== null
          ) {
            return;
          }
          matchCommitRef.current.pending = fingerprint;
          void facade.actions
            .check()
            .then((result) => {
              if (result) matchCommitRef.current.last = fingerprint;
            })
            .finally(() => {
              if (matchCommitRef.current.pending === fingerprint) {
                matchCommitRef.current.pending = null;
              }
            });
        };
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
            const completed = { ...next, [itemId]: targetId };
            writeMatches(completed);
            commitImmediateMatch(completed);
          },
          setMatches: writeMatches,
          removeTargetMatch: (targetId: string) =>
            writeMatches(
              Object.fromEntries(Object.entries(matches).filter(([, value]) => value !== targetId)),
            ),
          clearMatches: () => writeMatches({}),
        } as unknown as AssessmentInteractionRuntime<K>;
      }
      case "classify": {
        const placements = stringRecord(response["placements"]);
        if (!facade.responseReady && !facade.request) {
          classifyCommitRef.current.last = null;
        }
        const writePlacements = (nextPlacements: Readonly<Record<string, string>>) => {
          writeField("placements", nextPlacements);
        };
        const commitImmediatePlacement = (nextPlacements: Readonly<Record<string, string>>) => {
          if (
            locked ||
            problem.state.feedbackMode !== "immediate" ||
            facade.request ||
            !facade.capability
          ) {
            return;
          }
          const nextResponse = { ...response, placements: nextPlacements };
          if (!facade.capability.hasResponse(nextResponse)) return;
          const fingerprint = JSON.stringify(facade.capability.toContractResponse(nextResponse));
          if (
            classifyCommitRef.current.last === fingerprint ||
            classifyCommitRef.current.pending !== null
          ) {
            return;
          }
          classifyCommitRef.current.pending = fingerprint;
          void facade.actions
            .check()
            .then((result) => {
              if (result) classifyCommitRef.current.last = fingerprint;
            })
            .finally(() => {
              if (classifyCommitRef.current.pending === fingerprint) {
                classifyCommitRef.current.pending = null;
              }
            });
        };
        return {
          kind: "classify",
          placements,
          selectedCategoryFor: (itemId: string) => placements[itemId] ?? null,
          setPlacement: (itemId: string, categoryId: string) => {
            const next = { ...placements, [itemId]: categoryId };
            writePlacements(next);
            commitImmediatePlacement(next);
          },
          setPlacements: writePlacements,
          removePlacement: (itemId: string) =>
            writePlacements(
              Object.fromEntries(Object.entries(placements).filter(([id]) => id !== itemId)),
            ),
          clearPlacements: () => writePlacements({}),
        } as unknown as AssessmentInteractionRuntime<K>;
      }
      case "fill-blanks": {
        const blanks = stringRecord(response["blanks"]);
        if (!facade.responseReady && !facade.request) {
          fillCommitRef.current.last = null;
        }
        const commitImmediate = () => {
          if (
            locked ||
            problem.state.feedbackMode !== "immediate" ||
            !facade.responseReady ||
            facade.request
          ) {
            return;
          }
          const canonical = facade.capability?.toContractResponse({ blanks });
          if (!canonical) return;
          const fingerprint = JSON.stringify(canonical);
          if (
            fillCommitRef.current.last === fingerprint ||
            fillCommitRef.current.pending !== null
          ) {
            return;
          }
          fillCommitRef.current.pending = fingerprint;
          void facade.actions
            .check()
            .then((result) => {
              if (result) fillCommitRef.current.last = fingerprint;
            })
            .finally(() => {
              if (fillCommitRef.current.pending === fingerprint) {
                fillCommitRef.current.pending = null;
              }
            });
        };
        return {
          kind: "fill-blanks",
          blanks,
          valueFor: (blankId: string) => blanks[blankId] ?? "",
          setBlank: (blankId: string, value: string) => {
            const next = { ...blanks, [blankId]: value };
            if (!value) delete next[blankId];
            writeField("blanks", next);
          },
          commitImmediate,
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
        const maxClicks = problem.state.maxSelect;
        const capped = maxClicks !== null && clicks.length >= maxClicks;
        return {
          kind: "spatial-hotspot",
          clicks,
          capped,
          addClick: (click: HotspotClickRecord) => {
            const change = resolveImageHotspotClickChange({
              click,
              clicks,
              locked,
              maxClicks,
            });
            if (change.status !== "added") return change.status;
            if (!writeField("clicks", change.clicks)) return "invalid";
            checkImmediate();
            return "added";
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

export function resolveMultiSelectChoiceChange({
  choiceId,
  currentOptionIds,
  maxSelections,
  selectedIds,
}: {
  choiceId: string;
  currentOptionIds: readonly string[];
  maxSelections: number | null;
  selectedIds: readonly string[];
}): { changed: boolean; choices: string[] | null } {
  const currentOptionIdSet = new Set(currentOptionIds);
  if (!currentOptionIdSet.has(choiceId)) return { changed: false, choices: null };

  const next = new Set(selectedIds.filter((id) => currentOptionIdSet.has(id)));
  if (next.has(choiceId)) {
    next.delete(choiceId);
    return { changed: true, choices: Array.from(next) };
  }
  if (maxSelections !== null && next.size >= maxSelections) {
    return { changed: false, choices: null };
  }
  next.add(choiceId);
  return { changed: true, choices: Array.from(next) };
}

export function describeMultiSelectLimitState({
  maxSelections,
  selectedCount,
}: {
  maxSelections: number | null;
  selectedCount: number;
}): string | null {
  if (maxSelections === null || selectedCount < maxSelections) return null;
  const excess = selectedCount - maxSelections;
  if (excess > 0) {
    return `Remove ${excess} ${excess === 1 ? "selection" : "selections"} to continue.`;
  }
  return `Maximum ${maxSelections} selected. Deselect an option before choosing another.`;
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
