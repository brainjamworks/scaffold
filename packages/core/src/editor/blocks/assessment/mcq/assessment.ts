import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import {
  McqPrivateAssessmentSchema,
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
  redactSelectableChoicesGroupNode,
} from "@/editor/blocks/assessment/shared/publication/projection";

export const McqResponseSchema = z
  .object({
    choices: z.string().nullable().default(null),
  })
  .strict();
export type McqResponse = z.infer<typeof McqResponseSchema>;

export function projectMcqLearnerNode(node: JSONContent): JSONContent {
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

export function projectMcqInteraction(node: JSONContent): AssessmentInteractionContract {
  return {
    kind: "single-select",
    options: projectSelectableOptions(node),
  };
}

export function projectMcqAssessment(node: JSONContent): AssessmentAnswerKey {
  const assessment = McqPrivateAssessmentSchema.parse(readAttrs(node)["assessment"] ?? {});
  return {
    kind: "single-select",
    correctOptionId: assessment.correctOptionId,
    feedbackByOptionId: assessment.feedbackByOptionId,
    summaryFeedback: assessment.summaryFeedback,
  };
}

export function projectMcqSettings(settings: unknown): Partial<AssessmentTargetSettings> {
  return optionalStringField("legend", readOptionalString(settings, "legend"));
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

export function toMcqContractResponse(response: unknown) {
  const local = McqResponseSchema.parse(response);
  return SingleSelectResponseSchema.parse({
    kind: "single-select",
    optionId: local.choices,
  });
}

export function fromMcqContractResponse(response: AssessmentResponseValue): McqResponse {
  const canonical = SingleSelectResponseSchema.parse(response);
  return McqResponseSchema.parse({ choices: canonical.optionId });
}

export function hasMcqResponse(response: unknown): boolean {
  return McqResponseSchema.parse(response).choices !== null;
}

export const mcqResponseCodec: AssessmentCapabilityResponseDefinition<McqResponse> = {
  schema: McqResponseSchema,
  toContractResponse: toMcqContractResponse,
  fromContractResponse: fromMcqContractResponse,
  hasResponse: hasMcqResponse,
};

export const mcqAssessmentAdapter: AssessmentBlockAdapter = {
  interactionKind: "single-select",
  choiceMode: "single",
  response: mcqResponseCodec,
};
