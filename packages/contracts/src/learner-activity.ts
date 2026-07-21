import { z } from "zod";

export const SCAFFOLD_LEARNER_ACTIVITY_SNAPSHOT_VERSION = 1;

const NonBlankStringSchema = z.string().regex(/\S/, {
  message: "Must be a non-blank string",
});

const PortableLearnerActivityTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .regex(
    /^(?!0000)\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/,
  );

const LearnerActivityJsonPrimitiveSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

type RecursiveLearnerActivityJsonValue =
  | z.infer<typeof LearnerActivityJsonPrimitiveSchema>
  | RecursiveLearnerActivityJsonValue[]
  | { [key: string]: RecursiveLearnerActivityJsonValue };

const invalidJsonObject = Symbol("invalid learner activity JSON object");

function requirePlainObject(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalidJsonObject;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value : invalidJsonObject;
}

export const LearnerActivityJsonValueSchema: z.ZodType<
  RecursiveLearnerActivityJsonValue,
  z.ZodTypeDef,
  unknown
> = z.lazy(() =>
  z.union([
    LearnerActivityJsonPrimitiveSchema,
    z.array(LearnerActivityJsonValueSchema),
    z.preprocess(requirePlainObject, z.record(z.string(), LearnerActivityJsonValueSchema)),
  ]),
);
export type LearnerActivityJsonValue = z.infer<typeof LearnerActivityJsonValueSchema>;

export const LearnerActivityDataSchema = z.preprocess(
  requirePlainObject,
  z.record(z.string(), LearnerActivityJsonValueSchema),
);
export type LearnerActivityData = z.infer<typeof LearnerActivityDataSchema>;

export const LearnerActivityRecordSchema = z
  .object({
    activityKind: NonBlankStringSchema,
    data: LearnerActivityDataSchema,
    completed: z.boolean(),
    updatedAt: PortableLearnerActivityTimestampSchema.nullable(),
  })
  .strict();
export type LearnerActivityRecord = z.infer<typeof LearnerActivityRecordSchema>;

const LearnerActivityBlockIdSchema = NonBlankStringSchema.regex(/^(?!artifact:[\s\S]*\/block:)/, {
  message: "Activity keys must be authored block ids, not runtime composite ids",
});

export const LearnerActivitySnapshotSchema = z
  .object({
    snapshotVersion: z.literal(SCAFFOLD_LEARNER_ACTIVITY_SNAPSHOT_VERSION),
    artifactId: NonBlankStringSchema,
    activities: z.record(LearnerActivityBlockIdSchema, LearnerActivityRecordSchema),
  })
  .strict();
export type LearnerActivitySnapshot = z.infer<typeof LearnerActivitySnapshotSchema>;
