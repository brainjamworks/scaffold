import {
  AssessmentTargetContractSchema,
  SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
  type AssessmentTargetContract,
} from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";

import {
  createSurfaceAssessmentTargets,
  normalizeSurfaceAssessmentTargetCapability,
} from "./surface-assessment-target";

describe("Surface assessment target capability", () => {
  it("owns an immutable capability shell without changing or invoking callbacks", () => {
    const projectTargets = vi.fn(() => []);
    const projectLearnerSurface = vi.fn((surface) => surface);
    const input = { projectTargets, projectLearnerSurface };

    const normalized = normalizeSurfaceAssessmentTargetCapability(input);

    expect(normalized).not.toBe(input);
    expect(normalized).toMatchObject({ projectTargets, projectLearnerSurface });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(projectTargets).not.toHaveBeenCalled();
    expect(projectLearnerSurface).not.toHaveBeenCalled();
  });

  it("returns an immutable copy of projected targets", () => {
    const target = createTarget();
    const targets = [target];
    const result = createSurfaceAssessmentTargets(targets);

    expect(result).toEqual([target]);
    expect(result).not.toBe(targets);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("throws when a capability projects duplicate target identities", () => {
    const target = createTarget();

    expect(() => createSurfaceAssessmentTargets([target, { ...target }])).toThrow(
      `Surface assessment projection returned duplicate target "${target.targetId}".`,
    );
  });
});

function createTarget(): AssessmentTargetContract {
  const targetId = createEmbeddedNodeId();
  return AssessmentTargetContractSchema.parse({
    schemaVersion: SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
    targetId,
    blockId: targetId,
    blockType: "categorise",
    settings: {
      feedbackMode: "immediate",
      isGraded: true,
      showAnswer: true,
      points: 1,
      maxAttempts: null,
    },
    interaction: { kind: "classify", items: [], categories: [] },
    assessment: { kind: "classify", correctPlacements: [], feedbackByItemId: {} },
  });
}
