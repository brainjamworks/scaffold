import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import {
  FillBlankAttrsSchema,
  FillBlanksPrivateAssessmentSchema,
  FillBlanksResponseSchema as ContractFillBlanksResponseSchema,
  type AssessmentAnswerKey,
  type AssessmentFeedbackContent,
  type AssessmentInteractionContract,
  type AssessmentResponseValue,
  type AssessmentTargetSettings,
} from "@scaffold/contracts";

import type { AssessmentBlockAdapter } from "@/editor/blocks/assessment/shared/model/assessment-block-adapter";
import type { AssessmentCapabilityResponseDefinition } from "@/editor/blocks/block-definition";
import {
  cloneJsonNodeWithoutContent,
  omitAttrs,
  optionalStringField,
  readAttrs,
  readContent,
  readOptionalString,
  redactCommonAssessmentShellNode,
  walkDescendants,
} from "@/editor/blocks/assessment/shared/publication/projection";

export const FillBlanksResponseSchema = z
  .object({
    blanks: z.record(z.string(), z.string()).default({}),
  })
  .strict();
export type FillBlanksResponse = z.infer<typeof FillBlanksResponseSchema>;

export function projectFillBlanksLearnerNode(node: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(node),
    attrs: omitAttrs(node, ["assessment"]),
    content: readContent(node).map((child) =>
      child.type === "fill_blanks_body"
        ? redactFillBlanksBodyLearnerNode(child)
        : redactCommonAssessmentShellNode(child),
    ),
  };
}

export function projectFillBlanksInteraction(node: JSONContent): AssessmentInteractionContract {
  return {
    kind: "fill-blanks",
    blanks: projectFillBlankInteractionEntries(node),
  };
}

export function projectFillBlanksAssessment(node: JSONContent): AssessmentAnswerKey {
  const entries = projectFillBlankEntries(node);
  const feedbackByBlankId: Record<string, AssessmentFeedbackContent> = {};
  for (const entry of entries) {
    if (entry.feedback) feedbackByBlankId[entry.blankId] = entry.feedback;
  }
  return {
    kind: "fill-blanks",
    blanks: entries.map((blank) => ({
      blankId: blank.blankId,
      acceptedAnswers: blank.acceptedAnswers,
      caseSensitive: blank.caseSensitive,
      trimWhitespace: blank.trimWhitespace,
    })),
    feedbackByBlankId,
    summaryFeedback: FillBlanksPrivateAssessmentSchema.parse(readAttrs(node)["assessment"] ?? {})
      .summaryFeedback,
  };
}

export function projectFillBlanksSettings(settings: unknown): Partial<AssessmentTargetSettings> {
  return optionalStringField("legend", readOptionalString(settings, "legend"));
}

function redactFillBlanksBodyLearnerNode(node: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(node),
    content: readContent(node).map((child) =>
      child.type === "fill_blank"
        ? projectFillBlankLearnerNode(child)
        : redactFillBlankDescendants(child),
    ),
  };
}

function redactFillBlankDescendants(node: JSONContent): JSONContent {
  if (node.type === "fill_blank") return projectFillBlankLearnerNode(node);
  return redactCommonAssessmentShellNode(node, redactFillBlankDescendants);
}

function projectFillBlankLearnerNode(node: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(node),
    attrs: readAttrs(node),
  };
}

function projectFillBlankEntries(node: JSONContent): Array<{
  blankId: string;
  label?: string;
  acceptedAnswers: string[];
  feedback?: AssessmentFeedbackContent;
  caseSensitive: boolean;
  trimWhitespace: boolean;
}> {
  const out: Array<{
    blankId: string;
    label?: string;
    acceptedAnswers: string[];
    feedback?: AssessmentFeedbackContent;
    caseSensitive: boolean;
    trimWhitespace: boolean;
  }> = [];
  const assessment = FillBlanksPrivateAssessmentSchema.parse(readAttrs(node)["assessment"] ?? {});

  walkDescendants(node, (child) => {
    if (child.type !== "fill_blank") return;
    const parsed = FillBlankAttrsSchema.safeParse(readAttrs(child));
    if (!parsed.success || !parsed.data.id) return;
    const privateBlank = assessment.blanksById[parsed.data.id];
    if (!privateBlank) return;

    const answers = privateBlank.acceptedAnswers
      .map((answer) => (privateBlank.trimWhitespace ? answer.trim() : answer))
      .filter((answer) => answer.trim().length > 0);
    if (answers.length === 0) return;

    out.push({
      blankId: parsed.data.id,
      ...(parsed.data.placeholder ? { label: parsed.data.placeholder } : {}),
      acceptedAnswers: answers,
      caseSensitive: privateBlank.caseSensitive,
      trimWhitespace: privateBlank.trimWhitespace,
      ...(privateBlank.feedback ? { feedback: privateBlank.feedback } : {}),
    });
  });

  return out;
}

function projectFillBlankInteractionEntries(
  node: JSONContent,
): Array<{ id: string; label?: string }> {
  const out: Array<{ id: string; label?: string }> = [];
  const seenIds = new Set<string>();

  walkDescendants(node, (child) => {
    if (child.type !== "fill_blank") return;
    const parsed = FillBlankAttrsSchema.safeParse(readAttrs(child));
    const blankId = parsed.success ? parsed.data.id.trim() : "";
    if (!blankId || seenIds.has(blankId)) return;
    seenIds.add(blankId);
    out.push({
      id: blankId,
      ...(parsed.success && parsed.data.placeholder ? { label: parsed.data.placeholder } : {}),
    });
  });

  return out;
}

export function readFillBlanksResponse(response: unknown): FillBlanksResponse {
  return FillBlanksResponseSchema.parse(response);
}

function currentFillBlankIds(
  interaction?: AssessmentInteractionContract,
): readonly string[] | null {
  if (!interaction) return null;
  if (interaction.kind !== "fill-blanks") {
    throw new Error('Fill-blanks response requires a "fill-blanks" interaction.');
  }
  return interaction.blanks.map((blank) => blank.id);
}

export function hasFillBlanksResponse(
  response: unknown,
  interaction?: AssessmentInteractionContract,
): boolean {
  const blanks = readFillBlanksResponse(response).blanks;
  const currentIds = currentFillBlankIds(interaction);
  if (!currentIds) {
    return Object.values(blanks).some((answer) => answer.trim().length > 0);
  }
  return (
    currentIds.length > 0 &&
    currentIds.every((blankId) => (blanks[blankId]?.trim().length ?? 0) > 0)
  );
}

function assertUniqueBlankIds(blanks: readonly { blankId: string; value: string }[]): void {
  const blankIds = blanks.map((blank) => blank.blankId);
  if (new Set(blankIds).size !== blankIds.length) {
    throw new Error("Fill-blanks response ids must be unique.");
  }
}

export function toFillBlanksContractResponse(
  response: unknown,
  interaction?: AssessmentInteractionContract,
) {
  const localBlanks = readFillBlanksResponse(response).blanks;
  const currentIds = currentFillBlankIds(interaction);
  const entries = currentIds
    ? currentIds.flatMap((blankId) =>
        Object.hasOwn(localBlanks, blankId) ? [[blankId, localBlanks[blankId]!] as const] : [],
      )
    : Object.entries(localBlanks);
  const blanks = entries.map(([blankId, value]) => ({
    blankId,
    value,
  }));
  return ContractFillBlanksResponseSchema.parse({ kind: "fill-blanks", blanks });
}

export function fromFillBlanksContractResponse(
  response: AssessmentResponseValue,
  interaction?: AssessmentInteractionContract,
): FillBlanksResponse {
  const canonical = ContractFillBlanksResponseSchema.parse(response);
  assertUniqueBlankIds(canonical.blanks);
  const currentIds = currentFillBlankIds(interaction);
  const currentIdSet = currentIds ? new Set(currentIds) : null;
  return FillBlanksResponseSchema.parse({
    blanks: Object.fromEntries(
      canonical.blanks
        .filter(({ blankId }) => !currentIdSet || currentIdSet.has(blankId))
        .map(({ blankId, value }) => [blankId, value]),
    ),
  });
}

export const fillBlanksResponseCodec: AssessmentCapabilityResponseDefinition<FillBlanksResponse> = {
  schema: FillBlanksResponseSchema,
  toContractResponse: toFillBlanksContractResponse,
  fromContractResponse: fromFillBlanksContractResponse,
  hasResponse: hasFillBlanksResponse,
};

export const fillBlanksAssessmentAdapter: AssessmentBlockAdapter = {
  interactionKind: "fill-blanks",
  choiceMode: null,
  response: fillBlanksResponseCodec,
};
