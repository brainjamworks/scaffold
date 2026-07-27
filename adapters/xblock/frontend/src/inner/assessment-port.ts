import { AnswerRevealSchema, type AnswerReveal } from "@scaffold/contracts";
import {
  AssessmentProblemCommandOutcomeSchema,
  AssessmentQuizCommandOutcomeSchema,
  type AssessmentProblemCommandOutcome,
  type AssessmentQuizCommandOutcome,
  type AssessmentPort,
} from "@scaffold/core/ports";

import {
  type BridgeHandlerResponse,
  unwrapXBlockHandlerResponse,
} from "./handler-response";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

export function createXBlockAssessmentPort(bridge: XBlockInnerBridge): AssessmentPort {
  return {
    type: "runtime",
    check: async (args): Promise<AssessmentProblemCommandOutcome> => {
      const response = await bridge.request<BridgeHandlerResponse>("assessment.check", args);
      return AssessmentProblemCommandOutcomeSchema.parse(unwrapXBlockHandlerResponse(response));
    },
    submit: async (args): Promise<AssessmentProblemCommandOutcome> => {
      const response = await bridge.request<BridgeHandlerResponse>("assessment.submit", args);
      return AssessmentProblemCommandOutcomeSchema.parse(unwrapXBlockHandlerResponse(response));
    },
    revealHint: async (args): Promise<AssessmentProblemCommandOutcome> => {
      const response = await bridge.request<BridgeHandlerResponse>("assessment.revealHint", args);
      return AssessmentProblemCommandOutcomeSchema.parse(unwrapXBlockHandlerResponse(response));
    },
    revealAnswer: async (args): Promise<AnswerReveal> => {
      const response = await bridge.request<BridgeHandlerResponse>(
        "assessment.revealAnswer",
        args,
      );
      return AnswerRevealSchema.parse(unwrapXBlockHandlerResponse(response));
    },
    quiz: {
      startAttempt: async (args): Promise<AssessmentQuizCommandOutcome> => {
        const response = await bridge.request<BridgeHandlerResponse>(
          "assessment.quiz.startAttempt",
          args,
        );
        return AssessmentQuizCommandOutcomeSchema.parse(unwrapXBlockHandlerResponse(response));
      },
      submitQuestion: async (args): Promise<AssessmentQuizCommandOutcome> => {
        const response = await bridge.request<BridgeHandlerResponse>(
          "assessment.quiz.submitQuestion",
          args,
        );
        return AssessmentQuizCommandOutcomeSchema.parse(unwrapXBlockHandlerResponse(response));
      },
      finishAttempt: async (args): Promise<AssessmentQuizCommandOutcome> => {
        const response = await bridge.request<BridgeHandlerResponse>(
          "assessment.quiz.finishAttempt",
          args,
        );
        return AssessmentQuizCommandOutcomeSchema.parse(unwrapXBlockHandlerResponse(response));
      },
      revealAnswers: async (args): Promise<AssessmentQuizCommandOutcome> => {
        const response = await bridge.request<BridgeHandlerResponse>(
          "assessment.quiz.revealAnswers",
          args,
        );
        return AssessmentQuizCommandOutcomeSchema.parse(unwrapXBlockHandlerResponse(response));
      },
    },
  };
}
