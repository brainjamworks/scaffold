import type {
  AssessmentFeedbackContent,
  AssessmentItemDetail,
  AssessmentResponseValue,
  AssessmentResult,
  AssessmentTargetContract,
  Score,
} from "@scaffold/contracts";

const EMPTY_RESULT: AssessmentResult = {
  score: { scaled: 0 },
  isCorrect: false,
  feedback: null,
  items: {},
};

export function gradeAssessment(
  target: AssessmentTargetContract | null | undefined,
  response: AssessmentResponseValue | null | undefined,
): AssessmentResult {
  if (!target || !response) return EMPTY_RESULT;

  switch (target.assessment.kind) {
    case "single-select":
      if (response.kind !== "single-select" || !hasTargetKind(target, "single-select")) {
        return EMPTY_RESULT;
      }
      return gradeSingleSelect(target, response);
    case "multi-select":
      if (response.kind !== "multi-select" || !hasTargetKind(target, "multi-select")) {
        return EMPTY_RESULT;
      }
      return gradeMultiSelect(target, response);
    case "sequence":
      if (response.kind !== "sequence" || !hasTargetKind(target, "sequence")) {
        return EMPTY_RESULT;
      }
      return gradeSequence(target, response);
    case "match":
      if (response.kind !== "match" || !hasTargetKind(target, "match")) {
        return EMPTY_RESULT;
      }
      return gradeMatch(target, response);
    case "classify":
      if (response.kind !== "classify" || !hasTargetKind(target, "classify")) {
        return EMPTY_RESULT;
      }
      return gradeClassify(target, response);
    case "fill-blanks":
      if (response.kind !== "fill-blanks" || !hasTargetKind(target, "fill-blanks")) {
        return EMPTY_RESULT;
      }
      return gradeFillBlanks(target, response);
    case "spatial-hotspot":
      if (response.kind !== "spatial-hotspot" || !hasTargetKind(target, "spatial-hotspot")) {
        return EMPTY_RESULT;
      }
      return gradeSpatialHotspot(target, response);
  }
}

function gradeSingleSelect(
  target: ExtractTarget<"single-select">,
  response: ExtractResponse<"single-select">,
): AssessmentResult {
  const correctOptionId = target.assessment.correctOptionId;
  const given = response.optionId;
  const isCorrect = Boolean(correctOptionId && given === correctOptionId);
  const items: Record<string, AssessmentItemDetail> = {};

  for (const option of target.interaction.options) {
    const expected = option.id === correctOptionId;
    const selected = option.id === given;
    items[option.id] = {
      correct: selected && expected,
      expected,
      given: selected,
      ...feedbackFor(target.assessment.feedbackByOptionId, option.id),
    };
  }

  return {
    score: countScore(isCorrect ? 1 : 0, 1),
    isCorrect,
    feedback: summaryFeedbackFor(target),
    items,
  };
}

function gradeMultiSelect(
  target: ExtractTarget<"multi-select">,
  response: ExtractResponse<"multi-select">,
): AssessmentResult {
  const correctIds = new Set(target.assessment.correctOptionIds);
  const picked = new Set(response.optionIds);
  const items: Record<string, AssessmentItemDetail> = {};

  for (const option of target.interaction.options) {
    const expected = correctIds.has(option.id);
    const given = picked.has(option.id);
    items[option.id] = {
      correct: expected === given,
      expected,
      given,
      ...feedbackFor(target.assessment.feedbackByOptionId, option.id),
    };
  }

  if (correctIds.size === 0) {
    return {
      score: { scaled: 0 },
      isCorrect: false,
      feedback: summaryFeedbackFor(target),
      items,
    };
  }

  const exactMatch =
    picked.size === correctIds.size && [...correctIds].every((id) => picked.has(id));

  if (exactMatch) {
    return {
      score: countScore(correctIds.size, correctIds.size),
      isCorrect: true,
      feedback: summaryFeedbackFor(target),
      items,
    };
  }

  const correctPicks = [...picked].filter((id) => correctIds.has(id)).length;
  const wrongPicks = [...picked].filter((id) => !correctIds.has(id)).length;
  const earnedUnits = Math.max(0, correctPicks - wrongPicks);

  return {
    score: countScore(earnedUnits, correctIds.size),
    isCorrect: false,
    feedback: summaryFeedbackFor(target),
    items,
  };
}

function gradeSequence(
  target: ExtractTarget<"sequence">,
  response: ExtractResponse<"sequence">,
): AssessmentResult {
  const expected = target.assessment.correctOrder;
  const given = response.orderedItemIds;
  const items: Record<string, AssessmentItemDetail> = {};

  if (expected.length === 0) {
    return {
      score: { scaled: 0 },
      isCorrect: false,
      feedback: summaryFeedbackFor(target),
      items,
    };
  }

  const givenIndex = new Map<string, number>();
  given.forEach((id, index) => {
    if (!givenIndex.has(id)) givenIndex.set(id, index);
  });

  let correctCount = 0;
  expected.forEach((id, expectedIndex) => {
    const actualIndex = givenIndex.get(id);
    const correct = actualIndex === expectedIndex;
    if (correct) correctCount += 1;
    items[id] = {
      correct,
      expected: expectedIndex,
      ...(actualIndex === undefined ? {} : { given: actualIndex }),
      ...feedbackFor(target.assessment.feedbackByItemId, id),
    };
  });

  const sameSet =
    expected.length === given.length &&
    expected.every((id) => givenIndex.has(id)) &&
    given.every((id) => expected.includes(id));
  const isCorrect = sameSet && correctCount === expected.length;

  return {
    score: countScore(isCorrect ? expected.length : correctCount, expected.length),
    isCorrect,
    feedback: summaryFeedbackFor(target),
    items,
  };
}

function gradeMatch(
  target: ExtractTarget<"match">,
  response: ExtractResponse<"match">,
): AssessmentResult {
  const pairs = target.assessment.correctPairs;
  const items: Record<string, AssessmentItemDetail> = {};
  const interactionItemIds = target.interaction.items.map((item) => item.id);
  const interactionTargetIds = target.interaction.targets.map((item) => item.id);
  const interactionItemIdSet = new Set(interactionItemIds);
  const interactionTargetIdSet = new Set(interactionTargetIds);
  const expectedItemIds = pairs.map((pair) => pair.itemId);
  const expectedTargetIds = pairs.map((pair) => pair.targetId);
  const responseItemIds = response.pairs.map((pair) => pair.itemId);
  const responseTargetIds = response.pairs.map((pair) => pair.targetId);
  const interactionIsExact =
    interactionItemIds.length > 0 &&
    interactionItemIds.length === interactionTargetIds.length &&
    interactionItemIds.every((id) => id.trim().length > 0) &&
    interactionTargetIds.every((id) => id.trim().length > 0) &&
    interactionItemIdSet.size === interactionItemIds.length &&
    interactionTargetIdSet.size === interactionTargetIds.length;
  const expectedIsExact =
    interactionIsExact &&
    pairs.length === interactionItemIds.length &&
    new Set(expectedItemIds).size === expectedItemIds.length &&
    new Set(expectedTargetIds).size === expectedTargetIds.length &&
    pairs.every(
      ({ itemId, targetId }) =>
        interactionItemIdSet.has(itemId) && interactionTargetIdSet.has(targetId),
    );
  const responseIsExact =
    response.pairs.length === interactionItemIds.length &&
    new Set(responseItemIds).size === responseItemIds.length &&
    new Set(responseTargetIds).size === responseTargetIds.length &&
    response.pairs.every(
      ({ itemId, targetId }) =>
        interactionItemIdSet.has(itemId) && interactionTargetIdSet.has(targetId),
    );
  const givenByItem = new Map<string, string>();
  for (const pair of response.pairs) {
    if (!givenByItem.has(pair.itemId)) givenByItem.set(pair.itemId, pair.targetId);
  }

  if (pairs.length === 0) {
    return {
      score: { scaled: 0 },
      isCorrect: false,
      feedback: summaryFeedbackFor(target),
      items,
    };
  }

  let correctCount = 0;
  for (const pair of pairs) {
    const given = givenByItem.get(pair.itemId);
    const correct = given === pair.targetId;
    if (correct) correctCount += 1;
    items[pair.itemId] = {
      correct,
      expected: pair.targetId,
      ...(given === undefined ? {} : { given }),
      ...feedbackFor(target.assessment.feedbackByItemId, pair.itemId),
    };
  }

  return {
    score: countScore(correctCount, pairs.length),
    isCorrect: expectedIsExact && responseIsExact && correctCount === pairs.length,
    feedback: summaryFeedbackFor(target),
    items,
  };
}

function gradeClassify(
  target: ExtractTarget<"classify">,
  response: ExtractResponse<"classify">,
): AssessmentResult {
  const placements = target.assessment.correctPlacements;
  const items: Record<string, AssessmentItemDetail> = {};
  const interactionItemIds = target.interaction.items.map((item) => item.id);
  const interactionCategoryIds = target.interaction.categories.map((category) => category.id);
  const interactionItemIdSet = new Set(interactionItemIds);
  const interactionCategoryIdSet = new Set(interactionCategoryIds);
  const expectedItemIds = placements.map((placement) => placement.itemId);
  const responseItemIds = response.placements.map((placement) => placement.itemId);
  const expectedIsExact =
    interactionItemIds.every((id) => id.trim().length > 0) &&
    interactionCategoryIds.every((id) => id.trim().length > 0) &&
    new Set(interactionItemIds).size === interactionItemIds.length &&
    new Set(interactionCategoryIds).size === interactionCategoryIds.length &&
    placements.length === interactionItemIds.length &&
    new Set(expectedItemIds).size === expectedItemIds.length &&
    placements.every(
      ({ itemId, categoryId }) =>
        interactionItemIdSet.has(itemId) && interactionCategoryIdSet.has(categoryId),
    );
  const responseIsExact =
    response.placements.length === interactionItemIds.length &&
    new Set(responseItemIds).size === responseItemIds.length &&
    response.placements.every(
      ({ itemId, categoryId }) =>
        interactionItemIdSet.has(itemId) && interactionCategoryIdSet.has(categoryId),
    );
  const givenByItem = new Map<string, string>();
  for (const placement of response.placements) {
    if (!givenByItem.has(placement.itemId)) {
      givenByItem.set(placement.itemId, placement.categoryId);
    }
  }

  if (placements.length === 0) {
    return {
      score: { scaled: 0 },
      isCorrect: false,
      feedback: summaryFeedbackFor(target),
      items,
    };
  }

  let correctCount = 0;
  for (const placement of placements) {
    const given = givenByItem.get(placement.itemId);
    const correct = given === placement.categoryId;
    if (correct) correctCount += 1;
    items[placement.itemId] = {
      correct,
      expected: placement.categoryId,
      ...(given === undefined ? {} : { given }),
      ...feedbackFor(target.assessment.feedbackByItemId, placement.itemId),
    };
  }

  return {
    score: countScore(correctCount, placements.length),
    isCorrect: expectedIsExact && responseIsExact && correctCount === placements.length,
    feedback: summaryFeedbackFor(target),
    items,
  };
}

function gradeFillBlanks(
  target: ExtractTarget<"fill-blanks">,
  response: ExtractResponse<"fill-blanks">,
): AssessmentResult {
  const givenByBlank = new Map(response.blanks.map((blank) => [blank.blankId, blank.value]));
  const blanks = target.assessment.blanks;
  const items: Record<string, AssessmentItemDetail> = {};

  if (blanks.length === 0) {
    return {
      score: { scaled: 0 },
      isCorrect: false,
      feedback: summaryFeedbackFor(target),
      items,
    };
  }

  let correctCount = 0;
  for (const blank of blanks) {
    const accepted = blank.acceptedAnswers.filter((answer) => answer.trim().length > 0);
    const given = givenByBlank.get(blank.blankId) ?? "";
    const normalizedGiven = normalizeBlankValue(given, blank);
    const correct =
      accepted.length > 0 &&
      accepted.some((answer) => normalizeBlankValue(answer, blank) === normalizedGiven);

    if (correct) correctCount += 1;
    items[blank.blankId] = {
      correct,
      expected: accepted,
      ...(given === "" ? {} : { given }),
      ...feedbackFor(target.assessment.feedbackByBlankId, blank.blankId),
    };
  }

  return {
    score: countScore(correctCount, blanks.length),
    isCorrect: correctCount === blanks.length,
    feedback: summaryFeedbackFor(target),
    items,
  };
}

function gradeSpatialHotspot(
  target: ExtractTarget<"spatial-hotspot">,
  response: ExtractResponse<"spatial-hotspot">,
): AssessmentResult {
  const hotspotIds = target.interaction.hotspots.map((hotspot) => hotspot.id);
  const hotspotIdSet = new Set(hotspotIds);
  const correctIds = new Set(target.assessment.correctHotspotIds);
  const selectedCurrentIds = response.selections.flatMap((selection) =>
    selection.hotspotId && hotspotIdSet.has(selection.hotspotId) ? [selection.hotspotId] : [],
  );
  const selectedIds = new Set(selectedCurrentIds);
  const items: Record<string, AssessmentItemDetail> = {};

  if (hotspotIds.length === 0) {
    return {
      score: { scaled: 0 },
      isCorrect: false,
      feedback: summaryFeedbackFor(target),
      items,
    };
  }

  for (const hotspotId of hotspotIds) {
    const expected = correctIds.has(hotspotId);
    const given = selectedIds.has(hotspotId);
    const correct = expected === given;
    items[hotspotId] = {
      correct,
      expected,
      given,
      ...feedbackFor(target.assessment.feedbackByHotspotId, hotspotId),
    };
  }

  const correctSelections = [...selectedIds].filter((id) => correctIds.has(id)).length;
  const allCorrect =
    response.selections.length === correctIds.size &&
    selectedCurrentIds.length === response.selections.length &&
    selectedIds.size === response.selections.length &&
    correctSelections === correctIds.size;
  const partialCreditDenominator = Math.max(correctIds.size, response.selections.length);
  return {
    score:
      target.assessment.gradingMode === "all-or-nothing"
        ? countScore(allCorrect ? 1 : 0, 1)
        : correctIds.size === 0 || partialCreditDenominator === 0
          ? countScore(0, 1)
          : countScore(correctSelections, partialCreditDenominator),
    isCorrect: allCorrect,
    feedback: summaryFeedbackFor(target),
    items,
  };
}

function countScore(raw: number, max: number): Score {
  return { scaled: raw / max, raw, min: 0, max };
}

type ExtractTarget<Kind extends AssessmentTargetContract["interaction"]["kind"]> =
  AssessmentTargetContract & {
    interaction: Extract<AssessmentTargetContract["interaction"], { kind: Kind }>;
    assessment: Extract<AssessmentTargetContract["assessment"], { kind: Kind }>;
  };

type ExtractResponse<Kind extends AssessmentResponseValue["kind"]> = Extract<
  AssessmentResponseValue,
  { kind: Kind }
>;

function hasTargetKind<Kind extends AssessmentTargetContract["interaction"]["kind"]>(
  target: AssessmentTargetContract,
  kind: Kind,
): target is ExtractTarget<Kind> {
  return target.interaction.kind === kind && target.assessment.kind === kind;
}

function normalizeBlankValue(
  value: string,
  meta: {
    caseSensitive?: boolean;
    trimWhitespace?: boolean;
  },
): string {
  const trimmed = meta.trimWhitespace === false ? value : value.trim();
  return meta.caseSensitive ? trimmed : trimmed.toLowerCase();
}

function feedbackFor(
  feedbackById: Record<string, AssessmentFeedbackContent> | undefined,
  id: string,
): { feedback?: AssessmentFeedbackContent } {
  const feedback = feedbackById?.[id];
  return feedback === undefined ? {} : { feedback };
}

function summaryFeedbackFor(target: AssessmentTargetContract): AssessmentFeedbackContent | null {
  return "summaryFeedback" in target.assessment
    ? (target.assessment.summaryFeedback ?? null)
    : null;
}
