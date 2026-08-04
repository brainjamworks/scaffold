/**
 * @deprecated Migration-only xAPI-named façade.
 *
 * The canonical contract lives in `learning-events.ts`. These aliases keep
 * not-yet-migrated Core producers executable while sharing that one schema.
 * Remove this module in Generalised Learning Events Phase 6.
 */
import {
  LearningEventDraftSchema,
  LearningEventIriSchema,
  LearningEventSchema,
} from "./learning-events";
import type {
  LearningEvent,
  LearningEventActivity,
  LearningEventActivityDefinition,
  LearningEventContext,
  LearningEventDraft,
  LearningEventDuration,
  LearningEventInteractionComponent,
  LearningEventInteractionType,
  LearningEventIri,
  LearningEventJsonValue,
  LearningEventLanguageMap,
  LearningEventResult,
  LearningEventScore,
  LearningEventTimestamp,
  LearningEventUuid,
  LearningEventVerb,
} from "./learning-events";

export type XapiIri = LearningEventIri;
export type XapiUuid = LearningEventUuid;
export type XapiTimestamp = LearningEventTimestamp;
export type XapiDuration = LearningEventDuration;
export type XapiLanguageMap = LearningEventLanguageMap;
export type XapiJsonValue = LearningEventJsonValue;
export type XapiVerb = LearningEventVerb;
export type XapiInteractionType = LearningEventInteractionType;
export type XapiInteractionComponent = LearningEventInteractionComponent;
export type XapiActivityDefinition = LearningEventActivityDefinition;
export type XapiActivity = LearningEventActivity;
export type XapiScore = LearningEventScore;
export type XapiResult = LearningEventResult;
export type XapiContextTemplate = LearningEventContext;
export type XapiStatementDraft = LearningEventDraft;
export type XapiStatementTemplate = LearningEvent;

/** @deprecated Use `LearningEventPort`. */
export interface XapiPort {
  readonly activityId: XapiIri;
  send(statement: XapiStatementTemplate): Promise<void>;
}

export const XapiIriSchema = LearningEventIriSchema;
export const XapiStatementDraftSchema = LearningEventDraftSchema;
export const XapiStatementTemplateSchema = LearningEventSchema;
