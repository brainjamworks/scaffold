import { AnswerRevealSchema, type AnswerReveal } from "@scaffold/contracts";
import {
  AssessmentProblemCommandOutcomeSchema,
  AssessmentQuizCommandOutcomeSchema,
  type AssessmentPort,
  type AssessmentProblemCommandOutcome,
  type AssessmentQuizCommandOutcome,
} from "@scaffold/core/ports";

import { moodleCall, parseJsonField, type MoodleAjaxResponse } from "./api";

interface AssessmentResponse extends MoodleAjaxResponse {
  outcomeJson?: unknown;
  answerJson?: unknown;
}

interface MoodleQuizGroupIdentity {
  authored: string;
  scoped: string;
}

export function createMoodleAssessmentPort(cmid: number): AssessmentPort {
  return {
    type: "runtime",
    check: async (args): Promise<AssessmentProblemCommandOutcome> => {
      const response = await moodleCall<AssessmentResponse>("mod_scaffold_check_assessment", {
        cmid,
        problemid: args.problemId,
        targetid: args.targetId,
        interactionkind: args.interactionKind,
        responsejson: JSON.stringify(args.response),
        expectedattemptnumber: args.expectedAttemptNumber,
      });
      return AssessmentProblemCommandOutcomeSchema.parse(parseJsonField(response.outcomeJson, {}));
    },
    submit: async (args): Promise<AssessmentProblemCommandOutcome> => {
      const response = await moodleCall<AssessmentResponse>("mod_scaffold_submit_assessment", {
        cmid,
        problemid: args.problemId,
        targetid: args.targetId,
        interactionkind: args.interactionKind,
        responsejson: JSON.stringify(args.response),
        expectedattemptnumber: args.expectedAttemptNumber,
      });
      return AssessmentProblemCommandOutcomeSchema.parse(parseJsonField(response.outcomeJson, {}));
    },
    revealHint: async (args): Promise<AssessmentProblemCommandOutcome> => {
      const response = await moodleCall<AssessmentResponse>("mod_scaffold_reveal_hint", {
        cmid,
        problemid: args.problemId,
        targetid: args.targetId,
        interactionkind: args.interactionKind,
        hintsshown: args.hintsShown,
      });
      return AssessmentProblemCommandOutcomeSchema.parse(parseJsonField(response.outcomeJson, {}));
    },
    revealAnswer: async (args): Promise<AnswerReveal> => {
      const response = await moodleCall<AssessmentResponse>("mod_scaffold_reveal_answer", {
        cmid,
        problemid: args.problemId,
        targetid: args.targetId,
        interactionkind: args.interactionKind,
      });
      return AnswerRevealSchema.parse(parseJsonField(response.answerJson, {}));
    },
    quiz: {
      startAttempt: async (args) => {
        const group = moodleQuizGroupIdentity(cmid, args.groupId);
        const response = await moodleCall<AssessmentResponse>("mod_scaffold_start_quiz_attempt", {
          cmid,
          groupid: group.authored,
        });
        return restoreScopedQuizOutcome(response, group);
      },
      submitQuestion: async (args): Promise<AssessmentQuizCommandOutcome> => {
        const group = moodleQuizGroupIdentity(cmid, args.groupId);
        const response = await moodleCall<AssessmentResponse>("mod_scaffold_submit_quiz_question", {
          cmid,
          attemptid: args.attemptId,
          groupid: group.authored,
          targetid: args.targetId,
          responsejson: JSON.stringify(args.response),
          expectedattemptnumber: args.expectedAttemptNumber,
        });
        return restoreScopedQuizOutcome(response, group);
      },
      finishAttempt: async (args) => {
        const group = moodleQuizGroupIdentity(cmid, args.groupId);
        const response = await moodleCall<AssessmentResponse>("mod_scaffold_finish_quiz_attempt", {
          cmid,
          attemptid: args.attemptId,
          groupid: group.authored,
          responsesjson: JSON.stringify(args.responsesByTargetId),
        });
        return restoreScopedQuizOutcome(response, group);
      },
      revealAnswers: async (args) => {
        const group = moodleQuizGroupIdentity(cmid, args.groupId);
        const response = await moodleCall<AssessmentResponse>("mod_scaffold_reveal_quiz_answers", {
          cmid,
          attemptid: args.attemptId,
          groupid: group.authored,
        });
        return restoreScopedQuizOutcome(response, group);
      },
    },
  };
}

function moodleQuizGroupIdentity(cmid: number, scopedGroupId: string): MoodleQuizGroupIdentity {
  const prefix = `artifact:moodle-cm-${cmid}/group:`;
  if (!scopedGroupId.startsWith(prefix)) {
    throw new Error("Moodle Quiz group id is not scoped to this activity");
  }

  const encodedAuthoredGroupId = scopedGroupId.slice(prefix.length);
  let authoredGroupId: string;
  try {
    authoredGroupId = decodeURIComponent(encodedAuthoredGroupId);
  } catch {
    throw new Error("Moodle Quiz group id is not scoped to this activity");
  }
  if (!authoredGroupId || encodeURIComponent(authoredGroupId) !== encodedAuthoredGroupId) {
    throw new Error("Moodle Quiz group id is not scoped to this activity");
  }

  return { authored: authoredGroupId, scoped: scopedGroupId };
}

function restoreScopedQuizOutcome(
  response: AssessmentResponse,
  group: MoodleQuizGroupIdentity,
): AssessmentQuizCommandOutcome {
  const outcome = AssessmentQuizCommandOutcomeSchema.parse(
    parseJsonField(response.outcomeJson, {}),
  );
  if (outcome.quizAttempt.groupId !== group.authored) {
    throw new Error("Moodle Quiz response group id did not match request");
  }
  return AssessmentQuizCommandOutcomeSchema.parse({
    ...outcome,
    quizAttempt: { ...outcome.quizAttempt, groupId: group.scoped },
  });
}
