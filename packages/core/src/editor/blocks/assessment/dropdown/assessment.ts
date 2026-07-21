import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import {
  DropdownPrivateAssessmentSchema,
  SingleSelectResponseSchema,
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
  optionalStringField,
  readAttrs,
  readContent,
  readOptionalString,
  redactCommonAssessmentShellNode,
} from "@/editor/blocks/assessment/shared/publication/projection";

export const DropdownResponseSchema = z
  .object({
    choices: z.string().nullable().default(null),
  })
  .strict();
export type DropdownResponse = z.infer<typeof DropdownResponseSchema>;

export function projectDropdownLearnerNode(node: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(node),
    attrs: omitAttrs(node, ["assessment"]),
    content: readContent(node).map((child) =>
      child.type === "dropdown_choices_group"
        ? projectDropdownChoicesGroupLearnerNode(child)
        : redactCommonAssessmentShellNode(child),
    ),
  };
}

export function projectDropdownInteraction(node: JSONContent): AssessmentInteractionContract {
  return {
    kind: "single-select",
    options: projectDropdownChoiceEntries(node).map(({ id, label }) => ({
      id,
      ...(label ? { label } : {}),
    })),
  };
}

export function projectDropdownAssessment(node: JSONContent): AssessmentAnswerKey {
  const assessment = DropdownPrivateAssessmentSchema.parse(readAttrs(node)["assessment"] ?? {});
  return {
    kind: "single-select",
    correctOptionId: assessment.correctOptionId,
    feedbackByOptionId: assessment.feedbackByOptionId,
    summaryFeedback: assessment.summaryFeedback,
  };
}

export function projectDropdownSettings(settings: unknown): Partial<AssessmentTargetSettings> {
  return {
    ...optionalStringField("label", readOptionalString(settings, "label")),
    ...optionalStringField("placeholder", readOptionalString(settings, "placeholder")),
  };
}

function projectDropdownChoicesGroupLearnerNode(group: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(group),
    content: readContent(group).map((child) =>
      child.type === "dropdown_choice"
        ? projectDropdownChoiceLearnerNode(child)
        : redactCommonAssessmentShellNode(child),
    ),
  };
}

function projectDropdownChoiceLearnerNode(choice: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(choice),
    attrs: readAttrs(choice),
    content: readContent(choice).map((child) => redactCommonAssessmentShellNode(child)),
  };
}

function projectDropdownChoiceEntries(node: JSONContent): Array<{ id: string; label?: string }> {
  const out: Array<{
    id: string;
    label?: string;
  }> = [];
  const group = childByType(node, "dropdown_choices_group");
  if (!group) return out;

  for (const choice of childrenOfType(group, "dropdown_choice")) {
    const id = readStringChoiceId(choice);
    if (!id) continue;
    const label = childText(choice, "dropdown_choice_label");
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

export function toDropdownContractResponse(response: unknown) {
  const local = DropdownResponseSchema.parse(response);
  return SingleSelectResponseSchema.parse({
    kind: "single-select",
    optionId: local.choices,
  });
}

export function fromDropdownContractResponse(response: AssessmentResponseValue): DropdownResponse {
  const canonical = SingleSelectResponseSchema.parse(response);
  return DropdownResponseSchema.parse({ choices: canonical.optionId });
}

export function hasDropdownResponse(response: unknown): boolean {
  return DropdownResponseSchema.parse(response).choices !== null;
}

export const dropdownResponseCodec: AssessmentCapabilityResponseDefinition<DropdownResponse> = {
  schema: DropdownResponseSchema,
  toContractResponse: toDropdownContractResponse,
  fromContractResponse: fromDropdownContractResponse,
  hasResponse: hasDropdownResponse,
};

export const dropdownAssessmentAdapter: AssessmentBlockAdapter = {
  interactionKind: "single-select",
  choiceMode: "single",
  response: dropdownResponseCodec,
};
