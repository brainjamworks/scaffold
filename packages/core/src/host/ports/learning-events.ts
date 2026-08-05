import { z } from "zod";

export type LearningEventIri = string;
export type LearningEventUuid = string;
export type LearningEventTimestamp = string;
export type LearningEventDuration = string;
export type LearningEventLanguageMap = Readonly<Record<string, string>>;
export type LearningEventJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly LearningEventJsonValue[]
  | { readonly [key: string]: LearningEventJsonValue };

export interface LearningEventVerb {
  readonly id: LearningEventIri;
  readonly display: LearningEventLanguageMap;
}

export type LearningEventInteractionType =
  | "true-false"
  | "choice"
  | "fill-in"
  | "long-fill-in"
  | "matching"
  | "performance"
  | "sequencing"
  | "likert"
  | "numeric"
  | "other";

export interface LearningEventInteractionComponent {
  readonly id: string;
  readonly description?: LearningEventLanguageMap;
}

export interface LearningEventActivityDefinition {
  readonly name?: LearningEventLanguageMap;
  readonly description?: LearningEventLanguageMap;
  readonly type?: LearningEventIri;
  readonly interactionType?: LearningEventInteractionType;
  readonly choices?: readonly LearningEventInteractionComponent[];
  readonly source?: readonly LearningEventInteractionComponent[];
  readonly target?: readonly LearningEventInteractionComponent[];
  readonly extensions?: Readonly<Record<LearningEventIri, LearningEventJsonValue>>;
}

export interface LearningEventActivity {
  readonly objectType: "Activity";
  readonly id: LearningEventIri;
  readonly definition?: LearningEventActivityDefinition;
}

export interface LearningEventScore {
  readonly scaled?: number;
  readonly raw?: number;
  readonly min?: number;
  readonly max?: number;
}

export interface LearningEventResult {
  readonly score?: LearningEventScore;
  readonly success?: boolean;
  readonly completion?: boolean;
  readonly response?: string;
  readonly duration?: LearningEventDuration;
  readonly extensions?: Readonly<Record<LearningEventIri, LearningEventJsonValue>>;
}

export interface LearningEventContext {
  readonly contextActivities?: {
    readonly parent?: readonly LearningEventActivity[];
    readonly grouping?: readonly LearningEventActivity[];
    readonly category?: readonly LearningEventActivity[];
    readonly other?: readonly LearningEventActivity[];
  };
  readonly extensions?: Readonly<Record<LearningEventIri, LearningEventJsonValue>>;
}

export interface LearningEventDraft {
  readonly verb: LearningEventVerb;
  readonly object: LearningEventActivity;
  readonly result?: LearningEventResult;
  readonly context?: LearningEventContext;
}

/**
 * Partial standard Learning Event produced by Scaffold Core.
 *
 * Core owns the learning semantics, event ID, event timestamp, and
 * ordering. It deliberately omits Actor identity and host placement or
 * registration Context; a trusted runtime host enriches those fields for
 * delivery without replacing Core-owned values.
 */
export interface LearningEvent extends LearningEventDraft {
  readonly id: LearningEventUuid;
  readonly timestamp: LearningEventTimestamp;
}

/**
 * Optional learner-runtime boundary for accepting Core Learning Events.
 *
 * Omitting this port disables learning-record emission without changing
 * assessment, persistence, grading, or learner-facing results. An
 * implementation is a trusted host boundary, not an endpoint or LRS client.
 */
export interface LearningEventPort {
  /**
   * Stable absolute IRI for the root artefact Activity in this host placement.
   * It contains no learner identity, credential, or secret.
   */
  readonly rootActivityId: LearningEventIri;

  /**
   * Accepts a canonical Learning Event for trusted enrichment and ordered
   * delivery. Resolution means the host has accepted ownership of delivery,
   * including any later retry. Rejection means the event was not accepted,
   * permanently stops emission for this Core session, and cannot change the
   * learner operation that produced it.
   */
  accept(event: LearningEvent): Promise<void>;
}

const absoluteIriScheme = /^[A-Za-z][A-Za-z\d+.-]*:/;

function isAbsoluteIri(value: string): boolean {
  const scheme = absoluteIriScheme.exec(value)?.[0];
  if (
    value !== value.trim() ||
    /[\s\\]/u.test(value) ||
    /%(?![0-9A-Fa-f]{2})/u.test(value) ||
    scheme === undefined
  ) {
    return false;
  }
  const schemeSpecificPart = value.slice(scheme.length);
  if (schemeSpecificPart.length === 0) {
    return false;
  }
  if (
    (scheme.toLowerCase() === "http:" || scheme.toLowerCase() === "https:") &&
    !schemeSpecificPart.startsWith("//")
  ) {
    return false;
  }

  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export const LearningEventIriSchema = z.string().refine(isAbsoluteIri, {
  message: "Must be an absolute IRI",
});

const learningEventUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const LearningEventUuidSchema = z.string().regex(learningEventUuid, {
  message: "Must be an RFC UUID using an assigned version and IETF variant",
});

const LearningEventTimestampSchema = z
  .string()
  .datetime({ offset: false })
  .regex(/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,}Z$/u, {
    message: "Must be an RFC 3339 UTC timestamp with at least millisecond precision",
  });

const learningEventDuration =
  /^P(?:(\d+(?:[.,]\d+)?)W|(?:(\d+(?:[.,]\d+)?)Y)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?)$/u;

function isLearningEventDuration(value: string): boolean {
  const match = learningEventDuration.exec(value);
  if (match === null) {
    return false;
  }

  const week = match[1];
  const components = match.slice(2);
  const presentComponents = components.filter((component): component is string =>
    Boolean(component),
  );
  if (week !== undefined) {
    return true;
  }
  if (presentComponents.length === 0) {
    return false;
  }
  if (value.includes("T") && components.slice(3).every((component) => !component)) {
    return false;
  }

  return presentComponents
    .slice(0, -1)
    .every((component) => !component.includes(".") && !component.includes(","));
}

const LearningEventDurationSchema = z.string().refine(isLearningEventDuration, {
  message: "Must be an xAPI-compatible ISO 8601 duration",
});

const grandfatheredLanguageTags = new Set([
  "art-lojban",
  "cel-gaulish",
  "en-gb-oed",
  "i-ami",
  "i-bnn",
  "i-default",
  "i-enochian",
  "i-hak",
  "i-klingon",
  "i-lux",
  "i-mingo",
  "i-navajo",
  "i-pwn",
  "i-tao",
  "i-tay",
  "i-tsu",
  "no-bok",
  "no-nyn",
  "sgn-be-fr",
  "sgn-be-nl",
  "sgn-ch-de",
  "zh-guoyu",
  "zh-hakka",
  "zh-min",
  "zh-min-nan",
  "zh-xiang",
]);
const privateUseLanguageTag = /^x(?:-[A-Za-z\d]{1,8})+$/iu;
const structuredLanguageTag =
  /^(?:(?:[A-Za-z]{2,3}(?:-[A-Za-z]{3}){0,1}|[A-Za-z]{5,8})(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?(?:-(?:[A-Za-z\d]{5,8}|\d[A-Za-z\d]{3}))*(?:-[0-9A-WY-Za-wy-z](?:-[A-Za-z\d]{2,8})+)*(?:-x(?:-[A-Za-z\d]{1,8})+)?)$/u;

function isLanguageTag(value: string): boolean {
  if (value !== value.trim() || value.length === 0) {
    return false;
  }

  if (privateUseLanguageTag.test(value) || grandfatheredLanguageTags.has(value.toLowerCase())) {
    return true;
  }

  if (!structuredLanguageTag.test(value)) {
    return false;
  }

  const variants = new Set<string>();
  const extensionSingletons = new Set<string>();
  let inExtensions = false;
  for (const subtag of value.toLowerCase().split("-").slice(1)) {
    if (subtag === "x") {
      break;
    }
    if (subtag.length === 1) {
      if (extensionSingletons.has(subtag)) {
        return false;
      }
      extensionSingletons.add(subtag);
      inExtensions = true;
    } else if (
      !inExtensions &&
      ((subtag.length === 4 && /^\d/u.test(subtag)) || (subtag.length >= 5 && subtag.length <= 8))
    ) {
      if (variants.has(subtag)) {
        return false;
      }
      variants.add(subtag);
    }
  }
  return true;
}

const LearningEventLanguageTagSchema = z.string().refine(isLanguageTag, {
  message: "Must be a valid language tag",
});

const LearningEventLanguageMapSchema: z.ZodType<LearningEventLanguageMap> = z
  .record(LearningEventLanguageTagSchema, z.string().regex(/\S/u, { message: "Must be non-blank" }))
  .refine((value) => Object.keys(value).length > 0, {
    message: "Language maps must not be empty",
  });

const LearningEventJsonPrimitiveSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const invalidJsonObject = Symbol("invalid Learning Event JSON object");
const invalidLearningEventTree = Symbol("invalid Learning Event tree");
const LEARNING_EVENT_JSON_MAX_DEPTH = 32;

function requireNonEmptyPlainObject(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalidJsonObject;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return invalidJsonObject;
  }

  return Object.keys(value).length > 0 ? value : invalidJsonObject;
}

function containsUndefined(value: unknown): boolean {
  const active = new Set<object>();
  const pending: { readonly value: unknown; readonly leaving: boolean }[] = [
    { value, leaving: false },
  ];

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) {
      break;
    }
    if (current.leaving) {
      active.delete(current.value as object);
      continue;
    }
    if (current.value === undefined) {
      return true;
    }
    if (typeof current.value !== "object" || current.value === null) {
      continue;
    }
    if (active.has(current.value)) {
      return true;
    }

    active.add(current.value);
    pending.push({ value: current.value, leaving: true });
    for (const child of Array.isArray(current.value)
      ? current.value
      : Object.values(current.value)) {
      pending.push({ value: child, leaving: false });
    }
  }

  return false;
}

function requireDefinedLearningEventTree(value: unknown): unknown {
  return containsUndefined(value) ? invalidLearningEventTree : value;
}

const LearningEventJsonValueSchema: z.ZodType<LearningEventJsonValue, z.ZodTypeDef, unknown> =
  z.lazy(() =>
    z.union([
      LearningEventJsonPrimitiveSchema,
      z.array(LearningEventJsonValueSchema),
      z.preprocess(
        requireNonEmptyPlainObject,
        z.record(z.string(), LearningEventJsonValueSchema),
      ) as z.ZodType<{ readonly [key: string]: LearningEventJsonValue }, z.ZodTypeDef, unknown>,
    ]),
  );

function requireBoundedLearningEventExtensions(value: unknown): unknown {
  const extensions = requireNonEmptyPlainObject(value);
  if (extensions === invalidJsonObject) {
    return extensions;
  }

  const pending = Object.values(extensions as Record<string, unknown>).map((extensionValue) => ({
    value: extensionValue,
    depth: 0,
  }));
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || typeof current.value !== "object" || current.value === null) {
      continue;
    }
    if (current.depth >= LEARNING_EVENT_JSON_MAX_DEPTH) {
      return invalidJsonObject;
    }
    for (const child of Array.isArray(current.value)
      ? current.value
      : Object.values(current.value)) {
      pending.push({ value: child, depth: current.depth + 1 });
    }
  }

  return extensions;
}

const LearningEventExtensionsSchema: z.ZodType<
  Readonly<Record<LearningEventIri, LearningEventJsonValue>>,
  z.ZodTypeDef,
  unknown
> = z.preprocess(
  requireBoundedLearningEventExtensions,
  z.record(LearningEventIriSchema, LearningEventJsonValueSchema),
);

const LearningEventInteractionTypeSchema = z.enum([
  "true-false",
  "choice",
  "fill-in",
  "long-fill-in",
  "matching",
  "performance",
  "sequencing",
  "likert",
  "numeric",
  "other",
]);

const LearningEventInteractionComponentSchema = z
  .object({
    id: z.string(),
    description: LearningEventLanguageMapSchema.optional(),
  })
  .strict();

const LearningEventActivityDefinitionSchema = z
  .object({
    name: LearningEventLanguageMapSchema.optional(),
    description: LearningEventLanguageMapSchema.optional(),
    type: LearningEventIriSchema.optional(),
    interactionType: LearningEventInteractionTypeSchema.optional(),
    choices: z.array(LearningEventInteractionComponentSchema).optional(),
    source: z.array(LearningEventInteractionComponentSchema).optional(),
    target: z.array(LearningEventInteractionComponentSchema).optional(),
    extensions: LearningEventExtensionsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Activity definitions must not be empty",
  });

const LearningEventActivitySchema = z
  .object({
    objectType: z.literal("Activity"),
    id: LearningEventIriSchema,
    definition: LearningEventActivityDefinitionSchema.optional(),
  })
  .strict();

const LearningEventScoreSchema = z
  .object({
    scaled: z.number().finite().min(-1).max(1).optional(),
    raw: z.number().finite().optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  })
  .strict()
  .superRefine((score, context) => {
    if (Object.keys(score).length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scores must not be empty",
      });
    }

    if (score.min !== undefined && score.max !== undefined && score.min >= score.max) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Score min must be less than max",
      });
    }

    if (score.raw !== undefined && score.min !== undefined && score.raw < score.min) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Score raw must not be less than min",
      });
    }

    if (score.raw !== undefined && score.max !== undefined && score.raw > score.max) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Score raw must not be greater than max",
      });
    }
  });

const LearningEventResultSchema = z
  .object({
    score: LearningEventScoreSchema.optional(),
    success: z.boolean().optional(),
    completion: z.boolean().optional(),
    response: z.string().optional(),
    duration: LearningEventDurationSchema.optional(),
    extensions: LearningEventExtensionsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Results must not be empty",
  });

const LearningEventContextActivitiesSchema = z
  .object({
    parent: z.array(LearningEventActivitySchema).nonempty().optional(),
    grouping: z.array(LearningEventActivitySchema).nonempty().optional(),
    category: z.array(LearningEventActivitySchema).nonempty().optional(),
    other: z.array(LearningEventActivitySchema).nonempty().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Context Activities must not be empty",
  });

const LearningEventContextSchema = z
  .object({
    contextActivities: LearningEventContextActivitiesSchema.optional(),
    extensions: LearningEventExtensionsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Context must not be empty",
  });

const LearningEventDraftShape = {
  verb: z
    .object({
      id: LearningEventIriSchema,
      display: LearningEventLanguageMapSchema,
    })
    .strict(),
  object: LearningEventActivitySchema,
  result: LearningEventResultSchema.optional(),
  context: LearningEventContextSchema.optional(),
};

const LearningEventDraftValueSchema = z.object(LearningEventDraftShape).strict();

export const LearningEventDraftSchema: z.ZodType<LearningEventDraft, z.ZodTypeDef, unknown> = z
  .preprocess(requireDefinedLearningEventTree, LearningEventDraftValueSchema)
  // The preprocessor rejects explicit undefined recursively, narrowing Zod's
  // exact-optional output to the public interface.
  .transform((value): LearningEventDraft => value as LearningEventDraft);

const LearningEventValueSchema = z
  .object({
    id: LearningEventUuidSchema,
    timestamp: LearningEventTimestampSchema,
    ...LearningEventDraftShape,
  })
  .strict();

export const LearningEventSchema: z.ZodType<LearningEvent, z.ZodTypeDef, unknown> = z
  .preprocess(requireDefinedLearningEventTree, LearningEventValueSchema)
  // The preprocessor rejects explicit undefined recursively, narrowing Zod's
  // exact-optional output to the public interface.
  .transform((value): LearningEvent => value as LearningEvent);
