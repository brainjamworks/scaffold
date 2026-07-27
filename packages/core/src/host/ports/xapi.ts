import { z } from "zod";

export type XapiIri = string;
export type XapiUuid = string;
export type XapiTimestamp = string;
export type XapiDuration = string;
export type XapiLanguageMap = Readonly<Record<string, string>>;
export type XapiJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly XapiJsonValue[]
  | { readonly [key: string]: XapiJsonValue };

export interface XapiVerb {
  readonly id: XapiIri;
  readonly display: XapiLanguageMap;
}

export type XapiInteractionType =
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

export interface XapiActivityDefinition {
  readonly name?: XapiLanguageMap;
  readonly description?: XapiLanguageMap;
  readonly type?: XapiIri;
  readonly interactionType?: XapiInteractionType;
  readonly extensions?: Readonly<Record<XapiIri, XapiJsonValue>>;
}

export interface XapiActivity {
  readonly objectType: "Activity";
  readonly id: XapiIri;
  readonly definition?: XapiActivityDefinition;
}

export interface XapiScore {
  readonly scaled?: number;
  readonly raw?: number;
  readonly min?: number;
  readonly max?: number;
}

export interface XapiResult {
  readonly score?: XapiScore;
  readonly success?: boolean;
  readonly completion?: boolean;
  readonly response?: string;
  readonly duration?: XapiDuration;
  readonly extensions?: Readonly<Record<XapiIri, XapiJsonValue>>;
}

export interface XapiContextTemplate {
  readonly contextActivities?: {
    readonly parent?: readonly XapiActivity[];
    readonly grouping?: readonly XapiActivity[];
    readonly category?: readonly XapiActivity[];
    readonly other?: readonly XapiActivity[];
  };
  readonly extensions?: Readonly<Record<XapiIri, XapiJsonValue>>;
}

export interface XapiStatementDraft {
  readonly verb: XapiVerb;
  readonly object: XapiActivity;
  readonly result?: XapiResult;
  readonly context?: XapiContextTemplate;
}

/**
 * Partial standard xAPI Statement template produced by Scaffold Core.
 *
 * Core owns the learning semantics, Statement ID, event timestamp, and
 * ordering. It deliberately omits Actor identity and host placement or
 * registration Context; a trusted runtime host enriches those fields for
 * delivery without replacing Core-owned values.
 */
export interface XapiStatementTemplate extends XapiStatementDraft {
  readonly id: XapiUuid;
  readonly timestamp: XapiTimestamp;
}

/**
 * Optional learner-runtime boundary for accepting Core xAPI templates.
 *
 * Omitting this port disables learning-record emission without changing
 * assessment, persistence, grading, or learner-facing results. An
 * implementation is a trusted host boundary, not an endpoint or LRS client.
 */
export interface XapiPort {
  /**
   * Stable absolute IRI for the root course Activity in this host placement.
   * It contains no learner identity, credential, or secret.
   */
  readonly activityId: XapiIri;

  /**
   * Accepts a partial Core template for trusted enrichment and ordered
   * delivery. Resolution means the host has accepted ownership of delivery,
   * including any later retry. Rejection means the template was not accepted,
   * permanently stops emission for this Core session, and cannot change the
   * learner operation that produced it.
   */
  send(statement: XapiStatementTemplate): Promise<void>;
}

const absoluteIriScheme = /^[A-Za-z][A-Za-z\d+.-]*:/;

function isAbsoluteIri(value: string): boolean {
  if (value !== value.trim() || /\s/u.test(value) || !absoluteIriScheme.test(value)) {
    return false;
  }

  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export const XapiIriSchema = z.string().refine(isAbsoluteIri, {
  message: "Must be an absolute IRI",
});

const XapiUuidSchema = z.string().uuid();

const XapiTimestampSchema = z
  .string()
  .datetime({ offset: false })
  .regex(/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,}Z$/u, {
    message: "Must be an RFC 3339 UTC timestamp with at least millisecond precision",
  });

const XapiDurationSchema = z.string().duration();

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

function isLanguageTag(value: string): boolean {
  if (value !== value.trim() || value.length === 0) {
    return false;
  }

  if (privateUseLanguageTag.test(value) || grandfatheredLanguageTags.has(value.toLowerCase())) {
    return true;
  }

  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

const XapiLanguageTagSchema = z.string().refine(isLanguageTag, {
  message: "Must be a valid language tag",
});

const XapiLanguageMapSchema: z.ZodType<XapiLanguageMap> = z
  .record(XapiLanguageTagSchema, z.string().regex(/\S/u, { message: "Must be non-blank" }))
  .refine((value) => Object.keys(value).length > 0, {
    message: "Language maps must not be empty",
  });

const XapiJsonPrimitiveSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);

const invalidJsonObject = Symbol("invalid xAPI JSON object");
const invalidStatementTree = Symbol("invalid xAPI Statement tree");

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

function containsUndefined(value: unknown, visited = new Set<object>()): boolean {
  if (value === undefined) {
    return true;
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (visited.has(value)) {
    return true;
  }
  visited.add(value);

  const result = (Array.isArray(value) ? value : Object.values(value)).some((child) =>
    containsUndefined(child, visited),
  );
  visited.delete(value);
  return result;
}

function requireDefinedStatementTree(value: unknown): unknown {
  return containsUndefined(value) ? invalidStatementTree : value;
}

const XapiJsonValueSchema: z.ZodType<XapiJsonValue, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.union([
    XapiJsonPrimitiveSchema,
    z.array(XapiJsonValueSchema),
    z.preprocess(
      requireNonEmptyPlainObject,
      z.record(z.string(), XapiJsonValueSchema),
    ) as z.ZodType<{ readonly [key: string]: XapiJsonValue }, z.ZodTypeDef, unknown>,
  ]),
);

const XapiExtensionsSchema: z.ZodType<
  Readonly<Record<XapiIri, XapiJsonValue>>,
  z.ZodTypeDef,
  unknown
> = z.preprocess(requireNonEmptyPlainObject, z.record(XapiIriSchema, XapiJsonValueSchema));

const XapiInteractionTypeSchema = z.enum([
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

const XapiActivityDefinitionSchema = z
  .object({
    name: XapiLanguageMapSchema.optional(),
    description: XapiLanguageMapSchema.optional(),
    type: XapiIriSchema.optional(),
    interactionType: XapiInteractionTypeSchema.optional(),
    extensions: XapiExtensionsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Activity definitions must not be empty",
  });

const XapiActivitySchema = z
  .object({
    objectType: z.literal("Activity"),
    id: XapiIriSchema,
    definition: XapiActivityDefinitionSchema.optional(),
  })
  .strict();

const XapiScoreSchema = z
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

const XapiResultSchema = z
  .object({
    score: XapiScoreSchema.optional(),
    success: z.boolean().optional(),
    completion: z.boolean().optional(),
    response: z.string().optional(),
    duration: XapiDurationSchema.optional(),
    extensions: XapiExtensionsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Results must not be empty",
  });

const XapiContextActivitiesSchema = z
  .object({
    parent: z.array(XapiActivitySchema).nonempty().optional(),
    grouping: z.array(XapiActivitySchema).nonempty().optional(),
    category: z.array(XapiActivitySchema).nonempty().optional(),
    other: z.array(XapiActivitySchema).nonempty().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Context Activities must not be empty",
  });

const XapiContextTemplateSchema = z
  .object({
    contextActivities: XapiContextActivitiesSchema.optional(),
    extensions: XapiExtensionsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Context must not be empty",
  });

const XapiStatementDraftShape = {
  verb: z
    .object({
      id: XapiIriSchema,
      display: XapiLanguageMapSchema,
    })
    .strict(),
  object: XapiActivitySchema,
  result: XapiResultSchema.optional(),
  context: XapiContextTemplateSchema.optional(),
};

const XapiStatementDraftValueSchema = z.object(XapiStatementDraftShape).strict();

export const XapiStatementDraftSchema: z.ZodType<XapiStatementDraft, z.ZodTypeDef, unknown> = z
  .preprocess(requireDefinedStatementTree, XapiStatementDraftValueSchema)
  // The preprocessor rejects explicit undefined recursively, narrowing Zod's
  // exact-optional output to the public interface.
  .transform((value): XapiStatementDraft => value as XapiStatementDraft);

const XapiStatementTemplateValueSchema = z
  .object({
    id: XapiUuidSchema,
    timestamp: XapiTimestampSchema,
    ...XapiStatementDraftShape,
  })
  .strict();

export const XapiStatementTemplateSchema: z.ZodType<XapiStatementTemplate, z.ZodTypeDef, unknown> =
  z
    .preprocess(requireDefinedStatementTree, XapiStatementTemplateValueSchema)
    // The preprocessor rejects explicit undefined recursively, narrowing Zod's
    // exact-optional output to the public interface.
    .transform((value): XapiStatementTemplate => value as XapiStatementTemplate);
