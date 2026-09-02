import { z } from "zod";

import { EmbeddedDataIdSchema, EmbeddedNodeIdSchema, type EmbeddedDataId } from "./embedded-id";

const NonBlankCapabilityNameSchema = z.string().trim().min(1);
const ControlValueSchema = z.union([z.boolean(), z.string(), z.number().finite()]);

export const ControlEventReferenceV1Schema = z
  .object({ targetId: EmbeddedNodeIdSchema, type: NonBlankCapabilityNameSchema })
  .strict();
export type ControlEventReferenceV1 = z.infer<typeof ControlEventReferenceV1Schema>;

export const ControlStatePredicateV1Schema = z
  .object({
    targetId: EmbeddedNodeIdSchema,
    key: NonBlankCapabilityNameSchema,
    operator: z.enum(["equals", "not-equals"]),
    value: ControlValueSchema,
  })
  .strict();
export type ControlStatePredicateV1 = z.infer<typeof ControlStatePredicateV1Schema>;

export const ControlCommandReferenceV1Schema = z
  .object({
    targetId: EmbeddedNodeIdSchema,
    type: NonBlankCapabilityNameSchema,
    input: ControlValueSchema.optional(),
  })
  .strict();
export type ControlCommandReferenceV1 = z.infer<typeof ControlCommandReferenceV1Schema>;

export const LearnerInteractionCommandV1Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reveal-target"), targetId: EmbeddedNodeIdSchema }).strict(),
  z
    .object({
      kind: z.literal("target-command"),
      command: ControlCommandReferenceV1Schema,
    })
    .strict(),
  z.object({ kind: z.literal("navigate-surface"), surfaceId: EmbeddedNodeIdSchema }).strict(),
]);
export type LearnerInteractionCommandV1 = z.infer<typeof LearnerInteractionCommandV1Schema>;

export type LearnerInteractionRuleId = EmbeddedDataId;

export const LearnerInteractionRuleV1Schema = z
  .object({
    id: EmbeddedDataIdSchema,
    isEnabled: z.boolean(),
    when: ControlEventReferenceV1Schema,
    conditions: z.array(ControlStatePredicateV1Schema),
    commands: z.array(LearnerInteractionCommandV1Schema).nonempty(),
  })
  .strict();
export type LearnerInteractionRuleV1 = z.infer<typeof LearnerInteractionRuleV1Schema>;

export const SurfaceLearnerInteractionRulesV1Schema = z
  .object({
    surfaceId: EmbeddedNodeIdSchema,
    rules: z.array(LearnerInteractionRuleV1Schema).nonempty(),
  })
  .strict()
  .superRefine((surface, context) => {
    const ruleIds = new Set<string>();
    for (const [ruleIndex, rule] of surface.rules.entries()) {
      if (ruleIds.has(rule.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rules", ruleIndex, "id"],
          message: "Rule IDs must be unique within a Surface group.",
        });
      }
      ruleIds.add(rule.id);
    }
  });
export type SurfaceLearnerInteractionRulesV1 = z.infer<
  typeof SurfaceLearnerInteractionRulesV1Schema
>;

export const LearnerInteractionConfigurationV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    surfaces: z.array(SurfaceLearnerInteractionRulesV1Schema).nonempty(),
  })
  .strict()
  .superRefine((configuration, context) => {
    const surfaceIds = new Set<string>();
    for (const [surfaceIndex, surface] of configuration.surfaces.entries()) {
      if (surfaceIds.has(surface.surfaceId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["surfaces", surfaceIndex, "surfaceId"],
          message: "Surface IDs must be unique.",
        });
      }
      surfaceIds.add(surface.surfaceId);
    }
  });
export type LearnerInteractionConfigurationV1 = z.infer<
  typeof LearnerInteractionConfigurationV1Schema
>;
