import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { useMemo } from "react";

import type { AssessmentInteractionKind, AssessmentTargetSettings } from "@scaffold/contracts";

import type { AssessmentCapabilityResponseDefinition } from "@/editor/blocks/block-definition";
import {
  useAssessmentProblemFacade,
  type AssessmentProblemFacade,
} from "@/runtime/assessment/runtime-facade";

import type { AssessmentExperienceConfig } from "../model/assessment-capability";

export interface AssessmentBlockSetupConfig {
  targetId: string;
  interactionKind: AssessmentInteractionKind;
  feedbackMode: "immediate" | "on_submit";
  maxAttempts: number | null;
  showAnswerEnabled: boolean;
  experience: AssessmentExperienceConfig;
  hintsTotal: number;
  points: number;
  isGraded: boolean;
  legend?: string;
  placeholder?: string;
  maxSelect?: number | null;
  responseCodec: AssessmentCapabilityResponseDefinition;
}

interface UseAssessmentBlockSetupArgs {
  editor?: Editor;
  getPos?: () => number | undefined;
  node: PMNode;
  config: AssessmentBlockSetupConfig;
}

export interface UseAssessmentBlockSetupResult {
  authoredProblemId: string;
  problemId: string;
  facade: AssessmentProblemFacade;
  hasUnsafeIdentity: boolean;
}

export function useAssessmentBlockSetup({
  node,
  config,
}: UseAssessmentBlockSetupArgs): UseAssessmentBlockSetupResult {
  const authoredProblemId = typeof node.attrs["id"] === "string" ? node.attrs["id"] : "";
  const registration = useMemo(() => {
    const settings: AssessmentTargetSettings = {
      feedbackMode: config.feedbackMode,
      isGraded: config.isGraded,
      showAnswer: config.showAnswerEnabled,
      points: config.points,
      maxAttempts: config.maxAttempts,
      ...(config.legend === undefined ? {} : { legend: config.legend }),
      ...(config.placeholder === undefined ? {} : { placeholder: config.placeholder }),
      ...(config.maxSelect === undefined ? {} : { maxSelections: config.maxSelect }),
    };
    return {
      problemId: authoredProblemId,
      targetId: config.targetId,
      interactionKind: config.interactionKind,
      response: config.responseCodec,
      config: {
        experience: config.experience,
        settings,
        hintsTotal: config.hintsTotal,
      },
    };
  }, [authoredProblemId, config]);
  const facade = useAssessmentProblemFacade(registration);

  return {
    authoredProblemId,
    problemId: facade.problemId ?? "",
    facade,
    hasUnsafeIdentity: facade.status === "unsafe-identity",
  };
}
