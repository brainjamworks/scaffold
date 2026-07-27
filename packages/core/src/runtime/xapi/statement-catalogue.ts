import { z } from "zod";

import {
  AssessmentResponseValueSchema,
  type AssessmentInteractionContract,
  type AssessmentInteractionKind,
  type AssessmentResponseValue,
  type AssessmentResult,
} from "@scaffold/contracts";
import {
  XapiIriSchema,
  XapiStatementDraftSchema,
  type XapiActivity,
  type XapiActivityDefinition,
  type XapiContextTemplate,
  type XapiInteractionComponent,
  type XapiInteractionType,
  type XapiIri,
  type XapiStatementDraft,
  type XapiVerb,
} from "../../host/ports/xapi";

function immutableVerb(id: XapiIri, display: string): XapiVerb {
  return Object.freeze({
    id,
    display: Object.freeze({ en: display }),
  });
}

export const XAPI_VERBS = Object.freeze({
  initialized: immutableVerb("http://adlnet.gov/expapi/verbs/initialized", "initialized"),
  experienced: immutableVerb("http://adlnet.gov/expapi/verbs/experienced", "experienced"),
  answered: immutableVerb("http://adlnet.gov/expapi/verbs/answered", "answered"),
  interacted: immutableVerb("http://adlnet.gov/expapi/verbs/interacted", "interacted"),
  completed: immutableVerb("http://adlnet.gov/expapi/verbs/completed", "completed"),
  passed: immutableVerb("http://adlnet.gov/expapi/verbs/passed", "passed"),
  failed: immutableVerb("http://adlnet.gov/expapi/verbs/failed", "failed"),
  terminated: immutableVerb("http://adlnet.gov/expapi/verbs/terminated", "terminated"),
});

export const XAPI_ACTIVITY_TYPES = Object.freeze({
  course: "http://adlnet.gov/expapi/activities/course",
  quiz: "http://adlnet.gov/expapi/activities/assessment",
  assessmentQuestion: "http://adlnet.gov/expapi/activities/cmi.interaction",
  learnerActivity: "https://scaffold.ac/xapi/activity-types/learner-activity",
  surface: "https://scaffold.ac/xapi/activity-types/surface",
  hint: "https://scaffold.ac/xapi/activity-types/hint",
});

export const XAPI_EXTENSIONS = Object.freeze({
  assessmentAttemptNumber: "https://scaffold.ac/xapi/extensions/assessment-attempt-number",
  assessmentInteractionKind: "https://scaffold.ac/xapi/extensions/assessment-interaction-kind",
  quizAttemptId: "https://scaffold.ac/xapi/extensions/quiz-attempt-id",
  learnerActivityKind: "https://scaffold.ac/xapi/extensions/learner-activity-kind",
  learnerActivityEvent: "https://scaffold.ac/xapi/extensions/learner-activity-event",
  surfaceKind: "https://scaffold.ac/xapi/extensions/surface-kind",
  surfacePosition: "https://scaffold.ac/xapi/extensions/surface-position",
  surfaceCount: "https://scaffold.ac/xapi/extensions/surface-count",
  hintNumber: "https://scaffold.ac/xapi/extensions/hint-number",
});

const XAPI_LEARNER_ACTIVITY_KINDS = ["flashcard", "checklist"] as const;
export type XapiLearnerActivityKind = (typeof XAPI_LEARNER_ACTIVITY_KINDS)[number];

export function isXapiLearnerActivityKind(value: string): value is XapiLearnerActivityKind {
  return XAPI_LEARNER_ACTIVITY_KINDS.some((kind) => kind === value);
}

function requiredIdentity(name: string, value: string): string {
  if (typeof value !== "string" || !/\S/u.test(value)) {
    throw new Error(`${name} must be a non-blank string`);
  }
  return value;
}

function positiveInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function rootActivityId(value: XapiIri): XapiIri {
  return XapiIriSchema.parse(value);
}

function derivedActivityId(value: string): XapiIri {
  return XapiIriSchema.parse(value);
}

function createChildActivityId(
  kind: "quiz" | "assessment" | "learner-activity" | "surface",
  rootId: XapiIri,
  localId: string,
): XapiIri {
  return derivedActivityId(
    `https://scaffold.ac/xapi/activities/${kind}?root=${rfc3986Encode(
      rootActivityId(rootId),
    )}&id=${rfc3986Encode(requiredIdentity("localId", localId))}`,
  );
}

export function createQuizActivityId(rootId: XapiIri, quizId: string): XapiIri {
  return createChildActivityId("quiz", rootId, requiredIdentity("quizId", quizId));
}

export function createAssessmentActivityId(rootId: XapiIri, targetId: string): XapiIri {
  return createChildActivityId("assessment", rootId, requiredIdentity("targetId", targetId));
}

export function createLearnerActivityId(rootId: XapiIri, blockId: string): XapiIri {
  return createChildActivityId("learner-activity", rootId, requiredIdentity("blockId", blockId));
}

export function createSurfaceActivityId(rootId: XapiIri, surfaceId: string): XapiIri {
  return createChildActivityId("surface", rootId, requiredIdentity("surfaceId", surfaceId));
}

export function createHintActivityId(
  rootId: XapiIri,
  targetId: string,
  hintNumber: number,
): XapiIri {
  return derivedActivityId(
    `https://scaffold.ac/xapi/activities/hint?root=${rfc3986Encode(
      rootActivityId(rootId),
    )}&id=${rfc3986Encode(
      requiredIdentity("targetId", targetId),
    )}&number=${positiveInteger("hintNumber", hintNumber)}`,
  );
}

function rootActivity(rootId: XapiIri, title?: string | null): XapiActivity {
  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  return {
    objectType: "Activity",
    id: rootActivityId(rootId),
    definition: {
      ...(normalizedTitle ? { name: { en: normalizedTitle } } : {}),
      type: XAPI_ACTIVITY_TYPES.course,
    },
  };
}

function quizActivity(rootId: XapiIri, quizId: string): XapiActivity {
  return {
    objectType: "Activity",
    id: createQuizActivityId(rootId, quizId),
    definition: { type: XAPI_ACTIVITY_TYPES.quiz },
  };
}

function interactionType(kind: AssessmentInteractionKind): XapiInteractionType {
  switch (kind) {
    case "single-select":
    case "multi-select":
      return "choice";
    case "sequence":
      return "sequencing";
    case "match":
    case "classify":
      return "matching";
    case "fill-blanks":
    case "spatial-hotspot":
      return "other";
    default:
      throw new Error(`Unsupported assessment interaction kind: ${String(kind)}`);
  }
}

function ordinalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function encodedComponentId(id: string): string {
  return rfc3986Encode(id);
}

function xapiInteractionComponent(component: {
  readonly id: string;
  readonly label?: string | undefined;
}): XapiInteractionComponent {
  const label = component.label?.trim();
  return {
    id: encodedComponentId(component.id),
    ...(label ? { description: { en: label } } : {}),
  };
}

export function buildAssessmentActivityDefinition(input: {
  readonly activityDescription?: string;
  readonly interaction: AssessmentInteractionContract;
}): XapiActivityDefinition {
  const description = input.activityDescription?.replace(/\s+/gu, " ").trim() ?? "";
  const base: XapiActivityDefinition = {
    ...(description ? { description: { en: description } } : {}),
    type: XAPI_ACTIVITY_TYPES.assessmentQuestion,
    interactionType: interactionType(input.interaction.kind),
    extensions: {
      [XAPI_EXTENSIONS.assessmentInteractionKind]: input.interaction.kind,
    },
  };

  switch (input.interaction.kind) {
    case "single-select":
    case "multi-select":
      return {
        ...base,
        choices: input.interaction.options.map(xapiInteractionComponent),
      };
    case "sequence":
      return {
        ...base,
        choices: input.interaction.items.map(xapiInteractionComponent),
      };
    case "match":
      return {
        ...base,
        source: input.interaction.items.map(xapiInteractionComponent),
        target: input.interaction.targets.map(xapiInteractionComponent),
      };
    case "classify":
      return {
        ...base,
        source: input.interaction.items.map(xapiInteractionComponent),
        target: input.interaction.categories.map(xapiInteractionComponent),
      };
    case "fill-blanks":
    case "spatial-hotspot":
      return base;
    default:
      throw new Error(`Unsupported assessment interaction kind: ${String(input.interaction)}`);
  }
}

export interface EncodedXapiAssessmentResponse {
  readonly interactionType: XapiInteractionType;
  readonly response?: string;
}

export function encodeAssessmentResponse(
  kind: AssessmentInteractionKind,
  response: AssessmentResponseValue | null,
): EncodedXapiAssessmentResponse {
  const encoded: EncodedXapiAssessmentResponse = {
    interactionType: interactionType(kind),
  };
  if (response === null) return encoded;

  const parsed = AssessmentResponseValueSchema.parse(response);
  if (parsed.kind !== kind) {
    throw new Error(
      `Assessment response kind ${parsed.kind} does not match registered interaction kind ${kind}`,
    );
  }

  switch (parsed.kind) {
    case "single-select":
      return parsed.optionId === null
        ? encoded
        : { ...encoded, response: encodedComponentId(parsed.optionId) };
    case "multi-select": {
      if (parsed.optionIds.length === 0) return encoded;
      const optionIds = parsed.optionIds.map(encodedComponentId).sort(ordinalCompare);
      return { ...encoded, response: optionIds.join("[,]") };
    }
    case "sequence":
      return parsed.orderedItemIds.length === 0
        ? encoded
        : {
            ...encoded,
            response: parsed.orderedItemIds.map(encodedComponentId).join("[,]"),
          };
    case "match": {
      if (parsed.pairs.length === 0) return encoded;
      const pairs = parsed.pairs
        .map(({ itemId, targetId }) => ({
          itemId: encodedComponentId(itemId),
          targetId: encodedComponentId(targetId),
        }))
        .sort(
          (left, right) =>
            ordinalCompare(left.itemId, right.itemId) ||
            ordinalCompare(left.targetId, right.targetId),
        );
      return {
        ...encoded,
        response: pairs.map(({ itemId, targetId }) => `${itemId}[.]${targetId}`).join("[,]"),
      };
    }
    case "classify": {
      if (parsed.placements.length === 0) return encoded;
      const placements = parsed.placements
        .map(({ itemId, categoryId }) => ({
          itemId: encodedComponentId(itemId),
          categoryId: encodedComponentId(categoryId),
        }))
        .sort(
          (left, right) =>
            ordinalCompare(left.itemId, right.itemId) ||
            ordinalCompare(left.categoryId, right.categoryId),
        );
      return {
        ...encoded,
        response: placements
          .map(({ itemId, categoryId }) => `${itemId}[.]${categoryId}`)
          .join("[,]"),
      };
    }
    case "fill-blanks": {
      if (!parsed.blanks.some(({ value }) => value.trim().length > 0)) return encoded;
      const blanks = parsed.blanks
        .map(({ blankId, value }) => ({
          sortId: encodedComponentId(blankId),
          blankId,
          value,
        }))
        .sort((left, right) => ordinalCompare(left.sortId, right.sortId))
        .map(({ blankId, value }) => ({ blankId, value }));
      return { ...encoded, response: JSON.stringify({ blanks }) };
    }
    case "spatial-hotspot":
      return parsed.selections.length === 0
        ? encoded
        : {
            ...encoded,
            response: JSON.stringify({
              selections: parsed.selections.map(({ hotspotId, x, y }) => ({
                hotspotId,
                x,
                y,
              })),
            }),
          };
    default:
      throw new Error(`Unsupported assessment response kind: ${String(parsed)}`);
  }
}

function assessmentActivity(
  rootId: XapiIri,
  targetId: string,
  options: {
    readonly activityDescription?: string;
    readonly activityDefinition?: XapiActivityDefinition;
    readonly interaction?: {
      readonly kind: AssessmentInteractionKind;
      readonly interactionType: XapiInteractionType;
    };
  } = {},
): XapiActivity {
  const description = options.activityDescription?.replace(/\s+/gu, " ").trim() ?? "";
  return {
    objectType: "Activity",
    id: createAssessmentActivityId(rootId, targetId),
    definition: {
      ...options.activityDefinition,
      ...(description ? { description: { en: description } } : {}),
      type: XAPI_ACTIVITY_TYPES.assessmentQuestion,
      ...(options.interaction === undefined
        ? {}
        : {
            interactionType: options.interaction.interactionType,
            extensions: {
              ...options.activityDefinition?.extensions,
              [XAPI_EXTENSIONS.assessmentInteractionKind]: options.interaction.kind,
            },
          }),
    },
  };
}

function learnerActivity(
  rootId: XapiIri,
  blockId: string,
  activityKind: XapiLearnerActivityKind,
): XapiActivity {
  if (!isXapiLearnerActivityKind(activityKind)) {
    throw new Error(`Unsupported learner activity kind: ${String(activityKind)}`);
  }
  return {
    objectType: "Activity",
    id: createLearnerActivityId(rootId, blockId),
    definition: {
      type: XAPI_ACTIVITY_TYPES.learnerActivity,
      extensions: {
        [XAPI_EXTENSIONS.learnerActivityKind]: activityKind,
      },
    },
  };
}

export type XapiSurfaceKind = "page" | "slide";

function surfaceActivity(input: {
  readonly rootActivityId: XapiIri;
  readonly surfaceId: string;
  readonly surfaceKind: XapiSurfaceKind;
  readonly position: number;
  readonly count: number;
}): XapiActivity {
  if (input.surfaceKind !== "page" && input.surfaceKind !== "slide") {
    throw new Error("surfaceKind must be page or slide");
  }
  const position = positiveInteger("position", input.position);
  const count = positiveInteger("count", input.count);
  if (position > count) {
    throw new Error("position must not exceed count");
  }
  return {
    objectType: "Activity",
    id: createSurfaceActivityId(input.rootActivityId, input.surfaceId),
    definition: {
      type: XAPI_ACTIVITY_TYPES.surface,
      extensions: {
        [XAPI_EXTENSIONS.surfaceKind]: input.surfaceKind,
        [XAPI_EXTENSIONS.surfacePosition]: position,
        [XAPI_EXTENSIONS.surfaceCount]: count,
      },
    },
  };
}

function parentContext(parent: XapiActivity): XapiContextTemplate {
  return {
    contextActivities: {
      parent: [parent],
    },
  };
}

function quizContext(rootId: XapiIri, quizId: string, attemptId: string): XapiContextTemplate {
  return {
    ...parentContext(quizActivity(rootId, quizId)),
    extensions: {
      [XAPI_EXTENSIONS.quizAttemptId]: requiredIdentity("attemptId", attemptId),
    },
  };
}

function validatedDraft(value: XapiStatementDraft): XapiStatementDraft {
  return XapiStatementDraftSchema.parse(value);
}

function validNormalizedResult(
  result: Pick<AssessmentResult, "isCorrect" | "score">,
): Pick<AssessmentResult, "isCorrect" | "score"> {
  if (
    typeof result.isCorrect !== "boolean" ||
    !Number.isFinite(result.score) ||
    result.score < 0 ||
    result.score > 1
  ) {
    throw new Error("Assessment result must contain a boolean outcome and normalized score");
  }
  return result;
}

export function buildInitializedStatementDraft(input: {
  readonly rootActivityId: XapiIri;
  readonly title?: string | null;
}): XapiStatementDraft {
  return validatedDraft({
    verb: XAPI_VERBS.initialized,
    object: rootActivity(input.rootActivityId, input.title),
  });
}

export function buildSurfaceExperiencedStatementDraft(input: {
  readonly rootActivityId: XapiIri;
  readonly surfaceId: string;
  readonly surfaceKind: XapiSurfaceKind;
  readonly position: number;
  readonly count: number;
}): XapiStatementDraft {
  return validatedDraft({
    verb: XAPI_VERBS.experienced,
    object: surfaceActivity(input),
    context: parentContext(rootActivity(input.rootActivityId)),
  });
}

export function buildAnsweredStatementDraft(input: {
  readonly rootActivityId: XapiIri;
  readonly targetId: string;
  readonly activityDescription?: string;
  readonly activityDefinition?: XapiActivityDefinition;
  readonly interactionKind: AssessmentInteractionKind;
  readonly response: AssessmentResponseValue | null;
  readonly result: Pick<AssessmentResult, "isCorrect" | "score">;
  readonly attemptNumber: number;
  readonly quiz?: {
    readonly quizId: string;
    readonly attemptId: string;
  } | null;
}): XapiStatementDraft {
  const result = validNormalizedResult(input.result);
  const attemptNumber = positiveInteger("attemptNumber", input.attemptNumber);
  const encodedResponse = encodeAssessmentResponse(input.interactionKind, input.response);
  return validatedDraft({
    verb: XAPI_VERBS.answered,
    object: assessmentActivity(input.rootActivityId, input.targetId, {
      ...(input.activityDefinition === undefined
        ? {}
        : { activityDefinition: input.activityDefinition }),
      ...(input.activityDescription === undefined
        ? {}
        : { activityDescription: input.activityDescription }),
      interaction: {
        kind: input.interactionKind,
        interactionType: encodedResponse.interactionType,
      },
    }),
    result: {
      success: result.isCorrect,
      score: {
        scaled: result.score,
        raw: result.score,
        min: 0,
        max: 1,
      },
      ...(encodedResponse.response === undefined ? {} : { response: encodedResponse.response }),
      extensions: {
        [XAPI_EXTENSIONS.assessmentAttemptNumber]: attemptNumber,
      },
    },
    context: input.quiz
      ? quizContext(input.rootActivityId, input.quiz.quizId, input.quiz.attemptId)
      : parentContext(rootActivity(input.rootActivityId)),
  });
}

export function buildHintInteractedStatementDraft(input: {
  readonly rootActivityId: XapiIri;
  readonly targetId: string;
  readonly activityDescription?: string;
  readonly activityDefinition?: XapiActivityDefinition;
  readonly hintNumber: number;
}): XapiStatementDraft {
  const hintNumber = positiveInteger("hintNumber", input.hintNumber);
  return validatedDraft({
    verb: XAPI_VERBS.interacted,
    object: {
      objectType: "Activity",
      id: createHintActivityId(input.rootActivityId, input.targetId, hintNumber),
      definition: { type: XAPI_ACTIVITY_TYPES.hint },
    },
    result: {
      extensions: {
        [XAPI_EXTENSIONS.hintNumber]: hintNumber,
      },
    },
    context: parentContext(
      assessmentActivity(input.rootActivityId, input.targetId, {
        ...(input.activityDefinition === undefined
          ? {}
          : { activityDefinition: input.activityDefinition }),
        ...(input.activityDescription === undefined
          ? {}
          : { activityDescription: input.activityDescription }),
      }),
    ),
  });
}

interface LearnerActivityStatementInput {
  readonly rootActivityId: XapiIri;
  readonly blockId: string;
  readonly activityKind: XapiLearnerActivityKind;
  readonly event?: LearnerActivityXapiEvent;
}

export interface ChecklistItemToggledXapiEvent {
  readonly kind: "checklist-item-toggled";
  readonly itemId: string;
  readonly checked: boolean;
  readonly completedCount: number;
  readonly total: number;
}

export interface FlashcardFlippedXapiEvent {
  readonly kind: "flashcard-flipped";
  readonly cardId: string;
  readonly face: "front" | "back";
}

export interface FlashcardRatedXapiEvent {
  readonly kind: "flashcard-rated";
  readonly cardId: string;
  readonly rating: "got-it" | "not-yet";
  readonly masteredCount: number;
  readonly total: number;
}

export type LearnerActivityXapiEvent =
  | ChecklistItemToggledXapiEvent
  | FlashcardFlippedXapiEvent
  | FlashcardRatedXapiEvent;

function learnerActivityStatementParts(input: LearnerActivityStatementInput): {
  readonly object: XapiActivity;
  readonly context: XapiContextTemplate;
} {
  return {
    object: learnerActivity(input.rootActivityId, input.blockId, input.activityKind),
    context: parentContext(rootActivity(input.rootActivityId)),
  };
}

function checklistItemToggledEventValue(
  input: LearnerActivityStatementInput,
  event: ChecklistItemToggledXapiEvent,
) {
  if (input.activityKind !== "checklist") {
    throw new Error("Checklist item events require checklist learner activities");
  }
  if (!Number.isInteger(event.total) || event.total <= 0) {
    throw new Error("Checklist item event total must be a positive integer");
  }
  if (
    !Number.isInteger(event.completedCount) ||
    event.completedCount < 0 ||
    event.completedCount > event.total
  ) {
    throw new Error("Checklist item event completedCount must be between zero and total");
  }

  return {
    action: "item-toggled",
    itemId: requiredIdentity("itemId", event.itemId),
    checked: event.checked,
    completedCount: event.completedCount,
    total: event.total,
  };
}

function flashcardFlippedEventValue(
  input: LearnerActivityStatementInput,
  event: FlashcardFlippedXapiEvent,
) {
  if (input.activityKind !== "flashcard") {
    throw new Error("Flashcard flip events require flashcard learner activities");
  }
  if (event.face !== "front" && event.face !== "back") {
    throw new Error("Flashcard flip event face must be front or back");
  }
  return {
    action: "card-flipped",
    cardId: requiredIdentity("cardId", event.cardId),
    face: event.face,
  };
}

function flashcardRatedEventValue(
  input: LearnerActivityStatementInput,
  event: FlashcardRatedXapiEvent,
) {
  if (input.activityKind !== "flashcard") {
    throw new Error("Flashcard rating events require flashcard learner activities");
  }
  if (event.rating !== "got-it" && event.rating !== "not-yet") {
    throw new Error("Flashcard rating event rating must be got-it or not-yet");
  }
  if (!Number.isInteger(event.total) || event.total <= 0) {
    throw new Error("Flashcard rating event total must be a positive integer");
  }
  if (
    !Number.isInteger(event.masteredCount) ||
    event.masteredCount < 0 ||
    event.masteredCount > event.total
  ) {
    throw new Error("Flashcard rating event masteredCount must be between zero and total");
  }
  return {
    action: "card-rated",
    cardId: requiredIdentity("cardId", event.cardId),
    rating: event.rating,
    masteredCount: event.masteredCount,
    total: event.total,
  };
}

function learnerActivityEventValue(input: LearnerActivityStatementInput) {
  switch (input.event?.kind) {
    case "checklist-item-toggled":
      return checklistItemToggledEventValue(input, input.event);
    case "flashcard-flipped":
      return flashcardFlippedEventValue(input, input.event);
    case "flashcard-rated":
      return flashcardRatedEventValue(input, input.event);
    default:
      return undefined;
  }
}

export function buildLearnerActivityInteractedStatementDraft(
  input: LearnerActivityStatementInput,
): XapiStatementDraft {
  const event = learnerActivityEventValue(input);
  return validatedDraft({
    verb: XAPI_VERBS.interacted,
    ...learnerActivityStatementParts(input),
    ...(event
      ? {
          result: {
            extensions: {
              [XAPI_EXTENSIONS.learnerActivityEvent]: event,
            },
          },
        }
      : {}),
  });
}

export function buildLearnerActivityCompletedStatementDraft(
  input: LearnerActivityStatementInput,
): XapiStatementDraft {
  return validatedDraft({
    verb: XAPI_VERBS.completed,
    ...learnerActivityStatementParts(input),
    result: { completion: true },
  });
}

const AuthoritativeInstantSchema = z.string().datetime({ offset: true });

function durationFromMilliseconds(milliseconds: number): string {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    throw new Error("durationMs must be a non-negative safe integer");
  }
  const seconds = Math.floor(milliseconds / 1000);
  const remainingMilliseconds = milliseconds % 1000;
  if (remainingMilliseconds === 0) {
    return `PT${seconds}S`;
  }
  const fractionalSeconds = remainingMilliseconds.toString().padStart(3, "0").replace(/0+$/u, "");
  return `PT${seconds}.${fractionalSeconds}S`;
}

function elapsedDuration(startedAt: string | null, finishedAt: string | null): string | undefined {
  const parsedStart = AuthoritativeInstantSchema.safeParse(startedAt);
  const parsedFinish = AuthoritativeInstantSchema.safeParse(finishedAt);
  if (!parsedStart.success || !parsedFinish.success) return undefined;

  const startMilliseconds = Date.parse(parsedStart.data);
  const finishMilliseconds = Date.parse(parsedFinish.data);
  if (
    !Number.isFinite(startMilliseconds) ||
    !Number.isFinite(finishMilliseconds) ||
    finishMilliseconds < startMilliseconds
  ) {
    return undefined;
  }
  return durationFromMilliseconds(finishMilliseconds - startMilliseconds);
}

interface QuizStatementInput {
  readonly rootActivityId: XapiIri;
  readonly quizId: string;
  readonly attemptId: string;
}

function quizStatementParts(input: QuizStatementInput): {
  readonly object: XapiActivity;
  readonly context: XapiContextTemplate;
} {
  return {
    object: quizActivity(input.rootActivityId, input.quizId),
    context: {
      ...parentContext(rootActivity(input.rootActivityId)),
      extensions: {
        [XAPI_EXTENSIONS.quizAttemptId]: requiredIdentity("attemptId", input.attemptId),
      },
    },
  };
}

export function buildQuizCompletedStatementDraft(
  input: QuizStatementInput & {
    readonly startedAt: string | null;
    readonly finishedAt: string | null;
  },
): XapiStatementDraft {
  const duration = elapsedDuration(input.startedAt, input.finishedAt);
  return validatedDraft({
    verb: XAPI_VERBS.completed,
    ...quizStatementParts(input),
    result: {
      completion: true,
      ...(duration === undefined ? {} : { duration }),
    },
  });
}

export function buildQuizSuccessStatementDraft(
  input: QuizStatementInput & {
    readonly successStatus: "passed" | "failed";
    readonly score: number;
    readonly maxScore: number;
  },
): XapiStatementDraft {
  if (input.successStatus !== "passed" && input.successStatus !== "failed") {
    throw new Error("successStatus must be passed or failed");
  }
  if (
    !Number.isFinite(input.score) ||
    !Number.isFinite(input.maxScore) ||
    input.maxScore <= 0 ||
    input.score < 0 ||
    input.score > input.maxScore
  ) {
    throw new Error("Quiz score must be within a positive authoritative score range");
  }
  const success = input.successStatus === "passed";
  return validatedDraft({
    verb: success ? XAPI_VERBS.passed : XAPI_VERBS.failed,
    ...quizStatementParts(input),
    result: {
      success,
      score: {
        scaled: input.score / input.maxScore,
        raw: input.score,
        min: 0,
        max: input.maxScore,
      },
    },
  });
}

export function buildTerminatedStatementDraft(input: {
  readonly rootActivityId: XapiIri;
  readonly title?: string | null;
  readonly durationMs: number;
}): XapiStatementDraft {
  return validatedDraft({
    verb: XAPI_VERBS.terminated,
    object: rootActivity(input.rootActivityId, input.title),
    result: { duration: durationFromMilliseconds(input.durationMs) },
  });
}
