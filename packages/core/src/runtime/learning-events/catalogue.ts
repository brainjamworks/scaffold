import { z } from "zod";

import {
  AssessmentInteractionContractSchema,
  AssessmentResponseValueSchema,
  ScoreSchema,
  type AssessmentInteractionKind,
  type AssessmentResponseValue,
  type AssessmentResult,
  type Score,
} from "@scaffold/contracts";
import {
  LearningEventIriSchema,
  LearningEventDraftSchema,
  type LearningEventActivity,
  type LearningEventActivityDefinition,
  type LearningEventContext,
  type LearningEventInteractionComponent,
  type LearningEventInteractionType,
  type LearningEventIri,
  type LearningEventDraft,
  type LearningEventVerb,
} from "../../host/ports/learning-events";

function immutableVerb(id: LearningEventIri, display: string): LearningEventVerb {
  return Object.freeze({
    id,
    display: Object.freeze({ en: display }),
  });
}

export const LEARNING_EVENT_VERBS = Object.freeze({
  initialized: immutableVerb("http://adlnet.gov/expapi/verbs/initialized", "initialized"),
  launched: immutableVerb("http://adlnet.gov/expapi/verbs/launched", "launched"),
  experienced: immutableVerb("http://adlnet.gov/expapi/verbs/experienced", "experienced"),
  attempted: immutableVerb("http://adlnet.gov/expapi/verbs/attempted", "attempted"),
  answered: immutableVerb("http://adlnet.gov/expapi/verbs/answered", "answered"),
  interacted: immutableVerb("http://adlnet.gov/expapi/verbs/interacted", "interacted"),
  completed: immutableVerb("http://adlnet.gov/expapi/verbs/completed", "completed"),
  passed: immutableVerb("http://adlnet.gov/expapi/verbs/passed", "passed"),
  failed: immutableVerb("http://adlnet.gov/expapi/verbs/failed", "failed"),
  progressed: immutableVerb("http://adlnet.gov/expapi/verbs/progressed", "progressed"),
  terminated: immutableVerb("http://adlnet.gov/expapi/verbs/terminated", "terminated"),
});

export const LEARNING_EVENT_ACTIVITY_TYPES = Object.freeze({
  content: "https://scaffold.ac/xapi/activity-types/content",
  quiz: "http://adlnet.gov/expapi/activities/assessment",
  assessmentQuestion: "http://adlnet.gov/expapi/activities/cmi.interaction",
  learnerActivity: "https://scaffold.ac/xapi/activity-types/learner-activity",
  surface: "https://scaffold.ac/xapi/activity-types/surface",
  layoutSection: "https://scaffold.ac/xapi/activity-types/layout-section",
  hint: "https://scaffold.ac/xapi/activity-types/hint",
  resource: "https://scaffold.ac/xapi/activity-types/resource",
  resourcePage: "https://scaffold.ac/xapi/activity-types/resource-page",
  visualComposition: "https://scaffold.ac/xapi/activity-types/visual-composition",
  visualItem: "https://scaffold.ac/xapi/activity-types/visual-item",
});

export const LEARNING_EVENT_EXTENSIONS = Object.freeze({
  assessmentAttemptNumber: "https://scaffold.ac/xapi/extensions/assessment-attempt-number",
  assessmentInteractionKind: "https://scaffold.ac/xapi/extensions/assessment-interaction-kind",
  quizAttemptId: "https://scaffold.ac/xapi/extensions/quiz-attempt-id",
  learnerActivityKind: "https://scaffold.ac/xapi/extensions/learner-activity-kind",
  learnerActivityEvent: "https://scaffold.ac/xapi/extensions/learner-activity-event",
  surfaceKind: "https://scaffold.ac/xapi/extensions/surface-kind",
  surfacePosition: "https://scaffold.ac/xapi/extensions/surface-position",
  surfaceCount: "https://scaffold.ac/xapi/extensions/surface-count",
  layoutKind: "https://scaffold.ac/xapi/extensions/layout-kind",
  layoutSectionPosition: "https://scaffold.ac/xapi/extensions/layout-section-position",
  layoutSectionCount: "https://scaffold.ac/xapi/extensions/layout-section-count",
  hintNumber: "https://scaffold.ac/xapi/extensions/hint-number",
  resourceKind: "https://scaffold.ac/xapi/extensions/resource-kind",
  resourcePageNumber: "https://scaffold.ac/xapi/extensions/resource-page-number",
  resourcePageCount: "https://scaffold.ac/xapi/extensions/resource-page-count",
  visualItemKind: "https://scaffold.ac/xapi/extensions/visual-item-kind",
  visualItemPosition: "https://scaffold.ac/xapi/extensions/visual-item-position",
  visualItemCount: "https://scaffold.ac/xapi/extensions/visual-item-count",
  progress: "https://w3id.org/xapi/cmi5/result/extensions/progress",
});

const LEARNING_EVENT_LEARNER_ACTIVITY_KINDS = ["flashcard", "checklist"] as const;
export type LearningEventLearnerActivityKind =
  (typeof LEARNING_EVENT_LEARNER_ACTIVITY_KINDS)[number];

export function isLearningEventLearnerActivityKind(
  value: string,
): value is LearningEventLearnerActivityKind {
  return LEARNING_EVENT_LEARNER_ACTIVITY_KINDS.some((kind) => kind === value);
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

function rootActivityId(value: LearningEventIri): LearningEventIri {
  return LearningEventIriSchema.parse(value);
}

function derivedActivityId(value: string): LearningEventIri {
  return LearningEventIriSchema.parse(value);
}

function createChildActivityId(
  kind: "quiz" | "assessment" | "learner-activity" | "surface" | "resource" | "visual-composition",
  rootId: LearningEventIri,
  localId: string,
): LearningEventIri {
  return derivedActivityId(
    `https://scaffold.ac/xapi/activities/${kind}?root=${rfc3986Encode(
      rootActivityId(rootId),
    )}&id=${rfc3986Encode(requiredIdentity("localId", localId))}`,
  );
}

export function createQuizActivityId(rootId: LearningEventIri, quizId: string): LearningEventIri {
  return createChildActivityId("quiz", rootId, requiredIdentity("quizId", quizId));
}

export function createAssessmentActivityId(
  rootId: LearningEventIri,
  targetId: string,
): LearningEventIri {
  return createChildActivityId("assessment", rootId, requiredIdentity("targetId", targetId));
}

export function createLearnerActivityId(
  rootId: LearningEventIri,
  blockId: string,
): LearningEventIri {
  return createChildActivityId("learner-activity", rootId, requiredIdentity("blockId", blockId));
}

export function createSurfaceActivityId(
  rootId: LearningEventIri,
  surfaceId: string,
): LearningEventIri {
  return createChildActivityId("surface", rootId, requiredIdentity("surfaceId", surfaceId));
}

export function createResourceActivityId(
  rootId: LearningEventIri,
  resourceId: string,
): LearningEventIri {
  return createChildActivityId("resource", rootId, requiredIdentity("resourceId", resourceId));
}

export function createVisualCompositionActivityId(
  rootId: LearningEventIri,
  compositionId: string,
): LearningEventIri {
  return createChildActivityId(
    "visual-composition",
    rootId,
    requiredIdentity("compositionId", compositionId),
  );
}

export function createVisualItemActivityId(
  rootId: LearningEventIri,
  compositionId: string,
  itemId: string,
): LearningEventIri {
  return derivedActivityId(
    `https://scaffold.ac/xapi/activities/visual-item?root=${rfc3986Encode(
      rootActivityId(rootId),
    )}&composition=${rfc3986Encode(
      requiredIdentity("compositionId", compositionId),
    )}&id=${rfc3986Encode(requiredIdentity("itemId", itemId))}`,
  );
}

export function createResourcePageActivityId(
  rootId: LearningEventIri,
  resourceId: string,
  pageNumber: number,
): LearningEventIri {
  return derivedActivityId(
    `https://scaffold.ac/xapi/activities/resource-page?root=${rfc3986Encode(
      rootActivityId(rootId),
    )}&resource=${rfc3986Encode(
      requiredIdentity("resourceId", resourceId),
    )}&number=${positiveInteger("pageNumber", pageNumber)}`,
  );
}

export function createLayoutSectionActivityId(
  rootId: LearningEventIri,
  layoutId: string,
  sectionId: string,
): LearningEventIri {
  return derivedActivityId(
    `https://scaffold.ac/xapi/activities/layout-section?root=${rfc3986Encode(
      rootActivityId(rootId),
    )}&layout=${rfc3986Encode(requiredIdentity("layoutId", layoutId))}&id=${rfc3986Encode(
      requiredIdentity("sectionId", sectionId),
    )}`,
  );
}

export function createHintActivityId(
  rootId: LearningEventIri,
  targetId: string,
  hintNumber: number,
): LearningEventIri {
  return derivedActivityId(
    `https://scaffold.ac/xapi/activities/hint?root=${rfc3986Encode(
      rootActivityId(rootId),
    )}&id=${rfc3986Encode(
      requiredIdentity("targetId", targetId),
    )}&number=${positiveInteger("hintNumber", hintNumber)}`,
  );
}

function rootActivity(rootId: LearningEventIri, title?: string | null): LearningEventActivity {
  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  return {
    objectType: "Activity",
    id: rootActivityId(rootId),
    definition: {
      ...(normalizedTitle ? { name: { en: normalizedTitle } } : {}),
      type: LEARNING_EVENT_ACTIVITY_TYPES.content,
    },
  };
}

function quizActivity(rootId: LearningEventIri, quizId: string): LearningEventActivity {
  return {
    objectType: "Activity",
    id: createQuizActivityId(rootId, quizId),
    definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.quiz },
  };
}

function interactionType(kind: AssessmentInteractionKind): LearningEventInteractionType {
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

function learningEventInteractionComponent(component: {
  readonly id: string;
  readonly label?: string | undefined;
}): LearningEventInteractionComponent {
  const label = component.label?.trim();
  return {
    id: encodedComponentId(component.id),
    ...(label ? { description: { en: label } } : {}),
  };
}

export const AssessmentLearningEventDefinitionSchema = z
  .object({
    activityDescription: z.string().optional(),
    interaction: AssessmentInteractionContractSchema,
  })
  .strict();

export type AssessmentLearningEventDefinition = z.infer<
  typeof AssessmentLearningEventDefinitionSchema
>;

export function buildAssessmentActivityDefinition(
  inputValue: AssessmentLearningEventDefinition,
): LearningEventActivityDefinition {
  const input = AssessmentLearningEventDefinitionSchema.parse(inputValue);
  const description = input.activityDescription?.replace(/\s+/gu, " ").trim() ?? "";
  const base: LearningEventActivityDefinition = {
    ...(description ? { description: { en: description } } : {}),
    type: LEARNING_EVENT_ACTIVITY_TYPES.assessmentQuestion,
    interactionType: interactionType(input.interaction.kind),
    extensions: {
      [LEARNING_EVENT_EXTENSIONS.assessmentInteractionKind]: input.interaction.kind,
    },
  };

  switch (input.interaction.kind) {
    case "single-select":
    case "multi-select":
      return {
        ...base,
        choices: input.interaction.options.map(learningEventInteractionComponent),
      };
    case "sequence":
      return {
        ...base,
        choices: input.interaction.items.map(learningEventInteractionComponent),
      };
    case "match":
      return {
        ...base,
        source: input.interaction.items.map(learningEventInteractionComponent),
        target: input.interaction.targets.map(learningEventInteractionComponent),
      };
    case "classify":
      return {
        ...base,
        source: input.interaction.items.map(learningEventInteractionComponent),
        target: input.interaction.categories.map(learningEventInteractionComponent),
      };
    case "fill-blanks":
    case "spatial-hotspot":
      return base;
    default:
      throw new Error(`Unsupported assessment interaction kind: ${String(input.interaction)}`);
  }
}

export interface EncodedLearningEventAssessmentResponse {
  readonly interactionType: LearningEventInteractionType;
  readonly response?: string;
}

export function encodeAssessmentResponse(
  kind: AssessmentInteractionKind,
  response: AssessmentResponseValue | null,
): EncodedLearningEventAssessmentResponse {
  const encoded: EncodedLearningEventAssessmentResponse = {
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
  rootId: LearningEventIri,
  targetId: string,
  options: {
    readonly definition: AssessmentLearningEventDefinition;
  },
): LearningEventActivity {
  return {
    objectType: "Activity",
    id: createAssessmentActivityId(rootId, targetId),
    definition: buildAssessmentActivityDefinition(options.definition),
  };
}

function learnerActivity(
  rootId: LearningEventIri,
  blockId: string,
  activityKind: LearningEventLearnerActivityKind,
): LearningEventActivity {
  if (!isLearningEventLearnerActivityKind(activityKind)) {
    throw new Error(`Unsupported learner activity kind: ${String(activityKind)}`);
  }
  return {
    objectType: "Activity",
    id: createLearnerActivityId(rootId, blockId),
    definition: {
      type: LEARNING_EVENT_ACTIVITY_TYPES.learnerActivity,
      extensions: {
        [LEARNING_EVENT_EXTENSIONS.learnerActivityKind]: activityKind,
      },
    },
  };
}

export type LearningEventSurfaceKind = "page" | "slide";
export type LearningEventResourceKind = "article" | "video" | "pdf" | "audio" | "link";

function resourceActivity(input: {
  readonly rootActivityId: LearningEventIri;
  readonly resourceId: string;
  readonly resourceKind: LearningEventResourceKind;
}): LearningEventActivity {
  if (!["article", "video", "pdf", "audio", "link"].includes(input.resourceKind)) {
    throw new Error("resourceKind must be article, video, pdf, audio, or link");
  }
  return {
    objectType: "Activity",
    id: createResourceActivityId(input.rootActivityId, input.resourceId),
    definition: {
      type: LEARNING_EVENT_ACTIVITY_TYPES.resource,
      extensions: {
        [LEARNING_EVENT_EXTENSIONS.resourceKind]: input.resourceKind,
      },
    },
  };
}

function resourcePageActivity(input: {
  readonly rootActivityId: LearningEventIri;
  readonly resourceId: string;
  readonly pageNumber: number;
  readonly pageCount: number;
}): LearningEventActivity {
  const pageNumber = positiveInteger("pageNumber", input.pageNumber);
  const pageCount = positiveInteger("pageCount", input.pageCount);
  if (pageNumber > pageCount) {
    throw new Error("pageNumber must not exceed pageCount");
  }
  return {
    objectType: "Activity",
    id: createResourcePageActivityId(input.rootActivityId, input.resourceId, pageNumber),
    definition: {
      type: LEARNING_EVENT_ACTIVITY_TYPES.resourcePage,
      extensions: {
        [LEARNING_EVENT_EXTENSIONS.resourcePageNumber]: pageNumber,
        [LEARNING_EVENT_EXTENSIONS.resourcePageCount]: pageCount,
      },
    },
  };
}

function surfaceActivity(input: {
  readonly rootActivityId: LearningEventIri;
  readonly surfaceId: string;
  readonly surfaceKind: LearningEventSurfaceKind;
  readonly position: number;
  readonly count: number;
}): LearningEventActivity {
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
      type: LEARNING_EVENT_ACTIVITY_TYPES.surface,
      extensions: {
        [LEARNING_EVENT_EXTENSIONS.surfaceKind]: input.surfaceKind,
        [LEARNING_EVENT_EXTENSIONS.surfacePosition]: position,
        [LEARNING_EVENT_EXTENSIONS.surfaceCount]: count,
      },
    },
  };
}

export type LearningEventVisualItemKind = "annotation" | "gallery-image";

function visualCompositionActivity(
  rootId: LearningEventIri,
  compositionId: string,
): LearningEventActivity {
  return {
    objectType: "Activity",
    id: createVisualCompositionActivityId(rootId, compositionId),
    definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.visualComposition },
  };
}

function visualItemActivity(input: {
  readonly rootActivityId: LearningEventIri;
  readonly compositionId: string;
  readonly itemId: string;
  readonly itemKind: LearningEventVisualItemKind;
  readonly position: number;
  readonly count: number;
}): LearningEventActivity {
  if (input.itemKind !== "annotation" && input.itemKind !== "gallery-image") {
    throw new Error("itemKind must be annotation or gallery-image");
  }
  const position = positiveInteger("position", input.position);
  const count = positiveInteger("count", input.count);
  if (position > count) {
    throw new Error("position must not exceed count");
  }
  return {
    objectType: "Activity",
    id: createVisualItemActivityId(input.rootActivityId, input.compositionId, input.itemId),
    definition: {
      type: LEARNING_EVENT_ACTIVITY_TYPES.visualItem,
      extensions: {
        [LEARNING_EVENT_EXTENSIONS.visualItemKind]: input.itemKind,
        [LEARNING_EVENT_EXTENSIONS.visualItemPosition]: position,
        [LEARNING_EVENT_EXTENSIONS.visualItemCount]: count,
      },
    },
  };
}

export type LearningEventLayoutKind = "tabs" | "paginated" | "accordion";

function layoutSectionActivity(input: {
  readonly rootActivityId: LearningEventIri;
  readonly layoutId: string;
  readonly sectionId: string;
  readonly layoutKind: LearningEventLayoutKind;
  readonly position: number;
  readonly count: number;
}): LearningEventActivity {
  if (
    input.layoutKind !== "tabs" &&
    input.layoutKind !== "paginated" &&
    input.layoutKind !== "accordion"
  ) {
    throw new Error("layoutKind must be tabs, paginated, or accordion");
  }
  const position = positiveInteger("position", input.position);
  const count = positiveInteger("count", input.count);
  if (position > count) {
    throw new Error("position must not exceed count");
  }
  return {
    objectType: "Activity",
    id: createLayoutSectionActivityId(input.rootActivityId, input.layoutId, input.sectionId),
    definition: {
      type: LEARNING_EVENT_ACTIVITY_TYPES.layoutSection,
      extensions: {
        [LEARNING_EVENT_EXTENSIONS.layoutKind]: input.layoutKind,
        [LEARNING_EVENT_EXTENSIONS.layoutSectionPosition]: position,
        [LEARNING_EVENT_EXTENSIONS.layoutSectionCount]: count,
      },
    },
  };
}

function parentContext(parent: LearningEventActivity): LearningEventContext {
  return {
    contextActivities: {
      parent: [parent],
    },
  };
}

function quizContext(
  rootId: LearningEventIri,
  quizId: string,
  attemptId: string,
): LearningEventContext {
  return {
    ...parentContext(quizActivity(rootId, quizId)),
    extensions: {
      [LEARNING_EVENT_EXTENSIONS.quizAttemptId]: requiredIdentity("attemptId", attemptId),
    },
  };
}

function validatedDraft(value: LearningEventDraft): LearningEventDraft {
  return LearningEventDraftSchema.parse(value);
}

function validNormalizedResult(
  result: Pick<AssessmentResult, "isCorrect" | "score">,
): Pick<AssessmentResult, "isCorrect" | "score"> {
  if (typeof result.isCorrect !== "boolean") {
    throw new Error("Assessment result must contain a boolean outcome and normalized score");
  }
  return { isCorrect: result.isCorrect, score: ScoreSchema.parse(result.score) };
}

export function buildInitializedLearningEventDraft(input: {
  readonly rootActivityId: LearningEventIri;
  readonly title?: string | null;
}): LearningEventDraft {
  return validatedDraft({
    verb: LEARNING_EVENT_VERBS.initialized,
    object: rootActivity(input.rootActivityId, input.title),
  });
}

export function buildSurfaceExperiencedLearningEventDraft(input: {
  readonly rootActivityId: LearningEventIri;
  readonly surfaceId: string;
  readonly surfaceKind: LearningEventSurfaceKind;
  readonly position: number;
  readonly count: number;
}): LearningEventDraft {
  return validatedDraft({
    verb: LEARNING_EVENT_VERBS.experienced,
    object: surfaceActivity(input),
    context: parentContext(rootActivity(input.rootActivityId)),
  });
}

export function buildVisualItemExperiencedLearningEventDraft(input: {
  readonly rootActivityId: LearningEventIri;
  readonly compositionId: string;
  readonly itemId: string;
  readonly itemKind: LearningEventVisualItemKind;
  readonly position: number;
  readonly count: number;
}): LearningEventDraft {
  return validatedDraft({
    verb: LEARNING_EVENT_VERBS.experienced,
    object: visualItemActivity(input),
    context: parentContext(visualCompositionActivity(input.rootActivityId, input.compositionId)),
  });
}

export function buildResourceLaunchedLearningEventDraft(input: {
  readonly rootActivityId: LearningEventIri;
  readonly resourceId: string;
  readonly resourceKind: LearningEventResourceKind;
}): LearningEventDraft {
  return validatedDraft({
    verb: LEARNING_EVENT_VERBS.launched,
    object: resourceActivity(input),
    context: parentContext(rootActivity(input.rootActivityId)),
  });
}

export function buildResourceAttemptedLearningEventDraft(input: {
  readonly rootActivityId: LearningEventIri;
  readonly resourceId: string;
  readonly resourceKind: LearningEventResourceKind;
}): LearningEventDraft {
  return validatedDraft({
    verb: LEARNING_EVENT_VERBS.attempted,
    object: resourceActivity(input),
    context: parentContext(rootActivity(input.rootActivityId)),
  });
}

export function buildResourceCompletedLearningEventDraft(input: {
  readonly rootActivityId: LearningEventIri;
  readonly resourceId: string;
  readonly resourceKind: LearningEventResourceKind;
}): LearningEventDraft {
  return validatedDraft({
    verb: LEARNING_EVENT_VERBS.completed,
    object: resourceActivity(input),
    result: { completion: true },
    context: parentContext(rootActivity(input.rootActivityId)),
  });
}

export function buildResourcePageExperiencedLearningEventDraft(input: {
  readonly rootActivityId: LearningEventIri;
  readonly resourceId: string;
  readonly pageNumber: number;
  readonly pageCount: number;
}): LearningEventDraft {
  return validatedDraft({
    verb: LEARNING_EVENT_VERBS.experienced,
    object: resourcePageActivity(input),
    context: parentContext(
      resourceActivity({
        rootActivityId: input.rootActivityId,
        resourceId: input.resourceId,
        resourceKind: "pdf",
      }),
    ),
  });
}

export function buildLayoutSectionExperiencedLearningEventDraft(input: {
  readonly rootActivityId: LearningEventIri;
  readonly layoutId: string;
  readonly sectionId: string;
  readonly layoutKind: LearningEventLayoutKind;
  readonly position: number;
  readonly count: number;
}): LearningEventDraft {
  return validatedDraft({
    verb: LEARNING_EVENT_VERBS.experienced,
    object: layoutSectionActivity(input),
    context: parentContext(rootActivity(input.rootActivityId)),
  });
}

export function buildAnsweredLearningEventDraft(input: {
  readonly rootActivityId: LearningEventIri;
  readonly targetId: string;
  readonly definition: AssessmentLearningEventDefinition;
  readonly response: AssessmentResponseValue | null;
  readonly result: Pick<AssessmentResult, "isCorrect" | "score">;
  readonly attemptNumber: number;
  readonly quiz?: {
    readonly quizId: string;
    readonly attemptId: string;
  } | null;
}): LearningEventDraft {
  const result = validNormalizedResult(input.result);
  const attemptNumber = positiveInteger("attemptNumber", input.attemptNumber);
  const encodedResponse = encodeAssessmentResponse(
    input.definition.interaction.kind,
    input.response,
  );
  return validatedDraft({
    verb: LEARNING_EVENT_VERBS.answered,
    object: assessmentActivity(input.rootActivityId, input.targetId, {
      definition: input.definition,
    }),
    result: {
      success: result.isCorrect,
      score: result.score,
      ...(encodedResponse.response === undefined ? {} : { response: encodedResponse.response }),
      extensions: {
        [LEARNING_EVENT_EXTENSIONS.assessmentAttemptNumber]: attemptNumber,
      },
    },
    context: input.quiz
      ? quizContext(input.rootActivityId, input.quiz.quizId, input.quiz.attemptId)
      : parentContext(rootActivity(input.rootActivityId)),
  });
}

export function buildHintInteractedLearningEventDraft(input: {
  readonly rootActivityId: LearningEventIri;
  readonly targetId: string;
  readonly definition: AssessmentLearningEventDefinition;
  readonly hintNumber: number;
}): LearningEventDraft {
  const hintNumber = positiveInteger("hintNumber", input.hintNumber);
  return validatedDraft({
    verb: LEARNING_EVENT_VERBS.interacted,
    object: {
      objectType: "Activity",
      id: createHintActivityId(input.rootActivityId, input.targetId, hintNumber),
      definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.hint },
    },
    result: {
      extensions: {
        [LEARNING_EVENT_EXTENSIONS.hintNumber]: hintNumber,
      },
    },
    context: parentContext(
      assessmentActivity(input.rootActivityId, input.targetId, {
        definition: input.definition,
      }),
    ),
  });
}

interface LearnerActivityLearningEventInput {
  readonly rootActivityId: LearningEventIri;
  readonly blockId: string;
  readonly activityKind: LearningEventLearnerActivityKind;
  readonly event?: LearnerActivityLearningEvent;
}

export interface ChecklistItemToggledLearningEvent {
  readonly kind: "checklist-item-toggled";
  readonly itemId: string;
  readonly checked: boolean;
  readonly completedCount: number;
  readonly total: number;
}

export interface FlashcardFlippedLearningEvent {
  readonly kind: "flashcard-flipped";
  readonly cardId: string;
  readonly face: "front" | "back";
}

export interface FlashcardRatedLearningEvent {
  readonly kind: "flashcard-rated";
  readonly cardId: string;
  readonly rating: "got-it" | "not-yet";
  readonly masteredCount: number;
  readonly total: number;
}

export type LearnerActivityLearningEvent =
  | ChecklistItemToggledLearningEvent
  | FlashcardFlippedLearningEvent
  | FlashcardRatedLearningEvent;

function learnerActivityLearningEventParts(input: LearnerActivityLearningEventInput): {
  readonly object: LearningEventActivity;
  readonly context: LearningEventContext;
} {
  return {
    object: learnerActivity(input.rootActivityId, input.blockId, input.activityKind),
    context: parentContext(rootActivity(input.rootActivityId)),
  };
}

function checklistItemToggledEventValue(
  input: LearnerActivityLearningEventInput,
  event: ChecklistItemToggledLearningEvent,
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
  input: LearnerActivityLearningEventInput,
  event: FlashcardFlippedLearningEvent,
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
  input: LearnerActivityLearningEventInput,
  event: FlashcardRatedLearningEvent,
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

function learnerActivityEventValue(input: LearnerActivityLearningEventInput) {
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

export function buildLearnerActivityInteractedLearningEventDraft(
  input: LearnerActivityLearningEventInput,
): LearningEventDraft {
  const event = learnerActivityEventValue(input);
  return validatedDraft({
    verb: LEARNING_EVENT_VERBS.interacted,
    ...learnerActivityLearningEventParts(input),
    ...(event
      ? {
          result: {
            extensions: {
              [LEARNING_EVENT_EXTENSIONS.learnerActivityEvent]: event,
            },
          },
        }
      : {}),
  });
}

export function buildLearnerActivityCompletedLearningEventDraft(
  input: LearnerActivityLearningEventInput,
): LearningEventDraft {
  return validatedDraft({
    verb: LEARNING_EVENT_VERBS.completed,
    ...learnerActivityLearningEventParts(input),
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

interface QuizLearningEventInput {
  readonly rootActivityId: LearningEventIri;
  readonly quizId: string;
  readonly attemptId: string;
}

function quizLearningEventParts(input: QuizLearningEventInput): {
  readonly object: LearningEventActivity;
  readonly context: LearningEventContext;
} {
  return {
    object: quizActivity(input.rootActivityId, input.quizId),
    context: {
      ...parentContext(rootActivity(input.rootActivityId)),
      extensions: {
        [LEARNING_EVENT_EXTENSIONS.quizAttemptId]: requiredIdentity("attemptId", input.attemptId),
      },
    },
  };
}

export function buildQuizAttemptedLearningEventDraft(
  input: QuizLearningEventInput,
): LearningEventDraft {
  return validatedDraft({
    verb: LEARNING_EVENT_VERBS.attempted,
    ...quizLearningEventParts(input),
  });
}

export function buildQuizCompletedLearningEventDraft(
  input: QuizLearningEventInput & {
    readonly startedAt: string | null;
    readonly finishedAt: string | null;
  },
): LearningEventDraft {
  const duration = elapsedDuration(input.startedAt, input.finishedAt);
  return validatedDraft({
    verb: LEARNING_EVENT_VERBS.completed,
    ...quizLearningEventParts(input),
    result: {
      completion: true,
      ...(duration === undefined ? {} : { duration }),
    },
  });
}

export function buildQuizSuccessLearningEventDraft(
  input: QuizLearningEventInput & {
    readonly successStatus: "passed" | "failed";
    readonly score: Score;
  },
): LearningEventDraft {
  if (input.successStatus !== "passed" && input.successStatus !== "failed") {
    throw new Error("successStatus must be passed or failed");
  }
  const score = ScoreSchema.parse(input.score);
  const success = input.successStatus === "passed";
  return validatedDraft({
    verb: success ? LEARNING_EVENT_VERBS.passed : LEARNING_EVENT_VERBS.failed,
    ...quizLearningEventParts(input),
    result: {
      success,
      score,
    },
  });
}

export function buildTerminatedLearningEventDraft(input: {
  readonly rootActivityId: LearningEventIri;
  readonly title?: string | null;
  readonly durationMs: number;
}): LearningEventDraft {
  return validatedDraft({
    verb: LEARNING_EVENT_VERBS.terminated,
    object: rootActivity(input.rootActivityId, input.title),
    result: { duration: durationFromMilliseconds(input.durationMs) },
  });
}

const NonBlankIdentitySchema = z.string().regex(/\S/u, { message: "Must be non-blank" });
const PositiveIntegerSchema = z.number().int().positive();
const NonNegativeIntegerSchema = z.number().int().nonnegative();

const SurfaceExperiencedInputSchema = z
  .object({
    type: z.literal("surface.experienced"),
    surfaceId: NonBlankIdentitySchema,
    surfaceKind: z.enum(["page", "slide"]),
    position: PositiveIntegerSchema,
    count: PositiveIntegerSchema,
  })
  .strict();

const LayoutSectionExperiencedInputSchema = z
  .object({
    type: z.literal("layout-section.experienced"),
    layoutId: NonBlankIdentitySchema,
    sectionId: NonBlankIdentitySchema,
    layoutKind: z.enum(["tabs", "paginated", "accordion"]),
    position: PositiveIntegerSchema,
    count: PositiveIntegerSchema,
  })
  .strict();

const VisualItemExperiencedInputSchema = z
  .object({
    type: z.literal("visual-item.experienced"),
    compositionId: NonBlankIdentitySchema,
    itemId: NonBlankIdentitySchema,
    itemKind: z.enum(["annotation", "gallery-image"]),
    position: PositiveIntegerSchema,
    count: PositiveIntegerSchema,
  })
  .strict();

function resourceInputSchema(
  type: "resource.launched" | "resource.attempted" | "resource.completed",
) {
  return z
    .object({
      type: z.literal(type),
      resourceId: NonBlankIdentitySchema,
      resourceKind: z.enum(["article", "video", "pdf", "audio", "link"]),
    })
    .strict();
}

const ResourcePageExperiencedInputSchema = z
  .object({
    type: z.literal("resource-page.experienced"),
    resourceId: NonBlankIdentitySchema,
    pageNumber: PositiveIntegerSchema,
    pageCount: PositiveIntegerSchema,
  })
  .strict();

const BlockLearningEventInputValueSchema = z.union([
  SurfaceExperiencedInputSchema,
  LayoutSectionExperiencedInputSchema,
  VisualItemExperiencedInputSchema,
  resourceInputSchema("resource.launched"),
  resourceInputSchema("resource.attempted"),
  resourceInputSchema("resource.completed"),
  ResourcePageExperiencedInputSchema,
]);

export const BlockLearningEventInputSchema = BlockLearningEventInputValueSchema.superRefine(
  (input, context) => {
    if ("position" in input && input.position > input.count) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "position must not exceed count",
        path: ["position"],
      });
    }
    if ("pageNumber" in input && input.pageNumber > input.pageCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "pageNumber must not exceed pageCount",
        path: ["pageNumber"],
      });
    }
  },
);

export type BlockLearningEventInput = z.infer<typeof BlockLearningEventInputSchema>;

const AssessmentAnsweredInputSchema = z
  .object({
    type: z.literal("assessment.answered"),
    targetId: NonBlankIdentitySchema,
    definition: AssessmentLearningEventDefinitionSchema,
    response: AssessmentResponseValueSchema.nullable(),
    result: z.object({ isCorrect: z.boolean(), score: ScoreSchema }).strict(),
    attemptNumber: PositiveIntegerSchema,
    quiz: z
      .object({ quizId: NonBlankIdentitySchema, attemptId: NonBlankIdentitySchema })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

const AssessmentHintInputSchema = z
  .object({
    type: z.literal("assessment.hint-interacted"),
    targetId: NonBlankIdentitySchema,
    definition: AssessmentLearningEventDefinitionSchema,
    hintNumber: PositiveIntegerSchema,
  })
  .strict();

const LearnerActivityEventSchema = z.union([
  z
    .object({
      kind: z.literal("checklist-item-toggled"),
      itemId: NonBlankIdentitySchema,
      checked: z.boolean(),
      completedCount: NonNegativeIntegerSchema,
      total: PositiveIntegerSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("flashcard-flipped"),
      cardId: NonBlankIdentitySchema,
      face: z.enum(["front", "back"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("flashcard-rated"),
      cardId: NonBlankIdentitySchema,
      rating: z.enum(["got-it", "not-yet"]),
      masteredCount: NonNegativeIntegerSchema,
      total: PositiveIntegerSchema,
    })
    .strict(),
]);

const LearnerActivityInputSchema = z
  .object({
    type: z.enum(["learner-activity.interacted", "learner-activity.completed"]),
    blockId: NonBlankIdentitySchema,
    activityKind: z.enum(["flashcard", "checklist"]),
    event: LearnerActivityEventSchema.optional(),
  })
  .strict();

const QuizBaseShape = {
  quizId: NonBlankIdentitySchema,
  attemptId: NonBlankIdentitySchema,
};
const QuizAttemptedInputSchema = z
  .object({ type: z.literal("quiz.attempted"), ...QuizBaseShape })
  .strict();
const QuizCompletedInputSchema = z
  .object({
    type: z.literal("quiz.completed"),
    ...QuizBaseShape,
    startedAt: z.string().nullable(),
    finishedAt: z.string().nullable(),
  })
  .strict();
const QuizSuccessInputSchema = z
  .object({
    type: z.enum(["quiz.passed", "quiz.failed"]),
    ...QuizBaseShape,
    score: ScoreSchema,
  })
  .strict();

const ContentProgressedInputSchema = z
  .object({
    type: z.literal("content.progressed"),
    progressPercent: z.number().int().min(0).max(99),
  })
  .strict();
const ContentCompletedInputSchema = z
  .object({
    type: z.literal("content.completed"),
    completion: z.literal(true),
    duration: z.string().duration().optional(),
  })
  .strict();
const ContentSuccessInputSchema = z
  .object({
    type: z.enum(["content.passed", "content.failed"]),
    score: ScoreSchema.optional(),
    duration: z.string().duration().optional(),
  })
  .strict();

const RuntimeLifecycleInputSchema = z.union([
  z.object({ type: z.literal("session.initialized") }).strict(),
  z
    .object({ type: z.literal("session.terminated"), durationMs: NonNegativeIntegerSchema })
    .strict(),
]);

export const CoreLearningEventInputSchema = z.union([
  BlockLearningEventInputSchema,
  AssessmentAnsweredInputSchema,
  AssessmentHintInputSchema,
  LearnerActivityInputSchema,
  QuizAttemptedInputSchema,
  QuizCompletedInputSchema,
  QuizSuccessInputSchema,
  ContentProgressedInputSchema,
  ContentCompletedInputSchema,
  ContentSuccessInputSchema,
  RuntimeLifecycleInputSchema,
]);

export type CoreLearningEventInput = z.infer<typeof CoreLearningEventInputSchema>;

export interface LearningEventCatalogueContext {
  readonly rootActivityId: LearningEventIri;
  readonly title?: string | null;
}

export function buildLearningEventDraft(
  untrustedInput: CoreLearningEventInput,
  context: LearningEventCatalogueContext,
): LearningEventDraft {
  const input = CoreLearningEventInputSchema.parse(untrustedInput);
  const rootActivityId = LearningEventIriSchema.parse(context.rootActivityId);

  switch (input.type) {
    case "session.initialized":
      return buildInitializedLearningEventDraft({
        rootActivityId,
        ...(context.title === undefined ? {} : { title: context.title }),
      });
    case "session.terminated":
      return buildTerminatedLearningEventDraft({
        rootActivityId,
        ...(context.title === undefined ? {} : { title: context.title }),
        durationMs: input.durationMs,
      });
    case "surface.experienced":
      return buildSurfaceExperiencedLearningEventDraft({ rootActivityId, ...input });
    case "layout-section.experienced":
      return buildLayoutSectionExperiencedLearningEventDraft({ rootActivityId, ...input });
    case "visual-item.experienced":
      return buildVisualItemExperiencedLearningEventDraft({ rootActivityId, ...input });
    case "resource.launched":
      return buildResourceLaunchedLearningEventDraft({ rootActivityId, ...input });
    case "resource.attempted":
      return buildResourceAttemptedLearningEventDraft({ rootActivityId, ...input });
    case "resource.completed":
      return buildResourceCompletedLearningEventDraft({ rootActivityId, ...input });
    case "resource-page.experienced":
      return buildResourcePageExperiencedLearningEventDraft({ rootActivityId, ...input });
    case "assessment.answered":
      return buildAnsweredLearningEventDraft({
        rootActivityId,
        targetId: input.targetId,
        definition: input.definition,
        response: input.response,
        result: input.result,
        attemptNumber: input.attemptNumber,
        ...(input.quiz === undefined ? {} : { quiz: input.quiz }),
      });
    case "assessment.hint-interacted":
      return buildHintInteractedLearningEventDraft({
        rootActivityId,
        targetId: input.targetId,
        definition: input.definition,
        hintNumber: input.hintNumber,
      });
    case "learner-activity.interacted":
      return buildLearnerActivityInteractedLearningEventDraft({
        rootActivityId,
        blockId: input.blockId,
        activityKind: input.activityKind,
        ...(input.event === undefined ? {} : { event: input.event }),
      });
    case "learner-activity.completed":
      return buildLearnerActivityCompletedLearningEventDraft({
        rootActivityId,
        blockId: input.blockId,
        activityKind: input.activityKind,
        ...(input.event === undefined ? {} : { event: input.event }),
      });
    case "quiz.attempted":
      return buildQuizAttemptedLearningEventDraft({ rootActivityId, ...input });
    case "quiz.completed":
      return buildQuizCompletedLearningEventDraft({ rootActivityId, ...input });
    case "quiz.passed":
    case "quiz.failed":
      return buildQuizSuccessLearningEventDraft({
        rootActivityId,
        ...input,
        successStatus: input.type === "quiz.passed" ? "passed" : "failed",
      });
    case "content.progressed":
      return validatedDraft({
        verb: LEARNING_EVENT_VERBS.progressed,
        object: rootActivity(rootActivityId, context.title),
        result: { extensions: { [LEARNING_EVENT_EXTENSIONS.progress]: input.progressPercent } },
      });
    case "content.completed":
      return validatedDraft({
        verb: LEARNING_EVENT_VERBS.completed,
        object: rootActivity(rootActivityId, context.title),
        result: {
          completion: true,
          ...(input.duration === undefined ? {} : { duration: input.duration }),
        },
      });
    case "content.passed":
    case "content.failed":
      return validatedDraft({
        verb:
          input.type === "content.passed"
            ? LEARNING_EVENT_VERBS.passed
            : LEARNING_EVENT_VERBS.failed,
        object: rootActivity(rootActivityId, context.title),
        result: {
          success: input.type === "content.passed",
          ...(input.score === undefined ? {} : { score: input.score }),
          ...(input.duration === undefined ? {} : { duration: input.duration }),
        },
      });
  }
}
