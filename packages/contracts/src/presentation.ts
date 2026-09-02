import { z } from "zod";

import { EmbeddedDataIdSchema, EmbeddedNodeIdSchema } from "./embedded-id";
import { ExternalMediaSourceSchema, ManagedMediaSourceSchema } from "./media";

const SafeTimeMsSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const PositiveDurationMsSchema = SafeTimeMsSchema.min(1);
const NonBlankCapabilityNameSchema = z.string().trim().min(1);
const ControlValueSchema = z.union([z.boolean(), z.string(), z.number().finite()]);

export const PresentationVisualCapabilityIdSchema = z.enum([
  "reveal",
  "hide",
  "emphasize",
]);
export type PresentationVisualCapabilityId = z.infer<typeof PresentationVisualCapabilityIdSchema>;

const PresentationPresetEasingV1Schema = z
  .object({
    kind: z.literal("preset"),
    preset: z.enum(["linear", "ease-in", "ease-out", "ease-in-out"]),
  })
  .strict();
const PresentationCubicBezierEasingV1Schema = z
  .object({
    kind: z.literal("cubic-bezier"),
    x1: z.number().finite().min(0).max(1),
    y1: z.number().finite().min(-10).max(10),
    x2: z.number().finite().min(0).max(1),
    y2: z.number().finite().min(-10).max(10),
  })
  .strict();
export const PresentationEasingV1Schema = z.discriminatedUnion("kind", [
  PresentationPresetEasingV1Schema,
  PresentationCubicBezierEasingV1Schema,
]);
export type PresentationEasingV1 = z.infer<typeof PresentationEasingV1Schema>;

const InstantVisibilityTransitionV1Schema = z.object({ kind: z.literal("instant") }).strict();
const FadeVisibilityTransitionV1Schema = z
  .object({
    kind: z.literal("fade"),
    durationMs: PositiveDurationMsSchema,
    easing: PresentationEasingV1Schema,
  })
  .strict();
const DirectionalVisibilityTransitionV1Schema = z
  .object({
    kind: z.enum(["slide", "float", "wipe"]),
    direction: z.enum(["up", "right", "down", "left"]),
    durationMs: PositiveDurationMsSchema,
    easing: PresentationEasingV1Schema,
  })
  .strict();
const ScaleVisibilityTransitionV1Schema = z
  .object({
    kind: z.literal("scale"),
    durationMs: PositiveDurationMsSchema,
    easing: PresentationEasingV1Schema,
  })
  .strict();
export const VisibilityTransitionV1Schema = z.discriminatedUnion("kind", [
  InstantVisibilityTransitionV1Schema,
  FadeVisibilityTransitionV1Schema,
  DirectionalVisibilityTransitionV1Schema,
  ScaleVisibilityTransitionV1Schema,
]);
export type VisibilityTransitionV1 = z.infer<typeof VisibilityTransitionV1Schema>;

const RevealVisualIntentV1Schema = z
  .object({ kind: z.literal("reveal"), transition: VisibilityTransitionV1Schema })
  .strict();
const HideVisualIntentV1Schema = z
  .object({ kind: z.literal("hide"), transition: VisibilityTransitionV1Schema })
  .strict();
const EmphasizeVisualIntentV1Schema = z
  .object({
    kind: z.literal("emphasize"),
    durationMs: PositiveDurationMsSchema,
    easing: PresentationEasingV1Schema,
    effect: z.enum(["outline", "pulse"]),
  })
  .strict();
export const PresentationVisualIntentV1Schema = z.union([
  RevealVisualIntentV1Schema,
  HideVisualIntentV1Schema,
  EmphasizeVisualIntentV1Schema,
]);
export type PresentationVisualIntentV1 = z.infer<typeof PresentationVisualIntentV1Schema>;

export const TimelineAnimateActionV1Schema = z
  .object({
    kind: z.literal("animate"),
    id: EmbeddedDataIdSchema,
    targetId: EmbeddedNodeIdSchema,
    isEnabled: z.boolean(),
    atMs: SafeTimeMsSchema,
    visual: PresentationVisualIntentV1Schema,
  })
  .strict();
export type TimelineAnimateActionV1 = z.infer<typeof TimelineAnimateActionV1Schema>;

const TimelineTriggerCommandV1Schema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("target-command"),
      targetId: EmbeddedNodeIdSchema,
      type: NonBlankCapabilityNameSchema,
      input: ControlValueSchema.optional(),
    })
    .strict(),
  z
    .object({ kind: z.literal("navigate-surface"), surfaceId: EmbeddedNodeIdSchema })
    .strict(),
]);
export type TimelineTriggerCommandV1 = z.infer<typeof TimelineTriggerCommandV1Schema>;

export const TimelineTriggerActionV1Schema = z
  .object({
    kind: z.literal("trigger"),
    id: EmbeddedDataIdSchema,
    isEnabled: z.boolean(),
    atMs: SafeTimeMsSchema,
    command: TimelineTriggerCommandV1Schema,
  })
  .strict();
export type TimelineTriggerActionV1 = z.infer<typeof TimelineTriggerActionV1Schema>;

const LearnerRequirementV1Schema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("event"),
      targetId: EmbeddedNodeIdSchema,
      type: NonBlankCapabilityNameSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("state"),
      targetId: EmbeddedNodeIdSchema,
      key: NonBlankCapabilityNameSchema,
      equals: ControlValueSchema,
    })
    .strict(),
]);
export type LearnerRequirementV1 = z.infer<typeof LearnerRequirementV1Schema>;

export const TimelineWaitActionV1Schema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("manual-wait"),
      id: EmbeddedDataIdSchema,
      isEnabled: z.boolean(),
      atMs: SafeTimeMsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("learner-wait"),
      id: EmbeddedDataIdSchema,
      isEnabled: z.boolean(),
      atMs: SafeTimeMsSchema,
      requirement: LearnerRequirementV1Schema,
    })
    .strict(),
]);
export type TimelineWaitActionV1 = z.infer<typeof TimelineWaitActionV1Schema>;

export const TimelineActionV1Schema = z.union([
  TimelineAnimateActionV1Schema,
  TimelineTriggerActionV1Schema,
  TimelineWaitActionV1Schema,
]);
export type TimelineActionV1 = z.infer<typeof TimelineActionV1Schema>;

const StrictMediaSourceSchema = z.discriminatedUnion("mode", [
  ExternalMediaSourceSchema.strict(),
  ManagedMediaSourceSchema.strict(),
]);
export const SurfacePresentationNarrationV1Schema = z
  .object({ source: StrictMediaSourceSchema })
  .strict();
export type SurfacePresentationNarrationV1 = z.infer<
  typeof SurfacePresentationNarrationV1Schema
>;

export const SurfaceTransitionV1Schema = z
  .object({
    kind: z.enum(["fade", "slide", "wipe"]),
    durationMs: PositiveDurationMsSchema,
  })
  .strict();
export type SurfaceTransitionV1 = z.infer<typeof SurfaceTransitionV1Schema>;

export const SurfacePresentationTimelineV1Schema = z
  .object({
    surfaceId: EmbeddedNodeIdSchema,
    durationMs: SafeTimeMsSchema,
    narration: SurfacePresentationNarrationV1Schema.optional(),
    transition: SurfaceTransitionV1Schema.optional(),
    actions: z.array(TimelineActionV1Schema),
  })
  .strict()
  .superRefine((surface, context) => {
    const waitTimes = new Set<number>();
    for (const [index, action] of surface.actions.entries()) {
      if (action.atMs > surface.durationMs) {
        addIssue(context, ["actions", index, "atMs"], "Action time exceeds Surface duration.");
      }
      const durationMs = durationOf(action);
      if (durationMs !== 0 && action.atMs + durationMs > surface.durationMs) {
        addIssue(
          context,
          ["actions", index],
          "Timed action must end within the Surface duration.",
        );
      }
      if (action.kind === "manual-wait" || action.kind === "learner-wait") {
        if (waitTimes.has(action.atMs)) {
          addIssue(context, ["actions", index, "atMs"], "Only one Wait may use a timestamp.");
        }
        waitTimes.add(action.atMs);
      }
    }
  });
export type SurfacePresentationTimelineV1 = z.infer<
  typeof SurfacePresentationTimelineV1Schema
>;

export const PresentationConfigurationV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    autoAdvance: z.boolean(),
    allowPrevious: z.boolean(),
    surfaces: z.array(SurfacePresentationTimelineV1Schema).min(1),
  })
  .strict()
  .superRefine((configuration, context) => {
    const surfaceIds = new Set<string>();
    const actionIds = new Set<string>();
    for (const [surfaceIndex, surface] of configuration.surfaces.entries()) {
      if (surfaceIds.has(surface.surfaceId)) {
        addIssue(context, ["surfaces", surfaceIndex, "surfaceId"], "Surface IDs must be unique.");
      }
      surfaceIds.add(surface.surfaceId);
      for (const [actionIndex, action] of surface.actions.entries()) {
        if (actionIds.has(action.id)) {
          addIssue(
            context,
            ["surfaces", surfaceIndex, "actions", actionIndex, "id"],
            "Presentation action IDs must be unique.",
          );
        }
        actionIds.add(action.id);
      }
    }
  });
export type PresentationConfigurationV1 = z.infer<typeof PresentationConfigurationV1Schema>;

function durationOf(action: TimelineActionV1): number {
  if (action.kind !== "animate") return 0;
  if (action.visual.kind === "reveal" || action.visual.kind === "hide") {
    return action.visual.transition.kind === "instant" ? 0 : action.visual.transition.durationMs;
  }
  return action.visual.durationMs;
}

function addIssue(context: z.RefinementCtx, path: (string | number)[], message: string): void {
  context.addIssue({ code: z.ZodIssueCode.custom, path, message });
}
