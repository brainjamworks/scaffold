import type { AssessmentTargetContract } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

export interface SurfaceAssessmentTargetCapability {
  readonly projectTargets: (surface: JSONContent) => readonly AssessmentTargetContract[];
  readonly projectLearnerSurface: (surface: JSONContent) => JSONContent;
}

export function normalizeSurfaceAssessmentTargetCapability(
  capability: SurfaceAssessmentTargetCapability | undefined,
  surfaceDefinitionId?: string,
): SurfaceAssessmentTargetCapability | undefined {
  if (capability === undefined) return undefined;

  if (
    !isRecord(capability) ||
    !hasOnlyKeys(capability, ["projectTargets", "projectLearnerSurface"]) ||
    typeof capability["projectTargets"] !== "function" ||
    typeof capability["projectLearnerSurface"] !== "function"
  ) {
    const owner = surfaceDefinitionId ? `Surface definition "${surfaceDefinitionId}"` : "Surface";
    throw new Error(`${owner} has an invalid assessment target capability.`);
  }

  return Object.freeze({
    projectTargets: capability["projectTargets"],
    projectLearnerSurface: capability["projectLearnerSurface"],
  });
}

export function createSurfaceAssessmentTargets(
  targets: readonly AssessmentTargetContract[],
): readonly AssessmentTargetContract[] {
  const targetIds = new Set<string>();
  for (const target of targets) {
    if (targetIds.has(target.targetId)) {
      throw new Error(
        `Surface assessment projection returned duplicate target "${target.targetId}".`,
      );
    }
    targetIds.add(target.targetId);
  }

  return Object.freeze([...targets]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}
