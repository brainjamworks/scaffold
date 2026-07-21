export interface BuildAssessmentProblemIdInput {
  artifactId: string | null | undefined;
  blockId: string | null | undefined;
}

export type AssessmentProblemIdentityError = "missing-artifact-id" | "missing-block-id";

export type AssessmentProblemIdentityResult =
  | {
      ok: true;
      problemId: string;
    }
  | {
      ok: false;
      reason: AssessmentProblemIdentityError;
    };

function requiredId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildAssessmentProblemId({
  artifactId,
  blockId,
}: BuildAssessmentProblemIdInput): AssessmentProblemIdentityResult {
  const artifact = requiredId(artifactId);
  if (!artifact) {
    return { ok: false, reason: "missing-artifact-id" };
  }

  const block = requiredId(blockId);
  if (!block) {
    return { ok: false, reason: "missing-block-id" };
  }

  return {
    ok: true,
    problemId: `artifact:${artifact}/block:${block}`,
  };
}
