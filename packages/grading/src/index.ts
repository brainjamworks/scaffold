import type {
  AssessmentFeedbackContent,
  AssessmentItemDetail,
  AssessmentResponseValue,
  AssessmentResult,
  AssessmentTargetContract,
} from "@scaffold/contracts";

const EMPTY_RESULT: AssessmentResult = {
  score: 0,
  maxScore: 1,
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
    score: isCorrect ? 1 : 0,
    maxScore: 1,
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
      score: 0,
      maxScore: 1,
      isCorrect: false,
      feedback: summaryFeedbackFor(target),
      items,
    };
  }

  const exactMatch =
    picked.size === correctIds.size && [...correctIds].every((id) => picked.has(id));

  if (exactMatch) {
    return {
      score: 1,
      maxScore: 1,
      isCorrect: true,
      feedback: summaryFeedbackFor(target),
      items,
    };
  }

  const correctPicks = [...picked].filter((id) => correctIds.has(id)).length;
  const wrongPicks = [...picked].filter((id) => !correctIds.has(id)).length;
  const perCorrect = 1 / correctIds.size;
  const score = Math.max(0, correctPicks * perCorrect - wrongPicks * perCorrect);

  return {
    score,
    maxScore: 1,
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
      score: 0,
      maxScore: 1,
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
    score: isCorrect ? 1 : correctCount / expected.length,
    maxScore: 1,
    isCorrect,
    feedback: summaryFeedbackFor(target),
    items,
  };
}

function gradeMatch(
  target: ExtractTarget<"match">,
  response: ExtractResponse<"match">,
): AssessmentResult {
  const givenByItem = new Map(response.pairs.map((pair) => [pair.itemId, pair.targetId]));
  const pairs = target.assessment.correctPairs;
  const items: Record<string, AssessmentItemDetail> = {};

  if (pairs.length === 0) {
    return {
      score: 0,
      maxScore: 1,
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
    score: correctCount / pairs.length,
    maxScore: 1,
    isCorrect: correctCount === pairs.length,
    feedback: summaryFeedbackFor(target),
    items,
  };
}

function gradeClassify(
  target: ExtractTarget<"classify">,
  response: ExtractResponse<"classify">,
): AssessmentResult {
  const givenByItem = new Map(
    response.placements.map((placement) => [placement.itemId, placement.categoryId]),
  );
  const placements = target.assessment.correctPlacements;
  const items: Record<string, AssessmentItemDetail> = {};

  if (placements.length === 0) {
    return {
      score: 0,
      maxScore: 1,
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
    score: correctCount / placements.length,
    maxScore: 1,
    isCorrect: correctCount === placements.length,
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
      score: 0,
      maxScore: 1,
      isCorrect: false,
      feedback: summaryFeedbackFor(target),
      items,
    };
  }

  let correctCount = 0;
  for (const blank of blanks) {
    const accepted = blank.acceptedAnswers.filter((answer) => answer.length > 0);
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
    score: correctCount / blanks.length,
    maxScore: 1,
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
  const correctIds = new Set(target.assessment.correctHotspotIds);
  const selectedIds = new Set(
    response.selections.flatMap((selection) => (selection.hotspotId ? [selection.hotspotId] : [])),
  );
  const items: Record<string, AssessmentItemDetail> = {};

  if (hotspotIds.length === 0) {
    return {
      score: 0,
      maxScore: 1,
      isCorrect: false,
      feedback: summaryFeedbackFor(target),
      items,
    };
  }

  let correctlyClassified = 0;
  for (const hotspotId of hotspotIds) {
    const expected = correctIds.has(hotspotId);
    const given = selectedIds.has(hotspotId);
    const correct = expected === given;
    if (correct) correctlyClassified += 1;
    items[hotspotId] = {
      correct,
      expected,
      given,
      ...feedbackFor(target.assessment.feedbackByHotspotId, hotspotId),
    };
  }

  const allCorrect = correctlyClassified === hotspotIds.length;
  return {
    score:
      target.assessment.gradingMode === "all-or-nothing"
        ? allCorrect
          ? 1
          : 0
        : correctlyClassified / hotspotIds.length,
    maxScore: 1,
    isCorrect: allCorrect,
    feedback: summaryFeedbackFor(target),
    items,
  };
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
  return meta.caseSensitive ? trimmed : trimmed.toLocaleLowerCase();
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
