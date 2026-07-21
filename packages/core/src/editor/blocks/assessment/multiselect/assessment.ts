import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import {
  MultiSelectResponseSchema,
  MultiselectPrivateAssessmentSchema,
  type AssessmentAnswerKey,
  type AssessmentInteractionContract,
  type AssessmentResponseValue,
  type AssessmentTargetSettings,
} from "@scaffold/contracts";

import type { AssessmentBlockAdapter } from "@/editor/blocks/assessment/shared/model/assessment-block-adapter";
import type { AssessmentCapabilityResponseDefinition } from "@/editor/blocks/block-definition";
import {
  childByType,
  childrenOfType,
  childText,
  cloneJsonNodeWithoutContent,
  omitAttrs,
  optionalNullableNumberField,
  optionalStringField,
  readAttrs,
  readContent,
  readNullableNumber,
  readOptionalString,
  redactCommonAssessmentShellNode,
  redactSelectableChoicesGroupNode,
} from "@/editor/blocks/assessment/shared/publication/projection";

export const MultiselectResponseSchema = z
  .object({
    choices: z.array(z.string()).default([]),
  })
  .strict();
export type MultiselectResponse = z.infer<typeof MultiselectResponseSchema>;

export function projectMultiselectLearnerNode(node: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(node),
    attrs: omitAttrs(node, ["assessment"]),
    content: readContent(node).map((child) =>
      child.type === "assessment_choices_group"
        ? redactSelectableChoicesGroupNode(child)
        : redactCommonAssessmentShellNode(child),
    ),
  };
}

export function projectMultiselectInteraction(
  node: JSONContent,
  settings: unknown,
): AssessmentInteractionContract {
  return {
    kind: "multi-select",
    options: projectSelectableOptions(node),
    maxSelections: readNullableNumber(settings, "maxSelect") ?? null,
  };
}

export function projectMultiselectAssessment(node: JSONContent): AssessmentAnswerKey {
  const assessment = MultiselectPrivateAssessmentSchema.parse(readAttrs(node)["assessment"] ?? {});
  return {
    kind: "multi-select",
    correctOptionIds: assessment.correctOptionIds,
    feedbackByOptionId: assessment.feedbackByOptionId,
    summaryFeedback: assessment.summaryFeedback,
  };
}

export function projectMultiselectSettings(settings: unknown): Partial<AssessmentTargetSettings> {
  return {
    ...optionalStringField("legend", readOptionalString(settings, "legend")),
    ...optionalNullableNumberField("maxSelections", readNullableNumber(settings, "maxSelect")),
  };
}

function projectSelectableOptions(node: JSONContent): Array<{ id: string; label?: string }> {
  return projectSelectableChoiceEntries(node).map(({ id, label }) => ({
    id,
    ...(label ? { label } : {}),
  }));
}

function projectSelectableChoiceEntries(node: JSONContent): Array<{ id: string; label?: string }> {
  const out: Array<{
    id: string;
    label?: string;
  }> = [];
  const group = childByType(node, "assessment_choices_group");
  if (!group) return out;

  for (const choice of childrenOfType(group, "selectable_choice")) {
    const id = readStringChoiceId(choice);
    if (!id) continue;
    const label = childText(choice, "selectable_choice_body");
    out.push({
      id,
      ...(label ? { label } : {}),
    });
  }

  return out;
}

function readStringChoiceId(choice: JSONContent): string {
  const id = readAttrs(choice)["id"];
  return typeof id === "string" ? id : "";
}

function assertUniqueOptionIds(optionIds: readonly string[]): void {
  if (new Set(optionIds).size !== optionIds.length) {
    throw new Error("Multi-select response option ids must be unique.");
  }
}

export function toMultiselectContractResponse(response: unknown) {
  const local = MultiselectResponseSchema.parse(response);
  assertUniqueOptionIds(local.choices);
  return MultiSelectResponseSchema.parse({ kind: "multi-select", optionIds: local.choices });
}

export function fromMultiselectContractResponse(
  response: AssessmentResponseValue,
): MultiselectResponse {
  const canonical = MultiSelectResponseSchema.parse(response);
  assertUniqueOptionIds(canonical.optionIds);
  return MultiselectResponseSchema.parse({ choices: canonical.optionIds });
}

export function hasMultiselectResponse(response: unknown): boolean {
  return MultiselectResponseSchema.parse(response).choices.length > 0;
}

export const multiselectResponseCodec: AssessmentCapabilityResponseDefinition<MultiselectResponse> =
  {
    schema: MultiselectResponseSchema,
    toContractResponse: toMultiselectContractResponse,
    fromContractResponse: fromMultiselectContractResponse,
    hasResponse: hasMultiselectResponse,
  };

export const multiselectAssessmentAdapter: AssessmentBlockAdapter = {
  interactionKind: "multi-select",
  choiceMode: "multiple",
  response: multiselectResponseCodec,
};
