import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import type { EmbeddedNodeId } from "@scaffold/contracts";

import { buildAssessmentProblemId, type AssessmentProblemId } from "./assessment-problem-id";

describe("buildAssessmentProblemId", () => {
  it("derives runtime problem scope from artifact and block ids", () => {
    expect(
      buildAssessmentProblemId({
        artifactId: "artifact-1",
        blockId: "block-1",
      }),
    ).toEqual({
      ok: true,
      problemId: "artifact:artifact-1/block:block-1",
    });
    expect(
      buildAssessmentProblemId({
        artifactId: " artifact-1 ",
        blockId: " block-1 ",
      }),
    ).toEqual({
      ok: true,
      problemId: "artifact:artifact-1/block:block-1",
    });
  });

  it("rejects empty identity inputs explicitly", () => {
    expect(
      buildAssessmentProblemId({
        artifactId: "",
        blockId: "block-1",
      }),
    ).toEqual({ ok: false, reason: "missing-artifact-id" });
    expect(
      buildAssessmentProblemId({
        artifactId: "artifact-1",
        blockId: null,
      }),
    ).toEqual({ ok: false, reason: "missing-block-id" });
  });

  it("does not fold component ids into the runtime problem id", () => {
    const result = buildAssessmentProblemId({
      artifactId: "artifact-1",
      blockId: "block-1",
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) {
      throw new Error("expected valid problem identity");
    }
    expect(result.problemId).not.toContain("component:");
    expect(result.problemId).not.toContain("surface:");
    expectTypeOf(result.problemId).toEqualTypeOf<AssessmentProblemId>();
    expectTypeOf<AssessmentProblemId>().not.toMatchTypeOf<EmbeddedNodeId>();
  });
});
