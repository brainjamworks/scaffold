import { AnswerRevealSchema, type AnswerReveal } from "@scaffold/contracts";
import { validateMediaUploadFile } from "@scaffold/core/media-policy";
import {
  AssessmentProblemCommandOutcomeSchema,
  AssessmentQuizCommandOutcomeSchema,
  type AssessmentProblemCommandOutcome,
  type AssessmentQuizCommandOutcome,
  type ScaffoldRuntimePorts,
} from "@scaffold/core/ports";

import { moodleCall, parseJsonField, type MoodleAjaxResponse } from "./api";
import { createMoodleLearnerActivityPort } from "./learner-activity-port";

interface JsonResponse extends MoodleAjaxResponse {
  outcomeJson?: unknown;
  gradePublicationJson?: unknown;
  answerJson?: unknown;
  mediaId?: unknown;
  url?: unknown;
}

interface MoodleQuizGroupIdentity {
  authored: string;
  scoped: string;
}

export function createMoodleRuntimePorts(cmid: number): ScaffoldRuntimePorts {
  return {
    learnerActivity: createMoodleLearnerActivityPort(cmid),

    media: {
      resolve: async (mediaId) => {
        const response = await moodleCall<JsonResponse>("mod_scaffold_resolve_media", {
          cmid,
          mediaid: mediaId,
        });

        if (typeof response.url !== "string") {
          throw new Error("Moodle media resolver did not return a URL");
        }

        return response.url;
      },
      list: async (filter) => {
        const response = await moodleCall<JsonResponse & { items?: unknown }>(
          "mod_scaffold_list_media",
          {
            cmid,
            kind: filter?.kind ?? "",
            mediatype: filter?.mediaType ?? "",
          },
        );

        if (!Array.isArray(response.items)) return [];
        const items = response.items as Array<Record<string, unknown>>;
        return items
          .filter(
            (raw): raw is Record<string, unknown> =>
              typeof raw.id === "string" &&
              typeof raw.url === "string" &&
              typeof raw.mediaType === "string",
          )
          .map((raw) => ({
            id: String(raw.id),
            url: String(raw.url),
            mediaType: raw.mediaType as never,
            fileName: typeof raw.fileName === "string" ? raw.fileName : "",
            mimeType: typeof raw.mimeType === "string" ? raw.mimeType : "",
            size: typeof raw.size === "number" ? raw.size : 0,
            ...(typeof raw.createdAt === "string" ? { createdAt: raw.createdAt } : {}),
          }));
      },
      upload: async (file, meta, onProgress) => {
        const mediaType = validateMediaUploadFile(file, meta.mediaType);
        onProgress?.(0);
        const dataUrl = await readFileAsDataUrl(file);
        onProgress?.(60);

        const response = await moodleCall<JsonResponse>("mod_scaffold_upload_media", {
          cmid,
          mediatype: mediaType,
          filename: file.name,
          contenttype: file.type,
          dataurl: dataUrl,
        });

        if (typeof response.mediaId !== "string" || typeof response.url !== "string") {
          throw new Error("Moodle media upload did not return a media id and URL");
        }

        onProgress?.(100);
        return {
          id: response.mediaId,
          url: response.url,
          mediaType,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
        };
      },
    },

    assessment: {
      type: "runtime",
      check: async (args): Promise<AssessmentProblemCommandOutcome> => {
        const response = await moodleCall<JsonResponse>("mod_scaffold_check_assessment", {
          cmid,
          problemid: args.problemId,
          targetid: args.targetId,
          interactionkind: args.interactionKind,
          responsejson: JSON.stringify(args.response),
          expectedattemptnumber: args.expectedAttemptNumber,
        });
        return AssessmentProblemCommandOutcomeSchema.parse(
          parseJsonField(response.outcomeJson, {}),
        );
      },
      submit: async (args): Promise<AssessmentProblemCommandOutcome> => {
        const response = await moodleCall<JsonResponse>("mod_scaffold_submit_assessment", {
          cmid,
          problemid: args.problemId,
          targetid: args.targetId,
          interactionkind: args.interactionKind,
          responsejson: JSON.stringify(args.response),
          expectedattemptnumber: args.expectedAttemptNumber,
        });
        return AssessmentProblemCommandOutcomeSchema.parse(
          parseJsonField(response.outcomeJson, {}),
        );
      },
      revealHint: async (args): Promise<AssessmentProblemCommandOutcome> => {
        const response = await moodleCall<JsonResponse>("mod_scaffold_reveal_hint", {
          cmid,
          problemid: args.problemId,
          targetid: args.targetId,
          interactionkind: args.interactionKind,
          hintsshown: args.hintsShown,
        });
        return AssessmentProblemCommandOutcomeSchema.parse(
          parseJsonField(response.outcomeJson, {}),
        );
      },
      revealAnswer: async (args): Promise<AnswerReveal> => {
        const response = await moodleCall<JsonResponse>("mod_scaffold_reveal_answer", {
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
          const response = await moodleCall<JsonResponse>("mod_scaffold_start_quiz_attempt", {
            cmid,
            groupid: group.authored,
          });
          return restoreScopedQuizOutcome(response, group);
        },
        submitQuestion: async (args): Promise<AssessmentQuizCommandOutcome> => {
          const group = moodleQuizGroupIdentity(cmid, args.groupId);
          const response = await moodleCall<JsonResponse>("mod_scaffold_submit_quiz_question", {
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
          const response = await moodleCall<JsonResponse>("mod_scaffold_finish_quiz_attempt", {
            cmid,
            attemptid: args.attemptId,
            groupid: group.authored,
            responsesjson: JSON.stringify(args.responsesByTargetId),
          });
          return restoreScopedQuizOutcome(response, group);
        },
        revealAnswers: async (args) => {
          const group = moodleQuizGroupIdentity(cmid, args.groupId);
          const response = await moodleCall<JsonResponse>("mod_scaffold_reveal_quiz_answers", {
            cmid,
            attemptid: args.attemptId,
            groupid: group.authored,
          });
          return restoreScopedQuizOutcome(response, group);
        },
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
  response: JsonResponse,
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("could not read media file"));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("could not read media file"));
    });
    reader.readAsDataURL(file);
  });
}
